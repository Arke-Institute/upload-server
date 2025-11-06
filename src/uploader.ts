/**
 * Main ArkeUploader SDK class
 */

import type {
  UploaderConfig,
  UploadOptions,
  UploadProgress,
  BatchResult,
} from './types/config.js';
import type { FileInfo } from './types/file.js';
import { WorkerClient } from './lib/worker-client-fetch.js';
import { detectPlatform, type PlatformScanner, type FileSource } from './platforms/common.js';
import { uploadSimple } from './lib/simple-fetch.js';
import { uploadMultipart } from './lib/multipart-fetch.js';
import { ValidationError } from './utils/errors.js';
import { validateBatchSize } from './lib/validation.js';

const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5 MB

/**
 * Upload client for Arke Institute's ingest service
 * Works in Node.js, browsers, and other JavaScript runtimes
 */
export class ArkeUploader {
  private config: UploaderConfig;
  private workerClient: WorkerClient;
  private scanner: PlatformScanner | null = null;
  private platform: 'node' | 'browser' | 'unknown';

  constructor(config: UploaderConfig) {
    this.config = {
      rootPath: '/',
      parallelUploads: 5,
      parallelParts: 3,
      ...config,
    };

    this.workerClient = new WorkerClient({
      baseUrl: config.workerUrl,
      debug: false,
    });

    this.platform = detectPlatform();
  }

  /**
   * Get platform-specific scanner
   */
  private async getScanner(): Promise<PlatformScanner> {
    if (this.scanner) {
      return this.scanner;
    }

    if (this.platform === 'node') {
      const { NodeScanner } = await import('./platforms/node.js');
      this.scanner = new NodeScanner();
    } else if (this.platform === 'browser') {
      const { BrowserScanner } = await import('./platforms/browser.js');
      this.scanner = new BrowserScanner();
    } else {
      throw new ValidationError('Unsupported platform');
    }

    return this.scanner;
  }

  /**
   * Upload a batch of files
   * @param source - Directory path (Node.js) or File[]/FileList (browser)
   * @param options - Upload options
   */
  async uploadBatch(
    source: FileSource | FileSource[],
    options: UploadOptions = {}
  ): Promise<BatchResult> {
    const startTime = Date.now();
    const { onProgress, dryRun = false } = options;

    // Phase 1: Scanning
    this.reportProgress(onProgress, {
      phase: 'scanning',
      filesTotal: 0,
      filesUploaded: 0,
      bytesTotal: 0,
      bytesUploaded: 0,
      percentComplete: 0,
    });

    const scanner = await this.getScanner();
    const files = await scanner.scanFiles(source, {
      rootPath: this.config.rootPath || '/',
      followSymlinks: true,
      defaultProcessingConfig: this.config.processing,
    });

    if (files.length === 0) {
      throw new ValidationError('No files found to upload');
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    validateBatchSize(totalSize);

    if (dryRun) {
      return {
        batchId: 'dry-run',
        filesUploaded: files.length,
        bytesUploaded: totalSize,
        durationMs: Date.now() - startTime,
      };
    }

    // Phase 2: Initialize batch
    const { batch_id } = await this.workerClient.initBatch({
      uploader: this.config.uploader,
      root_path: this.config.rootPath || '/',
      parent_pi: this.config.parentPi || '',
      metadata: this.config.metadata,
      file_count: files.length,
      total_size: totalSize,
    });

    // Phase 3: Upload files
    this.reportProgress(onProgress, {
      phase: 'uploading',
      filesTotal: files.length,
      filesUploaded: 0,
      bytesTotal: totalSize,
      bytesUploaded: 0,
      percentComplete: 0,
    });

    let filesUploaded = 0;
    let bytesUploaded = 0;

    // Upload files with concurrency control
    await this.uploadFilesWithConcurrency(
      batch_id,
      files,
      source,
      this.config.parallelUploads || 5,
      (file, bytes) => {
        filesUploaded++;
        bytesUploaded += bytes;

        this.reportProgress(onProgress, {
          phase: 'uploading',
          filesTotal: files.length,
          filesUploaded,
          bytesTotal: totalSize,
          bytesUploaded,
          currentFile: file.fileName,
          percentComplete: Math.round((bytesUploaded / totalSize) * 100),
        });
      }
    );

    // Phase 4: Finalize
    this.reportProgress(onProgress, {
      phase: 'finalizing',
      filesTotal: files.length,
      filesUploaded,
      bytesTotal: totalSize,
      bytesUploaded,
      percentComplete: 99,
    });

    await this.workerClient.finalizeBatch(batch_id);

    // Complete
    this.reportProgress(onProgress, {
      phase: 'complete',
      filesTotal: files.length,
      filesUploaded,
      bytesTotal: totalSize,
      bytesUploaded,
      percentComplete: 100,
    });

    return {
      batchId: batch_id,
      filesUploaded,
      bytesUploaded,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Upload files with controlled concurrency
   */
  private async uploadFilesWithConcurrency(
    batchId: string,
    files: FileInfo[],
    source: FileSource | FileSource[],
    concurrency: number,
    onFileComplete: (file: FileInfo, bytes: number) => void
  ): Promise<void> {
    const queue = [...files];
    const workers: Promise<void>[] = [];

    const processNext = async () => {
      while (queue.length > 0) {
        const file = queue.shift()!;
        await this.uploadSingleFile(batchId, file, source);
        onFileComplete(file, file.size);
      }
    };

    // Start concurrent workers
    for (let i = 0; i < Math.min(concurrency, files.length); i++) {
      workers.push(processNext());
    }

    await Promise.all(workers);
  }

  /**
   * Upload a single file
   */
  private async uploadSingleFile(
    batchId: string,
    file: FileInfo,
    source: FileSource | FileSource[]
  ): Promise<void> {
    // Request presigned URL(s)
    const uploadInfo = await this.workerClient.startFileUpload(batchId, {
      file_name: file.fileName,
      file_size: file.size,
      logical_path: file.logicalPath,
      content_type: file.contentType,
      cid: file.cid,
      processing_config: file.processingConfig,
    });

    // Get file data
    const fileData = await this.getFileData(file, source);

    // Upload to R2
    if (uploadInfo.upload_type === 'simple') {
      await uploadSimple(fileData, uploadInfo.presigned_url!);
    } else {
      // Multipart upload - map presigned URLs to array of URL strings
      const partUrls = uploadInfo.presigned_urls!.map((p) => p.url);
      const parts = await uploadMultipart(fileData, partUrls, this.config.parallelParts || 3);

      // Complete multipart upload
      await this.workerClient.completeFileUpload(batchId, {
        r2_key: uploadInfo.r2_key,
        upload_id: uploadInfo.upload_id!,
        parts,
      });

      return;
    }

    // Complete simple upload
    await this.workerClient.completeFileUpload(batchId, {
      r2_key: uploadInfo.r2_key,
    });
  }

  /**
   * Get file data based on platform
   */
  private async getFileData(
    file: FileInfo,
    source: FileSource | FileSource[]
  ): Promise<ArrayBuffer> {
    if (this.platform === 'node') {
      // Read from filesystem
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(file.localPath);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } else if (this.platform === 'browser') {
      // Find the File object from source
      const files = Array.isArray(source) ? source : [source];
      const browserFile = files.find(
        (f) => f instanceof File && f.name === file.fileName
      ) as File | undefined;

      if (!browserFile) {
        throw new Error(`Could not find browser File object for ${file.fileName}`);
      }

      return browserFile.arrayBuffer();
    }

    throw new Error('Unsupported platform for file reading');
  }

  /**
   * Report progress to callback
   */
  private reportProgress(
    callback: ((progress: UploadProgress) => void) | undefined,
    progress: UploadProgress
  ): void {
    if (callback) {
      callback(progress);
    }
  }
}

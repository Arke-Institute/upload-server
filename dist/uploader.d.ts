/**
 * Main ArkeUploader SDK class
 */
import type { UploaderConfig, UploadOptions, BatchResult } from './types/config.js';
import { type FileSource } from './platforms/common.js';
/**
 * Upload client for Arke Institute's ingest service
 * Works in Node.js, browsers, and other JavaScript runtimes
 */
export declare class ArkeUploader {
    private config;
    private workerClient;
    private scanner;
    private platform;
    constructor(config: UploaderConfig);
    /**
     * Get platform-specific scanner
     */
    private getScanner;
    /**
     * Upload a batch of files
     * @param source - Directory path (Node.js) or File[]/FileList (browser)
     * @param options - Upload options
     */
    uploadBatch(source: FileSource | FileSource[], options?: UploadOptions): Promise<BatchResult>;
    /**
     * Upload files with controlled concurrency
     */
    private uploadFilesWithConcurrency;
    /**
     * Upload a single file
     */
    private uploadSingleFile;
    /**
     * Get file data based on platform
     */
    private getFileData;
    /**
     * Report progress to callback
     */
    private reportProgress;
}
//# sourceMappingURL=uploader.d.ts.map
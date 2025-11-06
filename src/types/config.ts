/**
 * SDK Configuration Types
 */

import type { ProcessingConfig } from './processing.js';

/**
 * Configuration for the ArkeUploader SDK
 */
export interface UploaderConfig {
  /**
   * URL of the Arke ingest worker API
   * @example 'https://ingest.arke.institute'
   */
  workerUrl: string;

  /**
   * Name of person/service uploading files
   */
  uploader: string;

  /**
   * Root path in the archive hierarchy
   * @default '/'
   */
  rootPath?: string;

  /**
   * Parent persistent identifier (for hierarchical archives)
   */
  parentPi?: string;

  /**
   * Custom metadata to attach to batch
   */
  metadata?: Record<string, unknown>;

  /**
   * Processing options (OCR, IIIF, etc.)
   */
  processing?: ProcessingConfig;

  /**
   * Number of files to upload in parallel
   * @default 5
   */
  parallelUploads?: number;

  /**
   * Number of parts to upload in parallel for multipart uploads
   * @default 3
   */
  parallelParts?: number;
}

/**
 * Options for batch upload operation
 */
export interface UploadOptions {
  /**
   * Progress callback for upload tracking
   */
  onProgress?: (progress: UploadProgress) => void;

  /**
   * Dry run mode - validate without uploading
   * @default false
   */
  dryRun?: boolean;
}

/**
 * Progress information during upload
 */
export interface UploadProgress {
  /**
   * Current phase of upload
   */
  phase: 'scanning' | 'uploading' | 'finalizing' | 'complete';

  /**
   * Total number of files to upload
   */
  filesTotal: number;

  /**
   * Number of files uploaded so far
   */
  filesUploaded: number;

  /**
   * Total bytes to upload
   */
  bytesTotal: number;

  /**
   * Bytes uploaded so far
   */
  bytesUploaded: number;

  /**
   * Current file being processed
   */
  currentFile?: string;

  /**
   * Percentage complete (0-100)
   */
  percentComplete: number;
}

/**
 * Result of batch upload
 */
export interface BatchResult {
  /**
   * Batch ID assigned by worker
   */
  batchId: string;

  /**
   * Number of files uploaded
   */
  filesUploaded: number;

  /**
   * Total bytes uploaded
   */
  bytesUploaded: number;

  /**
   * Upload duration in milliseconds
   */
  durationMs: number;
}

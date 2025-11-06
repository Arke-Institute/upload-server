/**
 * Arke Upload Client SDK
 * Portable upload client for Arke Institute's ingest service
 */

// Main SDK class
export { ArkeUploader } from './uploader.js';

// Type exports
export type {
  // Config types
  UploaderConfig,
  UploadOptions,
  UploadProgress,
  BatchResult,

  // Worker API types
  InitBatchRequest,
  InitBatchResponse,
  StartFileUploadRequest,
  StartFileUploadResponse,
  PresignedUrlInfo,
  PartInfo,
  CompleteFileUploadRequest,
  CompleteFileUploadResponse,
  FinalizeBatchResponse,

  // Batch types
  BatchContext,
  UploadConfig,
  CheckpointData,

  // File types
  FileInfo,
  ScanResult,
  UploadTask,

  // Processing types
  ProcessingConfig,
} from './types/index.js';

// Error classes
export {
  ValidationError,
  ScanError,
  WorkerAPIError,
  NetworkError,
  UploadError,
} from './utils/errors.js';

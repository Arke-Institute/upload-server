/**
 * Server-specific types for upload API
 */

import type { UploadConfig } from './batch.js';
import type { ProcessingConfig } from './processing.js';
import type { PreprocessorConfig } from './preprocessor.js';

/**
 * Upload session stored in memory
 */
export interface UploadSession {
  sessionId: string;
  batchId?: string; // Worker batch ID, available after processing starts
  config: UploadConfig;
  status: SessionStatus;
  uploadDir: string;
  filesReceived: number;
  totalSize: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  progress?: UploadProgress;
  errors: string[];
}

/**
 * Session status lifecycle
 */
export type SessionStatus =
  | 'initialized'   // Session created, waiting for files
  | 'receiving'     // Files being uploaded to server
  | 'ready'         // All files received, ready to process
  | 'processing'    // Running preprocessing/upload pipeline
  | 'completed'     // Successfully finished
  | 'failed'        // Error occurred
  | 'cancelled';    // User cancelled

/**
 * Upload progress information
 */
export interface UploadProgress {
  phase: ProcessingPhase;
  filesTotal: number;
  filesProcessed: number;
  filesUploaded: number;
  filesFailed: number;
  bytesTotal: number;
  bytesProcessed: number;
  bytesUploaded: number;
  percentComplete: number;
  currentFile?: string;
  estimatedTimeRemaining?: number;
}

/**
 * Processing phase
 */
export type ProcessingPhase =
  | 'scanning'
  | 'preprocessing'
  | 'computing_cids'
  | 'uploading'
  | 'finalizing';

/**
 * API Request/Response Types
 */

export interface InitUploadRequest {
  uploader: string;
  rootPath?: string;
  parentPi?: string;
  metadata?: Record<string, any>;
  processing?: ProcessingConfig;
  preprocessor?: PreprocessorConfig;
  parallelUploads?: number;
  parallelParts?: number;
}

export interface InitUploadResponse {
  sessionId: string;
  uploadUrl: string;
  statusUrl: string;
  expiresAt: string;
}

export interface UploadFilesResponse {
  sessionId: string;
  filesReceived: number;
  totalSize: number;
  status: SessionStatus;
}

export interface ProcessUploadRequest {
  dryRun?: boolean;
}

export interface ProcessUploadResponse {
  sessionId: string;
  status: SessionStatus;
  message: string;
}

export interface StatusResponse {
  sessionId: string;
  batchId?: string;
  status: SessionStatus;
  phase?: ProcessingPhase;
  progress?: UploadProgress;
  errors: string[];
  startedAt: string;
  updatedAt: string;
}

export interface CancelUploadResponse {
  sessionId: string;
  status: SessionStatus;
  message: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  storage: {
    tmpDirectory: string;
    available: number;
    used: number;
  };
  worker: {
    url: string;
    reachable: boolean;
  };
}

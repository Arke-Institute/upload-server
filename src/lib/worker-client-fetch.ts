/**
 * API client for communicating with the Arke Ingest Worker (fetch-based)
 */

import type {
  InitBatchRequest,
  InitBatchResponse,
  StartFileUploadRequest,
  StartFileUploadResponse,
  CompleteFileUploadRequest,
  CompleteFileUploadResponse,
  FinalizeBatchResponse,
  ErrorResponse,
} from '../types/api.js';
import { WorkerAPIError, NetworkError } from '../utils/errors.js';
import { retryWithBackoff } from '../utils/retry.js';

export interface WorkerClientConfig {
  baseUrl: string;
  timeout?: number;
  maxRetries?: number;
  debug?: boolean;
}

export class WorkerClient {
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private debug: boolean;

  constructor(config: WorkerClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout ?? 30000; // 30 seconds
    this.maxRetries = config.maxRetries ?? 3;
    this.debug = config.debug ?? false;
  }

  /**
   * Make HTTP request with fetch
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    if (this.debug) {
      console.log(`HTTP Request: ${method} ${url}`, body);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (this.debug) {
        console.log(`HTTP Response: ${response.status}`, data);
      }

      if (!response.ok) {
        const errorData = data as ErrorResponse;
        throw new WorkerAPIError(
          errorData.error || 'Request failed',
          response.status,
          errorData.details
        );
      }

      return data as T;
    } catch (error: any) {
      if (error instanceof WorkerAPIError) {
        throw error;
      }

      if (error.name === 'AbortError') {
        throw new NetworkError(`Request timeout after ${this.timeout}ms`);
      }

      throw new NetworkError(`Network request failed: ${error.message}`);
    }
  }

  /**
   * Initialize a new batch upload
   */
  async initBatch(params: InitBatchRequest): Promise<InitBatchResponse> {
    return retryWithBackoff(
      () => this.request<InitBatchResponse>('POST', '/api/batches/init', params),
      { maxRetries: this.maxRetries }
    );
  }

  /**
   * Request presigned URLs for a file upload
   */
  async startFileUpload(
    batchId: string,
    params: StartFileUploadRequest
  ): Promise<StartFileUploadResponse> {
    return retryWithBackoff(
      () =>
        this.request<StartFileUploadResponse>(
          'POST',
          `/api/batches/${batchId}/files/start`,
          params
        ),
      { maxRetries: this.maxRetries }
    );
  }

  /**
   * Mark a file upload as complete
   */
  async completeFileUpload(
    batchId: string,
    params: CompleteFileUploadRequest
  ): Promise<CompleteFileUploadResponse> {
    return retryWithBackoff(
      () =>
        this.request<CompleteFileUploadResponse>(
          'POST',
          `/api/batches/${batchId}/files/complete`,
          params
        ),
      { maxRetries: this.maxRetries }
    );
  }

  /**
   * Finalize the batch after all files are uploaded
   */
  async finalizeBatch(batchId: string): Promise<FinalizeBatchResponse> {
    return retryWithBackoff(
      () =>
        this.request<FinalizeBatchResponse>(
          'POST',
          `/api/batches/${batchId}/finalize`,
          {}
        ),
      { maxRetries: this.maxRetries }
    );
  }
}

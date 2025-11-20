/**
 * API client for communicating with the Arke Ingest Worker (fetch-based)
 */
import type { InitBatchRequest, InitBatchResponse, StartFileUploadRequest, StartFileUploadResponse, CompleteFileUploadRequest, CompleteFileUploadResponse, FinalizeBatchResponse } from '../types/api.js';
export interface WorkerClientConfig {
    baseUrl: string;
    timeout?: number;
    maxRetries?: number;
    retryInitialDelay?: number;
    retryMaxDelay?: number;
    retryJitter?: boolean;
    debug?: boolean;
}
export declare class WorkerClient {
    private baseUrl;
    private timeout;
    private maxRetries;
    private retryInitialDelay;
    private retryMaxDelay;
    private retryJitter;
    private debug;
    constructor(config: WorkerClientConfig);
    /**
     * Make HTTP request with fetch
     */
    private request;
    /**
     * Initialize a new batch upload
     */
    initBatch(params: InitBatchRequest): Promise<InitBatchResponse>;
    /**
     * Request presigned URLs for a file upload
     */
    startFileUpload(batchId: string, params: StartFileUploadRequest): Promise<StartFileUploadResponse>;
    /**
     * Mark a file upload as complete
     */
    completeFileUpload(batchId: string, params: CompleteFileUploadRequest): Promise<CompleteFileUploadResponse>;
    /**
     * Finalize the batch after all files are uploaded
     */
    finalizeBatch(batchId: string): Promise<FinalizeBatchResponse>;
}
//# sourceMappingURL=worker-client-fetch.d.ts.map
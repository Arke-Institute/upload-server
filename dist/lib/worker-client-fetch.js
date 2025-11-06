/**
 * API client for communicating with the Arke Ingest Worker (fetch-based)
 */
import { WorkerAPIError, NetworkError } from '../utils/errors.js';
import { retryWithBackoff } from '../utils/retry.js';
export class WorkerClient {
    baseUrl;
    timeout;
    maxRetries;
    debug;
    constructor(config) {
        this.baseUrl = config.baseUrl;
        this.timeout = config.timeout ?? 30000; // 30 seconds
        this.maxRetries = config.maxRetries ?? 3;
        this.debug = config.debug ?? false;
    }
    /**
     * Make HTTP request with fetch
     */
    async request(method, path, body) {
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
                const errorData = data;
                throw new WorkerAPIError(errorData.error || 'Request failed', response.status, errorData.details);
            }
            return data;
        }
        catch (error) {
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
    async initBatch(params) {
        return retryWithBackoff(() => this.request('POST', '/api/batches/init', params), { maxRetries: this.maxRetries });
    }
    /**
     * Request presigned URLs for a file upload
     */
    async startFileUpload(batchId, params) {
        return retryWithBackoff(() => this.request('POST', `/api/batches/${batchId}/files/start`, params), { maxRetries: this.maxRetries });
    }
    /**
     * Mark a file upload as complete
     */
    async completeFileUpload(batchId, params) {
        return retryWithBackoff(() => this.request('POST', `/api/batches/${batchId}/files/complete`, params), { maxRetries: this.maxRetries });
    }
    /**
     * Finalize the batch after all files are uploaded
     */
    async finalizeBatch(batchId) {
        return retryWithBackoff(() => this.request('POST', `/api/batches/${batchId}/finalize`, {}), { maxRetries: this.maxRetries });
    }
}
//# sourceMappingURL=worker-client-fetch.js.map
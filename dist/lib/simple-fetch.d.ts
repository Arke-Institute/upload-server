/**
 * Simple upload logic for files < 5 MB (fetch-based)
 */
export interface SimpleUploadOptions {
    maxRetries?: number;
    retryInitialDelay?: number;
    retryMaxDelay?: number;
    retryJitter?: boolean;
}
/**
 * Upload file data using simple PUT to presigned URL
 */
export declare function uploadSimple(fileData: ArrayBuffer, presignedUrl: string, contentType?: string, options?: SimpleUploadOptions): Promise<void>;
//# sourceMappingURL=simple-fetch.d.ts.map
/**
 * Simple upload logic for files < 5 MB (fetch-based)
 */
/**
 * Upload file data using simple PUT to presigned URL
 */
export declare function uploadSimple(fileData: ArrayBuffer, presignedUrl: string, contentType?: string, maxRetries?: number): Promise<void>;
//# sourceMappingURL=simple-fetch.d.ts.map
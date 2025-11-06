/**
 * Multipart upload logic for files ≥ 5 MB (fetch-based)
 */
import type { PartInfo } from '../types/api.js';
/**
 * Upload file data using multipart upload with presigned URLs
 * @param fileData - File data as ArrayBuffer
 * @param presignedUrls - Array of presigned URLs for each part
 * @param concurrency - Number of parts to upload in parallel
 * @returns Array of PartInfo with ETags
 */
export declare function uploadMultipart(fileData: ArrayBuffer, presignedUrls: string[], concurrency?: number): Promise<PartInfo[]>;
//# sourceMappingURL=multipart-fetch.d.ts.map
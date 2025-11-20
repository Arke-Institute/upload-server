/**
 * Multipart upload logic for files ≥ 5 MB (fetch-based)
 */
import { UploadError } from '../utils/errors.js';
import { retryWithBackoff } from '../utils/retry.js';
const DEFAULT_PART_SIZE = 10 * 1024 * 1024; // 10 MB
/**
 * Upload file data using multipart upload with presigned URLs
 * @param fileData - File data as ArrayBuffer
 * @param presignedUrls - Array of presigned URLs for each part
 * @param concurrency - Number of parts to upload in parallel
 * @param options - Upload retry options
 * @returns Array of PartInfo with ETags
 */
export async function uploadMultipart(fileData, presignedUrls, concurrency = 3, options = {}) {
    const totalSize = fileData.byteLength;
    const partSize = Math.ceil(totalSize / presignedUrls.length);
    // Create upload tasks for each part
    const parts = [];
    const queue = [];
    const { maxRetries = 3, retryInitialDelay, retryMaxDelay, retryJitter } = options;
    for (let i = 0; i < presignedUrls.length; i++) {
        const partNumber = i + 1;
        const start = i * partSize;
        const end = Math.min(start + partSize, totalSize);
        const partData = fileData.slice(start, end);
        const url = presignedUrls[i];
        queue.push(async () => {
            const etag = await uploadPart(partData, url, partNumber, maxRetries, {
                initialDelay: retryInitialDelay,
                maxDelay: retryMaxDelay,
                jitter: retryJitter,
            });
            parts.push({ part_number: partNumber, etag });
        });
    }
    // Execute uploads with concurrency control
    await executeWithConcurrency(queue, concurrency);
    // Sort parts by part number
    parts.sort((a, b) => a.part_number - b.part_number);
    return parts;
}
/**
 * Upload a single part
 */
async function uploadPart(partData, presignedUrl, partNumber, maxRetries = 3, retryOptions = {}) {
    return retryWithBackoff(async () => {
        let response;
        try {
            response = await fetch(presignedUrl, {
                method: 'PUT',
                body: partData,
            });
        }
        catch (error) {
            // Network-level errors (connection refused, timeout, etc.)
            throw new UploadError(`Part ${partNumber} upload failed: ${error.message}`, undefined, undefined, error);
        }
        if (!response.ok) {
            // Extract Retry-After header for 429 responses
            const retryAfter = response.headers.get('retry-after');
            const error = new UploadError(`Part ${partNumber} upload failed with status ${response.status}: ${response.statusText}`, undefined, response.status);
            // Attach retry-after if present (convert to seconds)
            if (retryAfter && response.status === 429) {
                error.retryAfter = parseInt(retryAfter, 10);
            }
            throw error;
        }
        // Get ETag from response headers
        const etag = response.headers.get('etag');
        if (!etag) {
            throw new UploadError(`Part ${partNumber} upload succeeded but no ETag returned`, undefined, response.status);
        }
        // Clean ETag (remove quotes if present)
        return etag.replace(/"/g, '');
    }, {
        maxRetries,
        initialDelay: retryOptions.initialDelay,
        maxDelay: retryOptions.maxDelay,
        jitter: retryOptions.jitter,
    });
}
/**
 * Execute tasks with controlled concurrency
 */
async function executeWithConcurrency(tasks, concurrency) {
    const queue = [...tasks];
    const workers = [];
    const processNext = async () => {
        while (queue.length > 0) {
            const task = queue.shift();
            await task();
        }
    };
    // Start concurrent workers
    for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
        workers.push(processNext());
    }
    await Promise.all(workers);
}
//# sourceMappingURL=multipart-fetch.js.map
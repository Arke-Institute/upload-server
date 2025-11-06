/**
 * Multipart upload logic for files ≥ 5 MB (fetch-based)
 */

import type { PartInfo } from '../types/api.js';
import { UploadError } from '../utils/errors.js';
import { retryWithBackoff } from '../utils/retry.js';

const DEFAULT_PART_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Upload file data using multipart upload with presigned URLs
 * @param fileData - File data as ArrayBuffer
 * @param presignedUrls - Array of presigned URLs for each part
 * @param concurrency - Number of parts to upload in parallel
 * @returns Array of PartInfo with ETags
 */
export async function uploadMultipart(
  fileData: ArrayBuffer,
  presignedUrls: string[],
  concurrency: number = 3
): Promise<PartInfo[]> {
  const totalSize = fileData.byteLength;
  const partSize = Math.ceil(totalSize / presignedUrls.length);

  // Create upload tasks for each part
  const parts: PartInfo[] = [];
  const queue: Array<() => Promise<void>> = [];

  for (let i = 0; i < presignedUrls.length; i++) {
    const partNumber = i + 1;
    const start = i * partSize;
    const end = Math.min(start + partSize, totalSize);
    const partData = fileData.slice(start, end);
    const url = presignedUrls[i];

    queue.push(async () => {
      const etag = await uploadPart(partData, url, partNumber);
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
async function uploadPart(
  partData: ArrayBuffer,
  presignedUrl: string,
  partNumber: number,
  maxRetries: number = 3
): Promise<string> {
  return retryWithBackoff(
    async () => {
      try {
        const response = await fetch(presignedUrl, {
          method: 'PUT',
          body: partData,
        });

        if (!response.ok) {
          throw new UploadError(
            `Part ${partNumber} upload failed with status ${response.status}: ${response.statusText}`
          );
        }

        // Get ETag from response headers
        const etag = response.headers.get('etag');
        if (!etag) {
          throw new UploadError(`Part ${partNumber} upload succeeded but no ETag returned`);
        }

        // Clean ETag (remove quotes if present)
        return etag.replace(/"/g, '');
      } catch (error: any) {
        if (error instanceof UploadError) {
          throw error;
        }
        throw new UploadError(`Part ${partNumber} upload failed: ${error.message}`);
      }
    },
    { maxRetries }
  );
}

/**
 * Execute tasks with controlled concurrency
 */
async function executeWithConcurrency(
  tasks: Array<() => Promise<void>>,
  concurrency: number
): Promise<void> {
  const queue = [...tasks];
  const workers: Promise<void>[] = [];

  const processNext = async () => {
    while (queue.length > 0) {
      const task = queue.shift()!;
      await task();
    }
  };

  // Start concurrent workers
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(processNext());
  }

  await Promise.all(workers);
}

/**
 * Simple upload logic for files < 5 MB (fetch-based)
 */

import { UploadError } from '../utils/errors.js';
import { retryWithBackoff } from '../utils/retry.js';

/**
 * Upload file data using simple PUT to presigned URL
 */
export async function uploadSimple(
  fileData: ArrayBuffer,
  presignedUrl: string,
  contentType?: string,
  maxRetries: number = 3
): Promise<void> {
  await retryWithBackoff(
    async () => {
      try {
        const response = await fetch(presignedUrl, {
          method: 'PUT',
          body: fileData,
          headers: {
            ...(contentType ? { 'Content-Type': contentType } : {}),
          },
        });

        if (!response.ok) {
          throw new UploadError(
            `Upload failed with status ${response.status}: ${response.statusText}`
          );
        }
      } catch (error: any) {
        if (error instanceof UploadError) {
          throw error;
        }
        throw new UploadError(`Upload failed: ${error.message}`);
      }
    },
    { maxRetries }
  );
}

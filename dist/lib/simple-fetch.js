/**
 * Simple upload logic for files < 5 MB (fetch-based)
 */
import { UploadError } from '../utils/errors.js';
import { retryWithBackoff } from '../utils/retry.js';
/**
 * Upload file data using simple PUT to presigned URL
 */
export async function uploadSimple(fileData, presignedUrl, contentType, maxRetries = 3) {
    await retryWithBackoff(async () => {
        try {
            const response = await fetch(presignedUrl, {
                method: 'PUT',
                body: fileData,
                headers: {
                    ...(contentType ? { 'Content-Type': contentType } : {}),
                },
            });
            if (!response.ok) {
                throw new UploadError(`Upload failed with status ${response.status}: ${response.statusText}`);
            }
        }
        catch (error) {
            if (error instanceof UploadError) {
                throw error;
            }
            throw new UploadError(`Upload failed: ${error.message}`);
        }
    }, { maxRetries });
}
//# sourceMappingURL=simple-fetch.js.map
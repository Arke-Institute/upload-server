/**
 * Retry logic with exponential backoff
 */
import { isRetryableError } from './errors.js';
const DEFAULT_OPTIONS = {
    maxRetries: 3,
    initialDelay: 1000, // 1 second
    maxDelay: 30000, // 30 seconds
    shouldRetry: isRetryableError,
};
/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff(fn, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError;
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            // Don't retry if we've exhausted attempts
            if (attempt >= opts.maxRetries) {
                throw error;
            }
            // Check if error is retryable
            if (opts.shouldRetry && !opts.shouldRetry(error)) {
                throw error;
            }
            // Calculate delay with exponential backoff
            const delay = Math.min(opts.initialDelay * Math.pow(2, attempt), opts.maxDelay);
            await sleep(delay);
        }
    }
    throw lastError;
}
/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=retry.js.map
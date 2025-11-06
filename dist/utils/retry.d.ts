/**
 * Retry logic with exponential backoff
 */
export interface RetryOptions {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    shouldRetry?: (error: any) => boolean;
}
/**
 * Retry a function with exponential backoff
 */
export declare function retryWithBackoff<T>(fn: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
/**
 * Sleep for a given number of milliseconds
 */
export declare function sleep(ms: number): Promise<void>;
//# sourceMappingURL=retry.d.ts.map
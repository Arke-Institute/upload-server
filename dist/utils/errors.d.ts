/**
 * Custom error classes for better error handling
 */
export declare class WorkerAPIError extends Error {
    statusCode?: number | undefined;
    details?: any | undefined;
    constructor(message: string, statusCode?: number | undefined, details?: any | undefined);
}
export declare class UploadError extends Error {
    fileName?: string | undefined;
    cause?: Error | undefined;
    constructor(message: string, fileName?: string | undefined, cause?: Error | undefined);
}
export declare class ValidationError extends Error {
    field?: string | undefined;
    constructor(message: string, field?: string | undefined);
}
export declare class NetworkError extends Error {
    cause?: Error | undefined;
    constructor(message: string, cause?: Error | undefined);
}
export declare class ScanError extends Error {
    path?: string | undefined;
    constructor(message: string, path?: string | undefined);
}
/**
 * Determine if an error is retryable
 */
export declare function isRetryableError(error: any): boolean;
//# sourceMappingURL=errors.d.ts.map
/**
 * Custom error classes for better error handling
 */
export class WorkerAPIError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'WorkerAPIError';
        Error.captureStackTrace(this, this.constructor);
    }
}
export class UploadError extends Error {
    fileName;
    cause;
    constructor(message, fileName, cause) {
        super(message);
        this.fileName = fileName;
        this.cause = cause;
        this.name = 'UploadError';
        Error.captureStackTrace(this, this.constructor);
    }
}
export class ValidationError extends Error {
    field;
    constructor(message, field) {
        super(message);
        this.field = field;
        this.name = 'ValidationError';
        Error.captureStackTrace(this, this.constructor);
    }
}
export class NetworkError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'NetworkError';
        Error.captureStackTrace(this, this.constructor);
    }
}
export class ScanError extends Error {
    path;
    constructor(message, path) {
        super(message);
        this.path = path;
        this.name = 'ScanError';
        Error.captureStackTrace(this, this.constructor);
    }
}
/**
 * Determine if an error is retryable
 */
export function isRetryableError(error) {
    // Network errors are retryable
    if (error instanceof NetworkError) {
        return true;
    }
    // Worker API 5xx errors are retryable
    if (error instanceof WorkerAPIError) {
        return error.statusCode ? error.statusCode >= 500 : false;
    }
    // Axios network errors
    if (error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED') {
        return true;
    }
    return false;
}
//# sourceMappingURL=errors.js.map
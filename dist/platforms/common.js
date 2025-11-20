/**
 * Common platform types and utilities
 */
/**
 * Detect current runtime platform
 */
export function detectPlatform() {
    // Check for Node.js
    if (typeof process !== 'undefined' &&
        process.versions != null &&
        process.versions.node != null) {
        return 'node';
    }
    // Check for browser
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        return 'browser';
    }
    return 'unknown';
}
/**
 * Normalize path separators to forward slashes
 */
export function normalizePath(p) {
    return p.replace(/\\/g, '/');
}
/**
 * Get file extension from filename
 */
export function getExtension(filename) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? '' : filename.slice(lastDot + 1).toLowerCase();
}
/**
 * Get MIME type from filename
 */
export function getMimeType(filename) {
    const ext = getExtension(filename);
    // Basic MIME type mapping
    const mimeTypes = {
        // Images
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'tif': 'image/tiff',
        'tiff': 'image/tiff',
        'bmp': 'image/bmp',
        'svg': 'image/svg+xml',
        // Documents
        'pdf': 'application/pdf',
        'txt': 'text/plain',
        'json': 'application/json',
        'xml': 'application/xml',
        'html': 'text/html',
        'htm': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        // Archives
        'zip': 'application/zip',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',
        // Audio
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        // Video
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'mov': 'video/quicktime',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}
//# sourceMappingURL=common.js.map
/**
 * Common platform types and utilities
 */
import type { FileInfo } from '../types/file.js';
import type { ProcessingConfig } from '../types/processing.js';
/**
 * Platform-specific file source
 * Can be a path string (Node.js) or File object (Browser)
 */
export type FileSource = string | File;
/**
 * Platform-specific scanner interface
 */
export interface PlatformScanner {
    /**
     * Scan files from the provided source
     * @param source - File source (path for Node.js, File[] for browser)
     * @param options - Scan options
     */
    scanFiles(source: FileSource | FileSource[], options: PlatformScanOptions): Promise<FileInfo[]>;
    /**
     * Read file contents as ArrayBuffer
     * @param file - FileInfo with platform-specific localPath
     */
    readFile(file: FileInfo): Promise<ArrayBuffer>;
}
/**
 * Options for platform scanning
 */
export interface PlatformScanOptions {
    /**
     * Logical root path for the batch
     */
    rootPath: string;
    /**
     * Follow symbolic links (Node.js only)
     */
    followSymlinks?: boolean;
    /**
     * Default processing configuration
     */
    defaultProcessingConfig?: ProcessingConfig;
}
/**
 * Detect current runtime platform
 */
export declare function detectPlatform(): 'node' | 'browser' | 'unknown';
/**
 * Normalize path separators to forward slashes
 */
export declare function normalizePath(p: string): string;
/**
 * Get file extension from filename
 */
export declare function getExtension(filename: string): string;
/**
 * Get MIME type from filename
 */
export declare function getMimeType(filename: string): string;
//# sourceMappingURL=common.d.ts.map
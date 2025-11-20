/**
 * Validation utilities for paths, files, and configuration
 */
import type { CustomPrompts } from '../types/config.js';
/**
 * Get file extension (including the dot)
 */
export declare function getFileExtension(fileName: string): string;
/**
 * Validate file size
 */
export declare function validateFileSize(size: number): void;
/**
 * Validate batch size
 */
export declare function validateBatchSize(totalSize: number): void;
/**
 * Validate logical path format
 */
export declare function validateLogicalPath(path: string): void;
/**
 * Validate worker URL
 */
export declare function validateWorkerUrl(url: string): void;
/**
 * Validate uploader name
 */
export declare function validateUploader(uploader: string): void;
/**
 * Validate parent PI format
 * Note: Existence validation happens at worker level
 */
export declare function validateParentPi(pi: string): void;
/**
 * Validate metadata JSON
 */
export declare function validateMetadata(metadata: string): Record<string, any>;
/**
 * Validate .ref.json file content
 *
 * Required fields:
 * - url: Publicly accessible HTTP(S) URL to the referenced resource
 *
 * Optional fields:
 * - type: MIME type (e.g., 'image/jpeg', 'application/pdf')
 * - size: File size in bytes
 * - filename: Original filename for display
 * - ocr: Pre-existing OCR text (if already processed)
 *
 * Note: All other fields are allowed and will be passed through to the worker.
 */
export declare function validateRefJson(content: string, fileName: string, logger?: any): void;
/**
 * Format bytes to human-readable string
 */
export declare function formatBytes(bytes: number): string;
/**
 * Normalize path to POSIX format (forward slashes)
 */
export declare function normalizePath(path: string): string;
/**
 * Validate TIFF quality (for future preprocessor configuration)
 */
export declare function validateTiffQuality(quality: number): void;
/**
 * Validate custom prompts
 */
export declare function validateCustomPrompts(prompts?: CustomPrompts): void;
//# sourceMappingURL=validation.d.ts.map
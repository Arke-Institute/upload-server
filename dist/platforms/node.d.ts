/**
 * Node.js platform adapter for file scanning
 */
import type { FileInfo } from '../types/file.js';
import type { PlatformScanner, PlatformScanOptions } from './common.js';
/**
 * Node.js file scanner implementation
 */
export declare class NodeScanner implements PlatformScanner {
    /**
     * Scan directory recursively and collect file metadata
     */
    scanFiles(source: string | string[], options: PlatformScanOptions): Promise<FileInfo[]>;
    /**
     * Read file contents as ArrayBuffer
     */
    readFile(file: FileInfo): Promise<ArrayBuffer>;
}
//# sourceMappingURL=node.d.ts.map
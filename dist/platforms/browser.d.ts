/**
 * Browser platform adapter for file handling
 */
import type { FileInfo } from '../types/file.js';
import type { PlatformScanner, PlatformScanOptions } from './common.js';
/**
 * Browser file scanner implementation
 */
export declare class BrowserScanner implements PlatformScanner {
    /**
     * Scan files from File or FileList
     */
    scanFiles(source: File | File[], options: PlatformScanOptions): Promise<FileInfo[]>;
    /**
     * Process a single File object
     */
    private processFile;
    /**
     * Read file contents as ArrayBuffer
     * Note: In browser context, the File object should be passed directly
     */
    readFile(file: FileInfo): Promise<ArrayBuffer>;
}
//# sourceMappingURL=browser.d.ts.map
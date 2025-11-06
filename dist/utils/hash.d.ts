/**
 * Hash and CID computation utilities
 */
/**
 * Compute IPFS CID v1 for a file (Node.js only)
 * Uses raw codec and SHA-256 hash
 * Returns base32-encoded CID string
 */
export declare function computeFileCID(filePath: string): Promise<string>;
/**
 * Compute CID for a buffer (works in all environments)
 */
export declare function computeBufferCID(buffer: Buffer): Promise<string>;
/**
 * Compute CID from Uint8Array (browser-compatible)
 */
export declare function computeCIDFromBuffer(data: Uint8Array): Promise<string>;
//# sourceMappingURL=hash.d.ts.map
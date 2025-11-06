# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**@arke/upload-client** is a portable TypeScript SDK for uploading files to the Arke Institute's ingest service. It works across multiple JavaScript runtimes (Node.js, browsers, Deno, Cloudflare Workers) and uploads files directly to Cloudflare R2 using presigned URLs from the worker API.

**Key Architecture:**
- Multi-platform SDK (Node.js + Browser)
- Platform adapters for file handling (fs vs File API)
- Direct R2 upload via presigned URLs (no server bandwidth)
- Automatic multipart uploads for large files (≥5MB)
- Fetch-based API client (universal compatibility)
- CID computation using multiformats

## Development Commands

### Build and Run
```bash
# Build both Node.js and browser versions
npm run build

# Build Node.js version only
npm run build:node

# Build browser version only
npm run build:browser

# Development mode with watch
npm run dev

# Type checking
npm run lint
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Test with real worker (using examples)
npm run build
node examples/node-basic.ts
```

## Installation

This SDK is installed directly from GitHub:

```bash
# Install latest from main branch
npm install github:Arke-Institute/upload-client

# Install specific version
npm install github:Arke-Institute/upload-client#v1.0.0
```

When installed from GitHub, the `prepare` script automatically builds the package.

## Architecture

### System Components

```
┌─────────────────────────────────────────────┐
│           ArkeUploader (Core)               │
│  • Orchestrates upload workflow            │
│  • Progress tracking                        │
│  • Concurrency control                      │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼────────┐  ┌───────▼────────┐
│ Platform       │  │ Worker Client  │
│ Adapters       │  │ (fetch-based)  │
│ • Node.js (fs) │  │ • API calls    │
│ • Browser      │  │ • Presigned    │
│   (File API)   │  │   URLs         │
└────────────────┘  └────────────────┘
        │                   │
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐
        │   Upload Engines  │
        │ • Simple (<5MB)   │
        │ • Multipart(≥5MB) │
        └───────────────────┘
```

### Core Upload Flow

**SDK-side workflow:**

1. **Platform Detection** - Detect runtime (Node.js vs Browser)
2. **File Scanning** - Platform adapter scans files and computes CIDs
   - Node.js: Uses `fs` to walk directory tree
   - Browser: Processes `File[]` or `FileList`
3. **Batch Init** - Call worker API to create batch
4. **For each file:**
   - Request presigned URL(s) from worker
   - Worker generates URL (simple or multipart based on size)
   - Upload directly to R2 using presigned URL
   - Notify worker of completion
5. **Finalize** - Close batch and trigger worker processing

### Key Components

**ArkeUploader** (src/uploader.ts)
- Main SDK class exposing clean API
- Orchestrates entire upload workflow
- Manages concurrency (file-level and part-level)
- Provides progress callbacks
- Platform-agnostic (auto-detects and uses correct adapter)

**Platform Adapters** (src/platforms/)
- `common.ts` - Shared utilities and types
- `node.ts` - Node.js file scanning with fs
- `browser.ts` - Browser File/FileList handling
- Platform detection and conditional loading

**Worker Client** (src/lib/worker-client-fetch.ts)
- Fetch-based HTTP client for worker API
- Endpoints: init, start file, complete file, finalize
- Automatic retry with exponential backoff
- Works in all JavaScript runtimes

**Upload Engines** (src/lib/)
- `simple-fetch.ts` - For files <5MB (single PUT)
- `multipart-fetch.ts` - For files ≥5MB (chunked)
- Both use native fetch API (universal)

**Type System** (src/types/)
- `config.ts` - SDK configuration types
- `api.ts` - Worker API request/response types
- `file.ts` - File metadata types
- `processing.ts` - Processing options
- Full TypeScript support with exports

**Utilities** (src/utils/)
- `hash.ts` - CID computation (multiformats)
- `retry.ts` - Exponential backoff retry logic
- `errors.ts` - Typed error classes
- Platform-agnostic implementations

### Direct R2 Upload Pattern

Neither the SDK nor worker handles file bytes during upload:

1. SDK requests presigned URL from worker
2. Worker generates URL using R2 API
3. SDK uploads file bytes directly to R2
4. SDK notifies worker of completion
5. Worker tracks state and triggers processing

This pattern:
- Eliminates bandwidth bottleneck
- Works with Cloudflare Workers' memory limits
- Scales to unlimited file sizes (via multipart)

### Multipart Upload Details

For files ≥5MB:
- File split into 10MB chunks
- Worker provides presigned URL for each chunk
- SDK uploads chunks in parallel (default: 3 concurrent)
- Each chunk returns an ETag
- SDK sends all ETags to worker to complete multipart
- Worker completes multipart upload with R2

### Platform Differences

**Node.js:**
- Scans directory with `fs.readdir` recursively
- Reads files as Buffer with `fs.readFile`
- Computes CID from file path
- Supports `.arke-process.json` config files per directory

**Browser:**
- Accepts `File[]` or `FileList` from `<input type="file">`
- Reads files with `file.arrayBuffer()`
- Computes CID from file data
- Uses `webkitRelativePath` to preserve structure

## Important Implementation Details

### CID Computation

Files are hashed using SHA-256 and encoded as CIDv1 with multiformats library (src/utils/hash.ts):

```typescript
// Node.js - from file path
const cid = await computeFileCID(filePath);

// Browser - from Uint8Array
const cid = await computeCIDFromBuffer(data);
```

The CID is sent to worker for content-addressable tracking.

### Concurrency Control

Two levels of concurrency:
1. **File-level**: `parallelUploads` (default: 5) - How many files upload simultaneously
2. **Part-level**: `parallelParts` (default: 3) - How many chunks per multipart upload

Uses worker queue pattern with shared task queue.

### Progress Tracking

Progress callback receives:
```typescript
interface UploadProgress {
  phase: 'scanning' | 'uploading' | 'finalizing' | 'complete';
  filesTotal: number;
  filesUploaded: number;
  bytesTotal: number;
  bytesUploaded: number;
  currentFile?: string;
  percentComplete: number;
}
```

Updated after each file completes.

### Error Handling

Custom error types (src/utils/errors.ts):
- `ValidationError` - Invalid input (paths, sizes)
- `ScanError` - Directory scanning issues
- `WorkerAPIError` - API errors from worker
- `NetworkError` - Network/connection failures
- `UploadError` - R2 upload failures

All network operations use retry logic with exponential backoff (default: 3 retries).

## Code Style and Patterns

### TypeScript Configuration

- Target: ES2022
- Module: ES2022 (native ESM)
- Module Resolution: bundler
- Strict mode enabled
- All imports use `.js` extension (ESM requirement)
- Dual builds: Node.js (CJS+ESM) + Browser (UMD)

### Async Patterns

All I/O operations are async. Use worker pools for controlled concurrency rather than `Promise.all()` on large arrays.

### Error Propagation

Throw custom error types from utilities and handle them at SDK level. Provide typed errors to SDK consumers.

### Platform Detection

Runtime detection happens at initialization:
```typescript
function detectPlatform(): 'node' | 'browser' | 'unknown' {
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser';
  }
  return 'unknown';
}
```

## Common Workflows

### Adding a New Platform Adapter

1. Create adapter class implementing `PlatformScanner` interface
2. Implement `scanFiles()` and `readFile()` methods
3. Add to `src/platforms/index.ts` exports
4. Update platform detection in `src/platforms/common.ts`
5. Test with platform-specific runtime

### Adding New Upload Options

1. Add to `UploaderConfig` or `UploadOptions` in `src/types/config.ts`
2. Update `ArkeUploader` constructor or method signature
3. Pass option through to relevant components
4. Update README API reference
5. Add tests for new option

### Debugging Upload Failures

1. Check progress callback for errors
2. Enable browser DevTools network tab to see R2 requests
3. Check worker API responses (visible in network tab)
4. Verify presigned URLs are valid (check expiration)
5. Test with smaller file set to isolate issue

### Testing Locally

```bash
# Build SDK
npm run build

# Test with Node.js example
node examples/node-basic.ts

# Test with browser example
# Open examples/browser.html in browser
# Select files and upload
```

## Repository Structure

```
@arke/upload-client/
├── src/
│   ├── index.ts                    # Main SDK export
│   ├── uploader.ts                 # ArkeUploader class
│   ├── lib/
│   │   ├── worker-client-fetch.ts  # Worker API client
│   │   ├── simple-fetch.ts         # Simple uploads
│   │   ├── multipart-fetch.ts      # Multipart uploads
│   │   └── validation.ts           # Input validation
│   ├── platforms/
│   │   ├── index.ts                # Platform exports
│   │   ├── common.ts               # Shared utilities
│   │   ├── node.ts                 # Node.js adapter
│   │   └── browser.ts              # Browser adapter
│   ├── types/
│   │   ├── index.ts                # Type exports
│   │   ├── config.ts               # SDK config types
│   │   ├── api.ts                  # Worker API types
│   │   ├── file.ts                 # File types
│   │   ├── batch.ts                # Batch types
│   │   └── processing.ts           # Processing types
│   └── utils/
│       ├── errors.ts               # Error classes
│       ├── hash.ts                 # CID computation
│       └── retry.ts                # Retry logic
├── examples/
│   ├── node-basic.ts               # Node.js example
│   └── browser.html                # Browser example
├── test/
│   ├── uploader.test.ts            # Uploader tests
│   ├── validation.test.ts          # Validation tests
│   └── hash.test.ts                # Hash tests
├── dist/                           # Build output (generated)
│   ├── index.js                    # Node.js (CJS)
│   ├── index.mjs                   # Node.js (ESM)
│   ├── browser.js                  # Browser (UMD)
│   └── types/                      # TypeScript declarations
├── package.json                    # SDK package config
├── tsconfig.json                   # TypeScript config
├── vite.config.ts                  # Browser build config
├── vitest.config.ts                # Test config
└── README.md                       # SDK documentation
```

## Dependencies

**Runtime:**
- `multiformats` - CID computation (only dependency)

**Dev:**
- `typescript` - TypeScript compiler
- `vite` - Browser bundler
- `vitest` - Test runner
- `@types/node` - Node.js types

Zero runtime dependencies except multiformats!

## GitHub Installation

The SDK is distributed via GitHub (not npm yet):

```bash
npm install github:Arke-Institute/upload-client
```

The `prepare` script in package.json automatically runs `npm run build` when installed, ensuring the `dist/` directory is built.

## Future Plans

- Publish to npm registry as `@arke/upload-client`
- Add Deno-specific adapter
- Add progress estimation (ETA)
- Add resumable uploads (checkpoint/restore)
- Add batch validation before upload

# @arke/upload-client

Portable upload client SDK for Arke Institute's ingest service. Upload files directly to Arke from Node.js, browsers, and other JavaScript runtimes.

## Features

- 🚀 **Multi-platform** - Works in Node.js, browsers, Deno, and Cloudflare Workers
- 📦 **Direct R2 uploads** - Files upload directly to Cloudflare R2 (no bandwidth through server)
- 🔄 **Automatic multipart** - Large files (≥5MB) automatically use multipart upload
- 📊 **Progress tracking** - Real-time upload progress callbacks
- 🔁 **Automatic retries** - Built-in retry logic with exponential backoff
- 🎯 **Type-safe** - Full TypeScript support with type definitions
- 🌐 **Platform adapters** - Seamless file handling across different environments
- 📝 **CID computation** - Content-addressable storage with IPFS CIDs

## Installation

### Install from GitHub

The SDK is currently available directly from GitHub (not yet published to npm):

```bash
# Install latest from main branch
npm install github:Arke-Institute/upload-client

# Or install a specific version tag
npm install github:Arke-Institute/upload-client#v1.0.0

# Or install from a specific branch
npm install github:Arke-Institute/upload-client#sdk-restructure
```

**Note:** The package will be published to npm in the future. For now, GitHub installation ensures you get the latest stable version with automatic builds.

### Future npm Installation

```bash
# Coming soon
npm install @arke/upload-client
```

## Quick Start

### Node.js

```typescript
import { ArkeUploader } from '@arke/upload-client';

const uploader = new ArkeUploader({
  workerUrl: 'https://ingest.arke.institute',
  uploader: 'Your Name',
  rootPath: '/archives/collection',
});

// Upload a directory
const result = await uploader.uploadBatch('./my-files', {
  onProgress: (progress) => {
    console.log(`${progress.percentComplete}% - ${progress.filesUploaded}/${progress.filesTotal}`);
  },
});

console.log(`Success! Batch ID: ${result.batchId}`);
```

### Browser

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import { ArkeUploader } from '@arke/upload-client/browser';

    async function upload() {
      const files = document.getElementById('fileInput').files;

      const uploader = new ArkeUploader({
        workerUrl: 'https://ingest.arke.institute',
        uploader: 'Browser User',
        rootPath: '/uploads',
      });

      const result = await uploader.uploadBatch(Array.from(files), {
        onProgress: (p) => {
          console.log(`${p.percentComplete}% complete`);
        },
      });

      alert(`Upload complete! Batch: ${result.batchId}`);
    }

    window.upload = upload;
  </script>
</head>
<body>
  <input type="file" id="fileInput" multiple webkitdirectory>
  <button onclick="upload()">Upload</button>
</body>
</html>
```

## API Reference

### `ArkeUploader`

Main SDK class for uploading files.

#### Constructor

```typescript
new ArkeUploader(config: UploaderConfig)
```

**Config Options:**

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `workerUrl` | `string` | ✓ | - | URL of the Arke ingest worker |
| `uploader` | `string` | ✓ | - | Name of person/service uploading |
| `rootPath` | `string` | | `/` | Root path in archive hierarchy |
| `parentPi` | `string` | | - | Parent persistent identifier |
| `metadata` | `Record<string, unknown>` | | - | Custom batch metadata |
| `processing` | `ProcessingConfig` | | - | OCR and IIIF options |
| `parallelUploads` | `number` | | `5` | Concurrent file uploads |
| `parallelParts` | `number` | | `3` | Concurrent parts per multipart upload |

#### Methods

##### `uploadBatch(source, options?)`

Upload files to Arke.

**Parameters:**
- `source`: Directory path (Node.js) or `File[]`/`FileList` (browser)
- `options`: Upload options

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `onProgress` | `(progress: UploadProgress) => void` | Progress callback |
| `dryRun` | `boolean` | Validate without uploading |

**Returns:** `Promise<BatchResult>`

```typescript
interface BatchResult {
  batchId: string;        // Batch ID from worker
  filesUploaded: number;  // Number of files uploaded
  bytesUploaded: number;  // Total bytes uploaded
  durationMs: number;     // Upload duration
}
```

**Progress Object:**

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

## Examples

See the [examples](./examples) directory for complete working examples:

- [`node-basic.ts`](./examples/node-basic.ts) - Basic Node.js upload
- [`browser.html`](./examples/browser.html) - Browser upload with UI

### Running Examples

```bash
# Node.js example
npm run build
node examples/node-basic.ts

# Browser example
npm run build
# Open examples/browser.html in your browser
```

## Architecture

The SDK is designed for maximum portability across JavaScript runtimes:

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
```

### Upload Flow

1. **Scan** - Platform adapter scans files and computes CIDs
2. **Initialize** - Create batch with worker API
3. **Request URLs** - Get presigned URLs for each file
4. **Upload** - Upload files directly to R2
   - Files <5MB: Simple PUT
   - Files ≥5MB: Multipart upload (10MB chunks)
5. **Complete** - Notify worker of completed files
6. **Finalize** - Close batch and trigger processing

## Development

```bash
# Install dependencies
npm install

# Build
npm run build          # Build both Node.js and browser versions
npm run build:node     # Build Node.js version only
npm run build:browser  # Build browser version only

# Test
npm test               # Run tests
npm run test:watch     # Run tests in watch mode

# Lint
npm run lint           # Type-check
```

## Testing

```bash
# Run all tests
npm test

# Test with real worker
node examples/node-basic.ts
```

The test suite includes:
- ✅ Uploader initialization
- ✅ File size validation
- ✅ Batch size validation
- ✅ Path validation
- ✅ CID computation

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Node.js 18+ | ✅ | Full support with fs module |
| Modern browsers | ✅ | File/FileList API support |
| Deno | ✅ | Native fetch support |
| Cloudflare Workers | ✅ | Fetch API compatible |
| Bun | ✅ | Node.js compatible |

## Error Handling

The SDK throws typed errors for different failure modes:

```typescript
import { ValidationError, NetworkError, WorkerAPIError } from '@arke/upload-client';

try {
  await uploader.uploadBatch('./files');
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network failed:', error.message);
  } else if (error instanceof WorkerAPIError) {
    console.error('API error:', error.statusCode, error.message);
  }
}
```

## License

MIT

## Related

- [arke-ingest-worker](../arke-ingest-worker) - Cloudflare Worker API
- [orchestrator](../orchestrator) - Batch processing orchestrator

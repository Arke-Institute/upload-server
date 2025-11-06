# SDK Restructure - Current State & Next Steps

## ✅ Completed: Cleanup Phase

### What Was Removed
- ❌ `src/server/` - Express server with Multer (3 files, ~800 LOC)
- ❌ `deployment/` - EC2 deployment scripts (8 files)
- ❌ `src/lib/uploader.ts` - Old CLI orchestrator (~300 LOC)
- ❌ `src/lib/preprocessor.ts` - Server-side preprocessing (~150 LOC)
- ❌ `src/lib/preprocessors/` - TIFF converter (~250 LOC)
- ❌ `src/lib/config.ts` - CLI config loading (~200 LOC)
- ❌ `src/lib/progress.ts` - CLI progress bars (~80 LOC)
- ❌ `Dockerfile` + deployment files
- ❌ Old documentation files

### What Remains (SDK Core)

**Lib Code** (`src/lib/`):
```
✅ scanner.ts        - File scanning (needs refactor for multi-platform)
✅ worker-client.ts  - Worker API client (needs minor updates)
✅ simple.ts         - Simple R2 upload (<5MB)
✅ multipart.ts      - Multipart R2 upload (≥5MB)
✅ validation.ts     - Input validation
```

**Type Definitions** (`src/types/`):
```
✅ api.ts            - Worker API types
✅ batch.ts          - Batch config types
✅ file.ts           - File metadata types
✅ preprocessor.ts   - Preprocessor types (might remove)
✅ processing.ts     - Processing config types
✅ server.ts         - Server types (will remove)
```

**Utilities** (`src/utils/`):
```
✅ errors.ts         - Custom error classes
✅ hash.ts           - CID computation (multiformats)
✅ logger.ts         - Simple logger (needs simplification)
✅ retry.ts          - Retry with exponential backoff
```

**Test Fixtures** (`test/fixtures/`):
```
✅ small/    - Small IIIF test collection
✅ tiffs/    - TIFF test files
✅ mixed/    - Mixed types (TIFFs + PDFs)
```

## 📋 Current State Analysis

### What Works (Can Be Reused As-Is)

1. **`src/lib/worker-client.ts`** - ✅ Nearly perfect
   - Uses fetch API
   - Has all worker endpoints
   - Just needs minor type updates

2. **`src/lib/simple.ts`** - ✅ Perfect
   - Direct PUT to presigned URL
   - Progress callback support
   - Platform-agnostic (uses fetch)

3. **`src/lib/multipart.ts`** - ✅ Perfect
   - Chunked upload with parts
   - Progress callback support
   - Platform-agnostic

4. **`src/utils/hash.ts`** - ✅ Perfect
   - CID computation with multiformats
   - Works in all environments

5. **`src/utils/retry.ts`** - ✅ Perfect
   - Exponential backoff
   - Configurable retries

6. **`src/utils/errors.ts`** - ✅ Perfect
   - Custom error classes
   - Type-safe

### What Needs Refactoring

1. **`src/lib/scanner.ts`** - 🔄 Needs Platform Split
   - Currently Node.js-only (uses `fs`)
   - Need separate implementations:
     - `platforms/node.ts` - fs-based scanning
     - `platforms/browser.ts` - File/FileList handling
   - Keep core types and validation

2. **`src/lib/validation.ts`** - 🔄 Minor Updates
   - Remove server-specific validation
   - Keep file size, path, extension checks

3. **`src/utils/logger.ts`** - 🔄 Simplify
   - Remove chalk, ora dependencies
   - Just use console.log/warn/error
   - Optional debug mode

4. **`src/types/`** - 🔄 Cleanup
   - Remove `server.ts` (not needed)
   - Remove `preprocessor.ts` (not needed)
   - Keep: `api.ts`, `batch.ts`, `file.ts`, `processing.ts`

### What Needs Creating

1. **`src/uploader.ts`** - ⭐ NEW (Main SDK Class)
   ```typescript
   export class ArkeUploader {
     constructor(config: UploaderConfig);
     uploadBatch(files, options): Promise<BatchResult>;
   }
   ```

2. **`src/index.ts`** - ⭐ NEW (Main Export)
   ```typescript
   export { ArkeUploader } from './uploader.js';
   export * from './types/index.js';
   ```

3. **`src/platforms/node.ts`** - ⭐ NEW
   - Node.js file scanning (fs-based)
   - File reading from paths

4. **`src/platforms/browser.ts`** - ⭐ NEW
   - Browser File/FileList handling
   - No filesystem access

5. **`src/platforms/common.ts`** - ⭐ NEW
   - Shared platform code
   - Type definitions

6. **`src/utils/platform.ts`** - ⭐ NEW
   - Detect runtime environment
   - Select correct platform implementation

7. **`src/types/config.ts`** - ⭐ NEW
   - SDK configuration types
   - Clean, simple API

## 🎯 Next Steps: Build the SDK

### Step 1: Update Package.json (10 min)

Transform `package.json` to SDK package:
- Change name to `@arke/upload-client`
- Remove server dependencies (express, multer, sharp, etc.)
- Keep: multiformats only
- Add dev dependencies: vite, vitest
- Update scripts for SDK builds
- Add proper exports for Node.js + Browser

### Step 2: Reorganize Types (30 min)

Clean up type definitions:
- Remove `src/types/server.ts`
- Remove `src/types/preprocessor.ts`
- Create `src/types/config.ts` for SDK config
- Create `src/types/index.ts` to export all types
- Update imports in existing files

### Step 3: Create Platform Adapters (1 hour)

Split file handling by platform:
- Extract Node.js code from `scanner.ts` → `platforms/node.ts`
- Create `platforms/browser.ts` for File API
- Create `platforms/common.ts` for shared logic
- Create `platforms/index.ts` to export platform-specific code

### Step 4: Create ArkeUploader Class (2 hours)

Main SDK class that orchestrates everything:
- File scanning (via platform adapters)
- Worker API calls (via worker-client)
- R2 uploads (via simple/multipart)
- Progress tracking
- Error handling
- Simple, clean API

### Step 5: Create Examples (30 min)

Working examples to test:
- `examples/node-basic.ts` - Upload test fixtures
- `examples/browser.html` - Web upload UI

### Step 6: Write Tests (1 hour)

Basic test suite:
- Test uploader initialization
- Mock worker API calls
- Test file scanning (both platforms)
- Test progress callbacks

### Step 7: Build Configuration (30 min)

Set up dual builds:
- Node.js build (CommonJS + ESM)
- Browser build (UMD via Vite)
- TypeScript declarations

### Step 8: Test with Real Worker (30 min)

Integration test:
- Upload test fixtures to worker
- Verify batch created
- Check files in R2
- Confirm preprocessing routing

## 📦 What the Final Structure Will Look Like

```
@arke/upload-client/
├── src/
│   ├── index.ts                 # Main export
│   ├── uploader.ts              # ArkeUploader class (NEW)
│   ├── lib/
│   │   ├── worker-client.ts     # Worker API (minor updates)
│   │   ├── r2-upload.ts         # Merged simple + multipart (NEW)
│   │   ├── scanner.ts           # Refactored, platform-agnostic
│   │   └── validation.ts        # Cleaned up
│   ├── platforms/
│   │   ├── index.ts             # Platform exports (NEW)
│   │   ├── node.ts              # Node.js impl (NEW)
│   │   ├── browser.ts           # Browser impl (NEW)
│   │   └── common.ts            # Shared code (NEW)
│   ├── types/
│   │   ├── index.ts             # All type exports (NEW)
│   │   ├── config.ts            # SDK config types (NEW)
│   │   ├── api.ts               # Worker API types (keep)
│   │   ├── batch.ts             # Batch types (keep)
│   │   ├── file.ts              # File types (keep)
│   │   └── processing.ts        # Processing types (keep)
│   └── utils/
│       ├── errors.ts            # Custom errors (keep)
│       ├── hash.ts              # CID computation (keep)
│       ├── retry.ts             # Retry logic (keep)
│       ├── logger.ts            # Simple logger (simplify)
│       └── platform.ts          # Platform detection (NEW)
├── examples/
│   ├── node-basic.ts            # Node.js example (NEW)
│   └── browser.html             # Browser example (NEW)
├── test/
│   ├── uploader.test.ts         # Main tests (NEW)
│   ├── worker-client.test.ts    # API tests (NEW)
│   └── fixtures/                # Test data (done)
│       ├── small/
│       ├── tiffs/
│       └── mixed/
├── dist/                        # Build output
│   ├── index.js                 # Node.js (CJS)
│   ├── index.mjs                # Node.js (ESM)
│   ├── browser.js               # Browser (UMD)
│   └── types/                   # TypeScript defs
├── package.json                 # SDK package (update)
├── tsconfig.json                # TS config (update)
├── vite.config.ts               # Browser build (NEW)
├── vitest.config.ts             # Test config (NEW)
└── README.md                    # SDK docs (rewrite)
```

## 🚀 Ready to Build?

The cleanup is complete. We have:
- ✅ Clean directory structure
- ✅ Core reusable code (worker-client, r2-upload, utils)
- ✅ Test fixtures ready
- ✅ Clear plan for what to build

**Estimated Time to Complete SDK**:
- 6-8 hours of focused coding
- Can be done in 1 day

**Next Command**:
```bash
# Start Step 1: Update package.json
# Then proceed through steps 2-8
```

Want me to proceed with Step 1 (update package.json)?

# Arke Upload Server - API Documentation

Complete API reference for the Arke Upload Server REST API.

**Base URL:** `http://upload.arke.institute`

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Upload Workflow](#upload-workflow)
- [API Endpoints](#api-endpoints)
  - [Health Check](#health-check)
  - [Initialize Upload Session](#initialize-upload-session)
  - [Upload Files](#upload-files)
  - [Trigger Processing](#trigger-processing)
  - [Get Upload Status](#get-upload-status)
  - [Cancel Upload](#cancel-upload)
- [Data Types](#data-types)
- [Error Handling](#error-handling)
- [Rate Limits](#rate-limits)
- [Examples](#examples)

---

## Overview

The Arke Upload Server provides a REST API for uploading files and directories to the Arke Institute's digital archive. Files are uploaded to the server, preprocessed (e.g., TIFF to JPEG conversion), and then transferred to R2 storage for permanent archival and processing.

### Key Features

- **Session-based uploads**: Initialize a session, upload files, trigger processing
- **Directory structure preservation**: Maintains folder hierarchies from uploads
- **Automatic preprocessing**: TIFF images converted to JPEG for OCR compatibility
- **Progress tracking**: Real-time status updates via polling
- **Large file support**: Up to 5 GB per file
- **Batch processing**: All files in a session processed together

### Upload Flow

```
1. POST /upload/init          → Create session, get upload URL
2. POST /upload/:id/files     → Upload files (repeat for each file)
3. POST /upload/:id/process   → Trigger processing
4. GET  /upload/:id/status    → Poll for status (repeat until complete)
```

---

## Authentication

Currently, the API does not require authentication. This will be added in a future version.

---

## Upload Workflow

### Step-by-Step Process

**1. Initialize Session**

Create a new upload session with metadata about the uploader and archive location.

**2. Upload Files**

Upload files to the session. You can upload files multiple times, building up the complete set before processing.

**3. Trigger Processing**

Once all files are uploaded, trigger the processing workflow. This scans files, applies preprocessing (TIFF conversion), uploads to R2, and creates a batch in the worker.

**4. Monitor Progress**

Poll the status endpoint to track progress through phases: scanning → preprocessing → uploading → finalizing

**5. Completion**

When status is `completed`, files have been successfully uploaded and enqueued for processing by the worker. Use the `batchId` from the status response to poll the orchestrator API for final processing status.

---

## API Endpoints

### Health Check

Check server health and configuration.

**Endpoint:** `GET /api/v1/health`

**Response:**
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "uptime": 3600,
  "storage": {
    "tmpDirectory": "/tmp/arke-uploads",
    "available": 29273329664,
    "used": 2859212800
  },
  "worker": {
    "url": "https://ingest.arke.institute",
    "reachable": true
  }
}
```

**Status Values:**
- `healthy` - Server fully operational
- `degraded` - Server running but issues detected
- `unhealthy` - Server not functioning properly

---

### Initialize Upload Session

Create a new upload session.

**Endpoint:** `POST /api/v1/upload/init`

**Request Body:**
```json
{
  "uploader": "Jane Doe",
  "rootPath": "/archives/collection_name",
  "parentPi": "01234567890123456789012345",
  "metadata": {
    "description": "Sample collection",
    "date": "2024-11-06"
  },
  "processing": {
    "enableOcr": true,
    "generateIiif": true
  },
  "preprocessor": {
    "tiffMode": "convert",
    "tiffQuality": 95
  }
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uploader` | string | **Yes** | Name or identifier of person uploading |
| `rootPath` | string | No | Archive path prefix (default: `/`) |
| `parentPi` | string | No | Parent persistent identifier for attachment (default: root) |
| `metadata` | object | No | Custom metadata for the batch |
| `processing` | object | No | Processing configuration (OCR, IIIF, etc.) |
| `preprocessor` | object | No | Preprocessing options |

**Preprocessor Options:**

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `tiffMode` | string | `convert`, `preserve`, `both`, `none` | How to handle TIFF files (default: `convert`) |
| `tiffQuality` | number | 1-100 | JPEG quality for converted TIFFs (default: 95) |

**Response:**
```json
{
  "sessionId": "01K9BEZ521NSBNCRZ0SFYXCF24",
  "uploadUrl": "http://upload.arke.institute/api/v1/upload/01K9BEZ521NSBNCRZ0SFYXCF24/files",
  "statusUrl": "http://upload.arke.institute/api/v1/upload/01K9BEZ521NSBNCRZ0SFYXCF24/status",
  "expiresAt": "2025-11-07T02:12:12.994Z"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | Unique session identifier (ULID format) |
| `uploadUrl` | string | URL to upload files to |
| `statusUrl` | string | URL to check upload status |
| `expiresAt` | string | Session expiration time (24 hours) |

---

### Upload Files

Upload files to an existing session. Can be called multiple times.

**Endpoint:** `POST /api/v1/upload/:sessionId/files`

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `files`: One or more files (can repeat the field for multiple files)

**Example using curl:**
```bash
curl -X POST "http://upload.arke.institute/api/v1/upload/SESSION_ID/files" \
  -F "files=@document.pdf" \
  -F "files=@image.jpg" \
  -F "files=@folder/subfolder/file.txt;filename=folder/subfolder/file.txt"
```

**Directory Structure:**

To preserve directory structure, set the `filename` parameter in the multipart form data to include the relative path:

```bash
-F "files=@/local/path/document.pdf;filename=box_1/folder_a/document.pdf"
```

This will create `box_1/folder_a/document.pdf` in the archive.

**Response:**
```json
{
  "sessionId": "01K9BEZ521NSBNCRZ0SFYXCF24",
  "filesReceived": 3,
  "totalSize": 1048576,
  "status": "receiving"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | Session identifier |
| `filesReceived` | number | Total files received so far |
| `totalSize` | number | Total bytes received |
| `status` | string | Session status |

**Limits:**
- Maximum file size: 5 GB
- Maximum session size: Unlimited (but consider reasonable limits)
- Session timeout: 24 hours

---

### Trigger Processing

Start processing uploaded files.

**Endpoint:** `POST /api/v1/upload/:sessionId/process`

**Request Body:**
```json
{
  "dryRun": false
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dryRun` | boolean | No | If true, validates files but doesn't upload (default: false) |

**Response:**
```json
{
  "sessionId": "01K9BEZ521NSBNCRZ0SFYXCF24",
  "status": "processing",
  "message": "Processing started. Poll status endpoint for progress updates."
}
```

**Notes:**
- Processing runs asynchronously in the background
- Use the status endpoint to monitor progress
- Cannot trigger processing if session is already processing or completed

---

### Get Upload Status

Get current status and progress of an upload session.

**Endpoint:** `GET /api/v1/upload/:sessionId/status`

**Response:**
```json
{
  "sessionId": "01K9BEZ521NSBNCRZ0SFYXCF24",
  "batchId": "01K9BEZ5PJZBQ4ZF6Y3KX2NG5Y",
  "status": "processing",
  "phase": "uploading",
  "progress": {
    "phase": "uploading",
    "filesTotal": 10,
    "filesProcessed": 7,
    "filesUploaded": 5,
    "filesFailed": 0,
    "bytesTotal": 10485760,
    "bytesProcessed": 7340032,
    "bytesUploaded": 5242880,
    "percentComplete": 50,
    "currentFile": "document_05.pdf"
  },
  "errors": [],
  "startedAt": "2025-11-06T02:12:12.994Z",
  "updatedAt": "2025-11-06T02:12:35.123Z"
}
```

**Note:** The `batchId` field is only present after processing starts (status is `processing` or later). This is the ID needed to poll the orchestrator for final processing status.

**Status Values:**

| Status | Description |
|--------|-------------|
| `initialized` | Session created, no files uploaded yet |
| `receiving` | Files being uploaded |
| `ready` | Files uploaded, waiting for processing trigger |
| `processing` | Currently processing files |
| `completed` | Successfully completed |
| `failed` | Processing failed (see `errors` field) |
| `cancelled` | Upload cancelled by user |

**Processing Phases:**

| Phase | Description |
|-------|-------------|
| `scanning` | Scanning uploaded files, computing CIDs |
| `preprocessing` | Converting TIFFs, applying transformations |
| `uploading` | Uploading files to R2 storage |
| `finalizing` | Creating batch, enqueueing for processing |

**Progress Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `filesTotal` | number | Total number of files to process |
| `filesProcessed` | number | Files scanned/preprocessed |
| `filesUploaded` | number | Files uploaded to R2 |
| `filesFailed` | number | Files that failed processing |
| `bytesTotal` | number | Total bytes to upload |
| `bytesUploaded` | number | Bytes uploaded so far |
| `percentComplete` | number | Overall progress percentage (0-100) |
| `currentFile` | string | File currently being processed |

---

### Cancel Upload

Cancel an upload session and clean up files.

**Endpoint:** `DELETE /api/v1/upload/:sessionId`

**Response:**
```json
{
  "sessionId": "01K9BEZ521NSBNCRZ0SFYXCF24",
  "status": "cancelled",
  "message": "Upload cancelled and temp files cleaned up"
}
```

**Notes:**
- Cancels processing if currently running
- Deletes all uploaded files from temp storage
- Cannot cancel a completed session

---

## Data Types

### Session Status

```typescript
type SessionStatus =
  | 'initialized'
  | 'receiving'
  | 'ready'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';
```

### Processing Phase

```typescript
type ProcessingPhase =
  | 'scanning'
  | 'preprocessing'
  | 'uploading'
  | 'finalizing';
```

### TIFF Mode

```typescript
type TiffMode =
  | 'convert'   // Convert TIFFs to JPEG
  | 'preserve'  // Keep original TIFFs
  | 'both'      // Upload both TIFF and JPEG
  | 'none';     // No TIFF processing
```

---

## Error Handling

### Error Response Format

```json
{
  "error": "Session not found",
  "message": "Additional error details",
  "code": "SESSION_NOT_FOUND"
}
```

### Common Error Codes

| HTTP Status | Error | Description |
|-------------|-------|-------------|
| 400 | `INVALID_REQUEST` | Missing required fields or invalid data |
| 404 | `SESSION_NOT_FOUND` | Session ID doesn't exist or expired |
| 409 | `SESSION_CONFLICT` | Session in invalid state for operation |
| 413 | `FILE_TOO_LARGE` | File exceeds 5 GB limit |
| 500 | `INTERNAL_ERROR` | Server error during processing |
| 503 | `SERVICE_UNAVAILABLE` | Server temporarily unavailable |

### Error Examples

**Session Not Found:**
```json
{
  "error": "Session not found"
}
```

**Invalid State:**
```json
{
  "error": "Cannot upload files to session in this state"
}
```

**Processing Failed:**
```json
{
  "sessionId": "01K9BEZ521NSBNCRZ0SFYXCF24",
  "status": "failed",
  "errors": [
    "Invalid file_count",
    "Worker connection failed"
  ]
}
```

---

## Rate Limits

Currently, no rate limits are enforced. This will be added in a future version.

**Recommended client behavior:**
- Poll status endpoint no more than once per second
- Implement exponential backoff for retries
- Respect 24-hour session timeout

---

## Examples

### Complete Upload Workflow (cURL)

```bash
#!/bin/bash

SERVER="http://upload.arke.institute"

# 1. Initialize session
echo "Initializing session..."
INIT=$(curl -s -X POST "$SERVER/api/v1/upload/init" \
  -H "Content-Type: application/json" \
  -d '{
    "uploader": "Jane Doe",
    "rootPath": "/archives/photos_2024"
  }')

SESSION_ID=$(echo "$INIT" | jq -r .sessionId)
UPLOAD_URL=$(echo "$INIT" | jq -r .uploadUrl)

echo "Session ID: $SESSION_ID"

# 2. Upload files
echo "Uploading files..."
curl -X POST "$UPLOAD_URL" \
  -F "files=@photo1.jpg" \
  -F "files=@photo2.jpg" \
  -F "files=@documents/report.pdf;filename=documents/report.pdf"

# 3. Trigger processing
echo "Starting processing..."
curl -X POST "$SERVER/api/v1/upload/$SESSION_ID/process" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'

# 4. Poll status
echo "Monitoring progress..."
while true; do
  STATUS=$(curl -s "$SERVER/api/v1/upload/$SESSION_ID/status")
  STATE=$(echo "$STATUS" | jq -r .status)

  echo "Status: $STATE"

  if [ "$STATE" = "completed" ] || [ "$STATE" = "failed" ]; then
    echo "$STATUS" | jq .
    BATCH_ID=$(echo "$STATUS" | jq -r .batchId)
    echo "Batch ID for orchestrator: $BATCH_ID"
    break
  fi

  sleep 2
done
```

### Upload Directory Recursively (Bash)

```bash
#!/bin/bash

SERVER="http://upload.arke.institute"
DIR="./my-archive"

# Initialize
INIT=$(curl -s -X POST "$SERVER/api/v1/upload/init" \
  -H "Content-Type: application/json" \
  -d '{
    "uploader": "Archivist",
    "rootPath": "/archives/collection_2024"
  }')

SESSION_ID=$(echo "$INIT" | jq -r .sessionId)
UPLOAD_URL=$(echo "$INIT" | jq -r .uploadUrl)

# Upload all files preserving structure
cd "$DIR"
find . -type f | while read FILE; do
  RELATIVE="${FILE#./}"
  echo "Uploading: $RELATIVE"
  curl -s -X POST "$UPLOAD_URL" \
    -F "files=@$FILE;filename=$RELATIVE"
done
cd -

# Process
curl -X POST "$SERVER/api/v1/upload/$SESSION_ID/process" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'
```

### JavaScript/Fetch Example

```javascript
const SERVER = 'http://upload.arke.institute';

async function uploadFiles(files, uploader) {
  // 1. Initialize session
  const initResponse = await fetch(`${SERVER}/api/v1/upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uploader,
      rootPath: '/archives/web_upload'
    })
  });

  const { sessionId, uploadUrl } = await initResponse.json();
  console.log('Session:', sessionId);

  // 2. Upload files
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file, file.webkitRelativePath || file.name);
  }

  await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });

  // 3. Trigger processing
  await fetch(`${SERVER}/api/v1/upload/${sessionId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun: false })
  });

  // 4. Poll status
  while (true) {
    const statusResponse = await fetch(
      `${SERVER}/api/v1/upload/${sessionId}/status`
    );
    const status = await statusResponse.json();

    console.log('Status:', status.status, status.phase);

    if (status.status === 'completed' || status.status === 'failed') {
      console.log('Batch ID for orchestrator:', status.batchId);
      return status;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Usage
const fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('change', async (e) => {
  const result = await uploadFiles(e.target.files, 'Web User');
  console.log('Upload complete:', result);
});
```

### Python Example

```python
import requests
import time
import os

SERVER = 'http://upload.arke.institute'

def upload_directory(directory, uploader):
    # Initialize session
    init_response = requests.post(
        f'{SERVER}/api/v1/upload/init',
        json={
            'uploader': uploader,
            'rootPath': '/archives/python_upload'
        }
    )

    data = init_response.json()
    session_id = data['sessionId']
    upload_url = data['uploadUrl']

    print(f'Session: {session_id}')

    # Upload files
    for root, dirs, files in os.walk(directory):
        for file in files:
            file_path = os.path.join(root, file)
            relative_path = os.path.relpath(file_path, directory)

            print(f'Uploading: {relative_path}')

            with open(file_path, 'rb') as f:
                files = {
                    'files': (relative_path, f, 'application/octet-stream')
                }
                requests.post(upload_url, files=files)

    # Trigger processing
    requests.post(
        f'{SERVER}/api/v1/upload/{session_id}/process',
        json={'dryRun': False}
    )

    # Poll status
    while True:
        status_response = requests.get(
            f'{SERVER}/api/v1/upload/{session_id}/status'
        )
        status = status_response.json()

        print(f"Status: {status['status']} - {status.get('phase', '')}")

        if status['status'] in ['completed', 'failed']:
            print(f"Batch ID for orchestrator: {status.get('batchId')}")
            return status

        time.sleep(2)

# Usage
result = upload_directory('./my-files', 'Python Script')
print('Complete:', result)
```

---

## Browser Integration

### HTML5 Directory Upload

```html
<!DOCTYPE html>
<html>
<head>
  <title>Arke Upload</title>
</head>
<body>
  <h1>Upload Directory</h1>

  <input type="file" id="folderInput" webkitdirectory directory multiple>
  <button onclick="upload()">Upload</button>

  <div id="progress"></div>

  <script>
    const SERVER = 'http://upload.arke.institute';

    async function upload() {
      const files = document.getElementById('folderInput').files;
      const progressDiv = document.getElementById('progress');

      if (files.length === 0) {
        alert('Please select a folder');
        return;
      }

      progressDiv.innerHTML = 'Initializing...';

      // Initialize
      const initResp = await fetch(`${SERVER}/api/v1/upload/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploader: 'Web Browser',
          rootPath: '/archives/browser_upload'
        })
      });

      const { sessionId, uploadUrl } = await initResp.json();
      progressDiv.innerHTML += `<br>Session: ${sessionId}`;

      // Upload files
      progressDiv.innerHTML += '<br>Uploading files...';
      const formData = new FormData();

      for (const file of files) {
        // Use webkitRelativePath to preserve directory structure
        const filename = file.webkitRelativePath || file.name;
        formData.append('files', file, filename);
      }

      await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      progressDiv.innerHTML += '<br>Files uploaded, processing...';

      // Process
      await fetch(`${SERVER}/api/v1/upload/${sessionId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false })
      });

      // Monitor
      while (true) {
        const statusResp = await fetch(
          `${SERVER}/api/v1/upload/${sessionId}/status`
        );
        const status = await statusResp.json();

        progressDiv.innerHTML = `Status: ${status.status}<br>` +
                               `Phase: ${status.phase || 'N/A'}<br>` +
                               `Progress: ${status.progress?.percentComplete || 0}%`;

        if (status.status === 'completed') {
          progressDiv.innerHTML += '<br><strong>✓ Upload Complete!</strong>';
          break;
        } else if (status.status === 'failed') {
          progressDiv.innerHTML += '<br><strong>✗ Upload Failed</strong>';
          progressDiv.innerHTML += '<br>Errors: ' + status.errors.join(', ');
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  </script>
</body>
</html>
```

---

## Best Practices

### Client Implementation

1. **Always check health endpoint** before starting uploads
2. **Store session ID** for recovery in case of interruption
3. **Implement retry logic** for network failures
4. **Use exponential backoff** when polling status
5. **Show progress** to users during upload and processing
6. **Handle errors gracefully** with user-friendly messages
7. **Validate files client-side** before uploading
8. **Cancel sessions** if user abandons upload

### Performance Optimization

1. **Upload files in batches** rather than one at a time
2. **Use multiple concurrent uploads** (but respect server resources)
3. **Compress files** before uploading when appropriate
4. **Calculate CIDs client-side** to verify integrity
5. **Resume interrupted uploads** using stored session IDs

### Security Considerations

1. **Validate file types** before uploading
2. **Scan for malware** on client side when possible
3. **Use HTTPS** in production (not currently enabled)
4. **Implement authentication** (coming in future version)
5. **Rate limit requests** on client side
6. **Don't expose sensitive metadata** in uploads

---

## Troubleshooting

### Upload Fails Immediately

**Check:**
- Health endpoint returns `healthy`
- Worker URL is reachable
- Session hasn't expired (24 hours)
- Files don't exceed 5 GB limit

### Processing Gets Stuck

**Check:**
- Status endpoint for error messages
- Server logs for detailed errors
- Worker API is accessible
- Sufficient disk space on server

### Files Missing After Upload

**Check:**
- Correct filename parameter in multipart upload
- Directory structure preserved in relative path
- Files uploaded before triggering processing
- Session status shows files received

### Getting "Session Not Found"

**Possible causes:**
- Session expired (24 hours timeout)
- Invalid session ID
- Session deleted after completion
- Server restarted (sessions in memory)

---

## Support

**Server Status:** http://upload.arke.institute/api/v1/health

**Repository:** https://github.com/Arke-Institute/upload-server

**Deployment Docs:** See `deployment/README.md`

---

**API Version:** 2.0.0
**Last Updated:** November 6, 2025

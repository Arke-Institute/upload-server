# Arke Upload Server

REST API server for uploading files and directories to the Arke Institute's digital archive system.

**Live Server:** http://upload.arke.institute

---

## Overview

The Arke Upload Server accepts file uploads via HTTP, preprocesses them (TIFF→JPEG conversion), and transfers them to R2 storage for permanent archival and processing. It provides a simple REST API for web applications, scripts, and programmatic uploads.

### Key Features

- 📤 **REST API** - Simple HTTP endpoints for all operations
- 📁 **Directory Upload** - Preserves folder structure from uploads
- 🖼️ **TIFF Preprocessing** - Automatic conversion to JPEG for OCR
- 📊 **Progress Tracking** - Real-time status updates
- 🔄 **Session Management** - Resume uploads, track progress
- 💾 **Large Files** - Up to 5 GB per file
- 🚀 **Production Ready** - Running on AWS EC2 with auto-restart

### Architecture

```
Browser/Client → Upload Server → R2 Storage → Worker (Processing)
                      ↓
                Preprocessing
              (TIFF → JPEG)
```

---

## Quick Start

### Upload a File

```bash
SERVER="http://upload.arke.institute"

# 1. Initialize session
INIT=$(curl -s -X POST "$SERVER/api/v1/upload/init" \
  -H "Content-Type: application/json" \
  -d '{"uploader": "Your Name"}')

SESSION_ID=$(echo "$INIT" | jq -r .sessionId)
UPLOAD_URL=$(echo "$INIT" | jq -r .uploadUrl)

# 2. Upload file
curl -X POST "$UPLOAD_URL" -F "files=@document.pdf"

# 3. Process
curl -X POST "$SERVER/api/v1/upload/$SESSION_ID/process" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'

# 4. Check status
curl "$SERVER/api/v1/upload/$SESSION_ID/status" | jq .
```

### Upload a Directory

```bash
SERVER="http://upload.arke.institute"
DIR="./my-archive"

# Initialize
INIT=$(curl -s -X POST "$SERVER/api/v1/upload/init" \
  -H "Content-Type: application/json" \
  -d '{"uploader": "Your Name", "rootPath": "/archives/my_collection"}')

SESSION_ID=$(echo "$INIT" | jq -r .sessionId)
UPLOAD_URL=$(echo "$INIT" | jq -r .uploadUrl)

# Upload all files with directory structure
cd "$DIR"
find . -type f | while read FILE; do
  RELATIVE="${FILE#./}"
  curl -s -X POST "$UPLOAD_URL" -F "files=@$FILE;filename=$RELATIVE"
done
cd -

# Process and monitor
curl -X POST "$SERVER/api/v1/upload/$SESSION_ID/process" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'

# Poll for completion
while true; do
  STATUS=$(curl -s "$SERVER/api/v1/upload/$SESSION_ID/status" | jq -r .status)
  echo "Status: $STATUS"
  [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] && break
  sleep 2
done
```

---

## Documentation

- **[API Reference](./API.md)** - Complete API documentation
- **[Deployment Guide](./deployment/README.md)** - How to deploy your own instance
- **[Quick Deploy](./deployment/QUICKSTART.md)** - Get running in 5 minutes
- **[Worker API](./INGEST_API.md)** - Backend processing API

---

## Installation

### Using Docker (Recommended)

```bash
git clone https://github.com/Arke-Institute/upload-server.git
cd upload-server

# Build image
docker build -t arke-upload-server .

# Run container
docker run -d \
  -p 3000:3000 \
  -e WORKER_URL=https://ingest.arke.institute \
  -v /data/uploads:/tmp/arke-uploads \
  arke-upload-server
```

### From Source

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server
export WORKER_URL=https://ingest.arke.institute
export PORT=3000
npm start
```

### Deploy to AWS EC2

```bash
# Automated deployment
./deployment/scripts/01-create-ec2.sh
./deployment/scripts/02-deploy-server.sh

# Server will be running at: http://YOUR_IP
```

See [deployment/README.md](./deployment/README.md) for full instructions.

---

## API Endpoints

### Health Check
```http
GET /api/v1/health
```

Returns server health and configuration.

### Initialize Upload Session
```http
POST /api/v1/upload/init
Content-Type: application/json

{
  "uploader": "Jane Doe",
  "rootPath": "/archives/collection_name"
}
```

Returns session ID and upload URL.

### Upload Files
```http
POST /api/v1/upload/:sessionId/files
Content-Type: multipart/form-data

files: <file1>
files: <file2>
```

Upload one or more files. Can be called multiple times.

### Trigger Processing
```http
POST /api/v1/upload/:sessionId/process
Content-Type: application/json

{
  "dryRun": false
}
```

Start processing uploaded files.

### Get Status
```http
GET /api/v1/upload/:sessionId/status
```

Returns current status and progress.

### Cancel Upload
```http
DELETE /api/v1/upload/:sessionId
```

Cancel upload and clean up files.

See [API.md](./API.md) for complete documentation with examples.

---

## Usage Examples

### JavaScript/Fetch

```javascript
const SERVER = 'http://upload.arke.institute';

async function uploadFiles(files, uploader) {
  // Initialize
  const init = await fetch(`${SERVER}/api/v1/upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploader })
  });
  const { sessionId, uploadUrl } = await init.json();

  // Upload files
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file, file.name);
  }
  await fetch(uploadUrl, { method: 'POST', body: formData });

  // Process
  await fetch(`${SERVER}/api/v1/upload/${sessionId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun: false })
  });

  // Monitor
  while (true) {
    const status = await fetch(`${SERVER}/api/v1/upload/${sessionId}/status`);
    const data = await status.json();
    if (data.status === 'completed' || data.status === 'failed') {
      return data;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}
```

### Python

```python
import requests

def upload_directory(directory, uploader):
    server = 'http://upload.arke.institute'

    # Initialize
    init = requests.post(f'{server}/api/v1/upload/init',
                        json={'uploader': uploader})
    session_id = init.json()['sessionId']
    upload_url = init.json()['uploadUrl']

    # Upload files
    for file_path in Path(directory).rglob('*'):
        if file_path.is_file():
            with open(file_path, 'rb') as f:
                files = {'files': (str(file_path.relative_to(directory)), f)}
                requests.post(upload_url, files=files)

    # Process
    requests.post(f'{server}/api/v1/upload/{session_id}/process',
                 json={'dryRun': False})

    # Monitor
    while True:
        status = requests.get(f'{server}/api/v1/upload/{session_id}/status')
        data = status.json()
        if data['status'] in ['completed', 'failed']:
            return data
        time.sleep(2)
```

### HTML5 Directory Upload

```html
<input type="file" id="folderInput" webkitdirectory multiple>
<button onclick="upload()">Upload</button>

<script>
async function upload() {
  const files = document.getElementById('folderInput').files;
  const server = 'http://upload.arke.institute';

  // Initialize
  const init = await fetch(`${server}/api/v1/upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploader: 'Web User' })
  });
  const { sessionId, uploadUrl } = await init.json();

  // Upload files with directory structure
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file, file.webkitRelativePath || file.name);
  }
  await fetch(uploadUrl, { method: 'POST', body: formData });

  // Process
  await fetch(`${server}/api/v1/upload/${sessionId}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun: false })
  });

  alert('Upload started! Session: ' + sessionId);
}
</script>
```

---

## Configuration

### Environment Variables

```bash
# Server port (default: 3000)
PORT=3000

# Worker API URL for batch processing
WORKER_URL=https://ingest.arke.institute

# Upload directory (default: /tmp/arke-uploads)
UPLOAD_DIR=/tmp/arke-uploads

# Environment (development/production)
NODE_ENV=production

# Enable debug logging
DEBUG=false
```

### Upload Session Options

Configure preprocessing and processing options when initializing a session:

```json
{
  "uploader": "Required",
  "rootPath": "/archives/path",
  "parentPi": "01234567890123456789012345",
  "preprocessor": {
    "tiffMode": "convert",
    "tiffQuality": 95
  },
  "processing": {
    "enableOcr": true,
    "generateIiif": true
  }
}
```

**TIFF Modes:**
- `convert` (default) - Convert TIFFs to JPEG for OCR
- `preserve` - Keep original TIFFs
- `both` - Upload both TIFF and JPEG
- `none` - No TIFF processing

See [API.md](./API.md#initialize-upload-session) for all options.

---

## File Processing

### Supported File Types

All file types are accepted. Recommended formats:
- Images: JPEG, PNG, TIFF, GIF
- Documents: PDF, TXT, MD
- Metadata: JSON, XML, YAML
- Archives: ZIP (extract manually before upload)

### File Size Limits

- Maximum per file: 5 GB
- Maximum session size: No hard limit (be reasonable)
- Session timeout: 24 hours

### TIFF Preprocessing

TIFF files are automatically detected and can be converted to JPEG:

**Before:**
```
document.tiff (80 MB)
```

**After (with tiffMode: "convert"):**
```
document.jpg (4 MB, 95% quality)
```

**Benefits:**
- Reduced storage costs (95% reduction typical)
- Faster OCR processing
- Better web compatibility
- Original image quality preserved at 95% JPEG

### Directory Structure

Directory structure is preserved from uploads:

**Upload:**
```
box_1/
  folder_a/
    document_01.tiff
    document_02.tiff
  folder_b/
    photo.jpg
```

**Archive:**
```
/archives/collection_name/box_1/folder_a/document_01.jpg
/archives/collection_name/box_1/folder_a/document_02.jpg
/archives/collection_name/box_1/folder_b/photo.jpg
```

---

## System Architecture

### Components

```
┌──────────────┐
│   Client     │  Browser, CLI, Script
└──────┬───────┘
       │ HTTP
       ↓
┌──────────────────────────────┐
│   Upload Server (Express)    │
│                              │
│  • Session Management        │
│  • File Upload (Multer)      │
│  • TIFF→JPEG (Sharp)         │
│  • Progress Tracking         │
└──────┬──────────────┬────────┘
       │              │
       │ Presigned    │ Batch API
       │ URLs         │
       ↓              ↓
┌─────────────┐  ┌──────────────┐
│ R2 Storage  │  │    Worker    │
│  (Files)    │  │ (Processing) │
└─────────────┘  └──────────────┘
```

### Upload Workflow

1. **Initialize** - Client creates session with metadata
2. **Upload** - Files sent to server, stored in temp directory
3. **Scan** - Server scans files, computes CIDs
4. **Preprocess** - TIFFs converted to JPEG
5. **Upload to R2** - Files uploaded using presigned URLs
6. **Finalize** - Batch created in worker for processing
7. **Cleanup** - Temp files deleted after 5 minutes

### Storage

**Temporary Storage:**
- Location: `/tmp/arke-uploads/` (or `UPLOAD_DIR`)
- Structure: `{sessionId}/{uploaded_files}`
- Lifetime: Deleted 5 minutes after completion
- Docker mount: `/data/arke-uploads` → container `/tmp/arke-uploads`

**Permanent Storage:**
- R2 bucket via worker API
- Path format: `staging/{batchId}/{rootPath}/{filename}`
- Retention: Permanent (managed by worker)

### Sessions

- **Format:** ULID (e.g., `01K9BEZ521NSBNCRZ0SFYXCF24`)
- **Timeout:** 24 hours
- **Storage:** In-memory (lost on restart)
- **Cleanup:** Automatic after completion or timeout

---

## Development

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode (with hot reload)
npm run dev

# Run tests
npm test

# Type checking
npm run type-check

# Build
npm run build
```

### Project Structure

```
src/
├── server/
│   ├── index.ts              # Express app entry point
│   ├── routes/
│   │   ├── health.ts         # Health check endpoint
│   │   └── upload.ts         # Upload API routes
│   └── services/
│       └── upload-session.ts # Session management
├── lib/
│   ├── uploader.ts           # Upload orchestration
│   ├── scanner.ts            # File scanning
│   ├── preprocessor.ts       # TIFF preprocessing
│   ├── worker-client.ts      # Worker API client
│   ├── simple.ts             # Simple uploads (<5MB)
│   └── multipart.ts          # Multipart uploads (≥5MB)
├── types/
│   ├── api.ts                # API request/response types
│   ├── batch.ts              # Batch configuration
│   ├── file.ts               # File metadata
│   └── server.ts             # Server types
└── utils/
    ├── logger.ts             # Logging
    ├── errors.ts             # Error types
    └── hash.ts               # CID computation
```

### Testing

```bash
# Run test upload
./test-upload.sh example_dirs/sample_archive_deep

# Test with local Docker
docker-compose up -d
curl http://localhost:3000/api/v1/health

# Integration test
npm test
```

---

## Deployment

### Production Deployment

**Automated EC2 Deployment:**
```bash
# Create EC2 instance
./deployment/scripts/01-create-ec2.sh

# Deploy application
./deployment/scripts/02-deploy-server.sh

# Check status
./deployment/scripts/check-status.sh
```

**Manual Deployment:**
```bash
# Build Docker image
docker build -t arke-upload-server .

# Run with systemd/supervisor
npm run build
NODE_ENV=production npm start
```

See [deployment/README.md](./deployment/README.md) for complete instructions.

### Infrastructure

**Current Production Setup:**
- **Instance:** AWS EC2 t3.small (2 vCPU, 2 GB RAM)
- **OS:** Amazon Linux 2023
- **Container:** Docker with systemd auto-restart
- **Proxy:** Nginx (port 80 → 3000)
- **DNS:** upload.arke.institute (via Cloudflare)
- **Storage:** 30 GB GP3 SSD
- **Cost:** ~$26/month

### Monitoring

```bash
# Check server health
curl http://upload.arke.institute/api/v1/health | jq .

# View logs (SSH to server)
sudo journalctl -u arke-upload -f

# Check Docker container
sudo docker logs arke-upload -f

# Monitor sessions
curl http://upload.arke.institute/api/v1/health | jq .sessions
```

---

## Troubleshooting

### Server Not Responding

```bash
# Check health endpoint
curl http://upload.arke.institute/api/v1/health

# Check EC2 instance
./deployment/scripts/check-status.sh

# View logs
ssh -i arke-upload-key.pem ec2-user@IP 'sudo journalctl -u arke-upload -n 50'
```

### Upload Fails

**Check:**
1. Session hasn't expired (24 hours)
2. Files don't exceed 5 GB
3. Worker URL is accessible
4. Sufficient disk space

**Common issues:**
- Files too large → Split into smaller files
- Session expired → Create new session
- Worker unreachable → Check WORKER_URL environment variable
- Disk full → Clean up old sessions or increase storage

### Processing Stuck

**Check status endpoint for errors:**
```bash
curl http://upload.arke.institute/api/v1/upload/SESSION_ID/status | jq .
```

**Common issues:**
- Invalid file count → Ensure files uploaded before processing
- Worker connection failed → Check worker API health
- Preprocessing error → Check file formats and permissions

### Sessions Disappearing

Sessions are stored in memory and will be lost on server restart. For production use:
1. Implement Redis/database storage
2. Add session recovery
3. Set up monitoring and alerts

---

## Security

### Current Security

- ✅ Non-root Docker user
- ✅ Security group with minimal ports
- ✅ Automatic session timeout (24h)
- ✅ File size limits (5 GB)
- ⏳ Authentication (coming soon)
- ⏳ HTTPS/SSL (manual setup)

### Production Checklist

Before going to production:

- [ ] Set up SSL certificate (Let's Encrypt)
- [ ] Add authentication/API keys
- [ ] Implement rate limiting
- [ ] Set up monitoring/alerting
- [ ] Configure log rotation
- [ ] Set up automated backups
- [ ] Review security group rules
- [ ] Enable CloudWatch logging
- [ ] Add CORS configuration
- [ ] Implement virus scanning

---

## Contributing

Contributions welcome! This is an internal project but we accept pull requests.

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Style

- TypeScript strict mode
- ESM modules (`.js` imports)
- Async/await for all I/O
- Comprehensive error handling
- Logging for all operations

---

## License

Proprietary - Arke Institute

---

## Support

- **Documentation:** [API.md](./API.md), [deployment/README.md](./deployment/README.md)
- **Health Check:** http://upload.arke.institute/api/v1/health
- **Repository:** https://github.com/Arke-Institute/upload-server
- **Issues:** https://github.com/Arke-Institute/upload-server/issues

---

**Version:** 2.0.0
**Status:** 🟢 Production
**Server:** http://upload.arke.institute

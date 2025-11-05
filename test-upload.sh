#!/bin/bash

# Test script for upload server
# Usage: ./test-upload.sh <directory>

set -e

DIR="${1:-example_dirs/sample_archive_deep}"
SERVER_URL="http://localhost:3000"
UPLOADER="Test User - Docker Test"

echo "=================================================="
echo "Testing Arke Upload Server with directory: $DIR"
echo "=================================================="

# Step 1: Initialize session
echo -e "\n[Step 1] Initializing upload session..."
INIT_RESPONSE=$(curl -s -X POST "$SERVER_URL/api/v1/upload/init" \
  -H "Content-Type: application/json" \
  -d "{
    \"uploader\": \"$UPLOADER\",
    \"rootPath\": \"/test/archive\",
    \"parentPi\": \"00000000000000000000000000\"
  }")

echo "$INIT_RESPONSE" | jq .

SESSION_ID=$(echo "$INIT_RESPONSE" | jq -r .sessionId)
UPLOAD_URL=$(echo "$INIT_RESPONSE" | jq -r .uploadUrl)

echo "Session ID: $SESSION_ID"

# Step 2: Upload files (preserving directory structure)
echo -e "\n[Step 2] Uploading files..."
cd "$DIR"

# Find all files and upload them
FILES=$(find . -type f ! -name ".DS_Store")
for FILE in $FILES; do
  # Remove leading ./
  RELATIVE_PATH="${FILE#./}"
  echo "Uploading: $RELATIVE_PATH"

  # Use curl with -F to upload file with webkitRelativePath simulation
  curl -s -X POST "$UPLOAD_URL" \
    -F "files=@$FILE;filename=$RELATIVE_PATH" \
    > /dev/null
done

cd - > /dev/null

echo "Upload complete!"

# Step 3: Trigger processing
echo -e "\n[Step 3] Triggering processing..."
PROCESS_RESPONSE=$(curl -s -X POST "$SERVER_URL/api/v1/upload/$SESSION_ID/process" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}')

echo "$PROCESS_RESPONSE" | jq .

# Step 4: Poll status
echo -e "\n[Step 4] Polling status (will check every 2 seconds)..."
STATUS="processing"
while [[ "$STATUS" == "processing" || "$STATUS" == "receiving" || "$STATUS" == "ready" ]]; do
  sleep 2
  STATUS_RESPONSE=$(curl -s "$SERVER_URL/api/v1/upload/$SESSION_ID/status")
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r .status)
  PHASE=$(echo "$STATUS_RESPONSE" | jq -r .phase)
  PERCENT=$(echo "$STATUS_RESPONSE" | jq -r '.progress.percentComplete // 0')

  echo "Status: $STATUS | Phase: $PHASE | Progress: $PERCENT%"

  # Show full response on final iteration
  if [[ "$STATUS" != "processing" ]]; then
    echo -e "\nFinal status:"
    echo "$STATUS_RESPONSE" | jq .
  fi
done

echo -e "\n=================================================="
echo "Test complete! Final status: $STATUS"
echo "=================================================="

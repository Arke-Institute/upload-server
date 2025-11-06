#!/bin/bash

################################################################################
# Arke Upload Server Deployment Script
#
# This script connects to the EC2 instance and sets up the upload server:
# - Installs Docker
# - Installs Git and clones repository
# - Builds Docker image
# - Sets up systemd service for auto-restart
# - Configures nginx reverse proxy
# - Starts the server
#
# Prerequisites:
# - EC2 instance created with 01-create-ec2.sh
# - instance-info.json exists in deployment/
# - SSH key file (.pem) available
#
# Usage: ./02-deploy-server.sh [worker-url]
################################################################################

set -e

# Configuration
WORKER_URL="${1:-https://ingest.arke.institute}"
REPO_URL="https://github.com/Arke-Institute/upload-server.git"
BRANCH="feature/server-api"
INFO_FILE="deployment/instance-info.json"

echo "=================================================="
echo "Arke Upload Server - Deployment"
echo "=================================================="
echo ""

# Check if instance info exists
if [ ! -f "$INFO_FILE" ]; then
  echo "❌ Error: Instance info file not found: $INFO_FILE"
  echo "   Run ./deployment/scripts/01-create-ec2.sh first"
  exit 1
fi

# Load instance info
INSTANCE_ID=$(jq -r '.instanceId' "$INFO_FILE")
PUBLIC_IP=$(jq -r '.publicIp' "$INFO_FILE")
KEY_NAME=$(jq -r '.keyName' "$INFO_FILE")
KEY_FILE="${KEY_NAME}.pem"

if [ ! -f "$KEY_FILE" ]; then
  echo "❌ Error: SSH key file not found: $KEY_FILE"
  exit 1
fi

echo "Target Instance:"
echo "  Instance ID: $INSTANCE_ID"
echo "  Public IP:   $PUBLIC_IP"
echo "  SSH Key:     $KEY_FILE"
echo ""
echo "Configuration:"
echo "  Worker URL:  $WORKER_URL"
echo "  Repository:  $REPO_URL"
echo "  Branch:      $BRANCH"
echo ""

# Test SSH connection
echo "Testing SSH connection..."
if ! ssh -i "$KEY_FILE" -o ConnectTimeout=10 -o StrictHostKeyChecking=no ec2-user@"$PUBLIC_IP" "echo 'SSH connection successful'" 2>&1 | grep -q "successful"; then
  echo "❌ Error: Cannot connect to EC2 instance via SSH"
  echo "   The instance may still be initializing. Wait 2-3 minutes and try again."
  exit 1
fi

echo "✓ SSH connection successful"
echo ""

# Create deployment script that will run on the EC2 instance
echo "Creating remote deployment script..."

REMOTE_SCRIPT=$(cat <<'REMOTE_EOF'
#!/bin/bash
set -e

WORKER_URL="{{WORKER_URL}}"
REPO_URL="{{REPO_URL}}"
BRANCH="{{BRANCH}}"

echo "=================================================="
echo "Installing Dependencies"
echo "=================================================="
echo ""

# Update system
echo "[1/8] Updating system packages..."
sudo dnf update -y -q > /dev/null 2>&1
echo "✓ System updated"

# Install Docker
echo "[2/8] Installing Docker..."
if ! command -v docker &> /dev/null; then
  sudo dnf install -y docker -q > /dev/null 2>&1
  sudo systemctl enable docker > /dev/null 2>&1
  sudo systemctl start docker
  sudo usermod -aG docker ec2-user
  echo "✓ Docker installed and started"
else
  echo "✓ Docker already installed"
fi

# Install Git
echo "[3/8] Installing Git..."
if ! command -v git &> /dev/null; then
  sudo dnf install -y git -q > /dev/null 2>&1
  echo "✓ Git installed"
else
  echo "✓ Git already installed"
fi

# Install nginx
echo "[4/8] Installing nginx..."
if ! command -v nginx &> /dev/null; then
  sudo dnf install -y nginx -q > /dev/null 2>&1
  sudo systemctl enable nginx > /dev/null 2>&1
  echo "✓ Nginx installed"
else
  echo "✓ Nginx already installed"
fi

echo ""
echo "=================================================="
echo "Cloning Repository"
echo "=================================================="
echo ""

# Clone repository
echo "[5/8] Cloning repository..."
cd ~
if [ -d "upload-server" ]; then
  echo "Repository already exists, updating..."
  cd upload-server
  git fetch origin > /dev/null 2>&1
  git checkout "$BRANCH" > /dev/null 2>&1
  git pull origin "$BRANCH" > /dev/null 2>&1
else
  git clone "$REPO_URL" upload-server > /dev/null 2>&1
  cd upload-server
  git checkout "$BRANCH" > /dev/null 2>&1
fi
echo "✓ Repository ready at ~/upload-server"

echo ""
echo "=================================================="
echo "Building Docker Image"
echo "=================================================="
echo ""

# Build Docker image
echo "[6/8] Building Docker image (this may take 3-5 minutes)..."
sudo docker build -t arke-upload-server:latest . > /tmp/docker-build.log 2>&1
echo "✓ Docker image built"

echo ""
echo "=================================================="
echo "Configuring Services"
echo "=================================================="
echo ""

# Create systemd service for Docker container
echo "[7/8] Creating systemd service..."
sudo tee /etc/systemd/system/arke-upload.service > /dev/null <<EOF
[Unit]
Description=Arke Upload Server
After=docker.service
Requires=docker.service

[Service]
Type=simple
Restart=always
RestartSec=5s
ExecStartPre=-/usr/bin/docker stop arke-upload
ExecStartPre=-/usr/bin/docker rm arke-upload
ExecStart=/usr/bin/docker run \\
  --name arke-upload \\
  -p 3000:3000 \\
  -e NODE_ENV=production \\
  -e WORKER_URL=${WORKER_URL} \\
  -e UPLOAD_DIR=/tmp/arke-uploads \\
  -e DEBUG=false \\
  -v /data/arke-uploads:/tmp/arke-uploads \\
  arke-upload-server:latest
ExecStop=/usr/bin/docker stop arke-upload

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable arke-upload.service > /dev/null 2>&1
echo "✓ Systemd service created"

# Configure nginx reverse proxy
echo "[8/8] Configuring nginx..."
sudo tee /etc/nginx/conf.d/arke-upload.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 5G;
    client_body_timeout 300s;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts for large uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
EOF

sudo nginx -t > /dev/null 2>&1
sudo systemctl restart nginx
echo "✓ Nginx configured"

echo ""
echo "=================================================="
echo "Starting Server"
echo "=================================================="
echo ""

# Create upload directory with correct permissions for Docker container
sudo mkdir -p /data/arke-uploads
# Docker container runs as nodejs user (UID 1001)
sudo chown -R 1001:1001 /data/arke-uploads
echo "✓ Upload directory created with correct permissions"

# Start service
sudo systemctl start arke-upload.service
echo "✓ Service started"

# Wait for service to be healthy
echo ""
echo "Waiting for server to be ready..."
for i in {1..30}; do
  if curl -sf http://localhost:3000/api/v1/health > /dev/null 2>&1; then
    echo "✓ Server is healthy"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Server failed to start. Check logs with: sudo journalctl -u arke-upload -n 50"
    exit 1
  fi
  sleep 2
done

echo ""
echo "=================================================="
echo "✅ Deployment Complete!"
echo "=================================================="
echo ""
echo "Service Status:"
sudo systemctl status arke-upload.service --no-pager | head -15
echo ""
echo "Health Check:"
curl -s http://localhost:3000/api/v1/health | jq .
echo ""
echo "Useful Commands:"
echo "  View logs:        sudo journalctl -u arke-upload -f"
echo "  Restart service:  sudo systemctl restart arke-upload"
echo "  Stop service:     sudo systemctl stop arke-upload"
echo "  Rebuild image:    cd ~/upload-server && sudo docker build -t arke-upload-server:latest ."
echo ""

REMOTE_EOF
)

# Replace variables in remote script
REMOTE_SCRIPT="${REMOTE_SCRIPT//\{\{WORKER_URL\}\}/$WORKER_URL}"
REMOTE_SCRIPT="${REMOTE_SCRIPT//\{\{REPO_URL\}\}/$REPO_URL}"
REMOTE_SCRIPT="${REMOTE_SCRIPT//\{\{BRANCH\}\}/$BRANCH}"

echo "Deploying to EC2 instance..."
echo ""

# Copy and execute deployment script on EC2
ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ec2-user@"$PUBLIC_IP" "cat > /tmp/deploy.sh && chmod +x /tmp/deploy.sh && /tmp/deploy.sh" <<< "$REMOTE_SCRIPT"

echo ""
echo "=================================================="
echo "✅ Deployment Successful!"
echo "=================================================="
echo ""
echo "Server Access:"
echo "  HTTP:  http://${PUBLIC_IP}"
echo "  API:   http://${PUBLIC_IP}/api/v1/health"
echo ""
echo "SSH Access:"
echo "  ssh -i ${KEY_FILE} ec2-user@${PUBLIC_IP}"
echo ""
echo "Next Steps:"
echo "  1. Test the API: curl http://${PUBLIC_IP}/api/v1/health"
echo "  2. Update DNS to point to ${PUBLIC_IP}"
echo "  3. Set up SSL certificate (Let's Encrypt)"
echo ""
echo "=================================================="

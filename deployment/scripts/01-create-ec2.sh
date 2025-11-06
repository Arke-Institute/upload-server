#!/bin/bash

################################################################################
# EC2 Instance Creation Script for Arke Upload Server
#
# This script creates an EC2 instance with all necessary configuration:
# - t3.small instance (2 vCPU, 2 GB RAM)
# - Amazon Linux 2023
# - 30 GB GP3 storage
# - Security group with HTTP/HTTPS/SSH access
# - SSH key pair for access
#
# Prerequisites:
# - AWS CLI installed and configured (aws configure)
# - Valid AWS credentials with EC2 permissions
# - SSH key pair or this script will create one
#
# Usage: ./01-create-ec2.sh [key-name] [your-ip]
################################################################################

set -e

# Configuration
PROJECT_NAME="arke-upload-server"
INSTANCE_TYPE="t3.small"
AMI_NAME="al2023-ami-*"  # Amazon Linux 2023 (latest)
VOLUME_SIZE=30 # 30 GB
KEY_NAME="${1:-arke-upload-key}"
MY_IP="${2:-$(curl -s https://checkip.amazonaws.com)/32}"
REGION="${AWS_REGION:-us-east-1}"

echo "=================================================="
echo "Arke Upload Server - EC2 Instance Creation"
echo "=================================================="
echo ""
echo "Configuration:"
echo "  Project Name:    $PROJECT_NAME"
echo "  Instance Type:   $INSTANCE_TYPE"
echo "  Region:          $REGION"
echo "  Key Pair:        $KEY_NAME"
echo "  Your IP:         $MY_IP"
echo "  Volume Size:     ${VOLUME_SIZE} GB"
echo ""

# Check AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
  echo "❌ Error: AWS CLI not configured or credentials invalid"
  echo "   Run: aws configure"
  exit 1
fi

echo "✓ AWS credentials verified"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "  Account: $ACCOUNT_ID"
echo ""

# Step 1: Find latest Amazon Linux 2023 AMI
echo "[Step 1/6] Finding latest Amazon Linux 2023 AMI..."
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=$AMI_NAME" \
            "Name=architecture,Values=x86_64" \
            "Name=state,Values=available" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text \
  --region "$REGION")

if [ -z "$AMI_ID" ] || [ "$AMI_ID" == "None" ]; then
  echo "❌ Error: Could not find Amazon Linux 2023 AMI"
  exit 1
fi

echo "✓ Found AMI: $AMI_ID"
echo ""

# Step 2: Create or verify SSH key pair
echo "[Step 2/6] Checking SSH key pair..."
if aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$REGION" &> /dev/null; then
  echo "✓ Key pair '$KEY_NAME' already exists"
else
  echo "Creating new key pair: $KEY_NAME"
  aws ec2 create-key-pair \
    --key-name "$KEY_NAME" \
    --query 'KeyMaterial' \
    --output text \
    --region "$REGION" > "${KEY_NAME}.pem"

  chmod 400 "${KEY_NAME}.pem"
  echo "✓ Key pair created and saved to: ${KEY_NAME}.pem"
  echo "  ⚠️  IMPORTANT: Keep this file safe! You'll need it to SSH into the instance."
fi
echo ""

# Step 3: Create security group
echo "[Step 3/6] Creating security group..."
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' \
  --output text \
  --region "$REGION")

SG_NAME="${PROJECT_NAME}-sg"
SG_DESC="Security group for Arke Upload Server"

# Check if security group exists
if aws ec2 describe-security-groups --group-names "$SG_NAME" --region "$REGION" &> /dev/null; then
  SG_ID=$(aws ec2 describe-security-groups \
    --group-names "$SG_NAME" \
    --query 'SecurityGroups[0].GroupId' \
    --output text \
    --region "$REGION")
  echo "✓ Security group already exists: $SG_ID"
else
  SG_ID=$(aws ec2 create-security-group \
    --group-name "$SG_NAME" \
    --description "$SG_DESC" \
    --vpc-id "$VPC_ID" \
    --region "$REGION" \
    --query 'GroupId' \
    --output text)

  echo "✓ Created security group: $SG_ID"

  # Add inbound rules
  echo "  Adding inbound rules..."

  # SSH (your IP only)
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 22 \
    --cidr "$MY_IP" \
    --region "$REGION" &> /dev/null || true

  # HTTP (world)
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0 \
    --region "$REGION" &> /dev/null || true

  # HTTPS (world)
  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0 \
    --region "$REGION" &> /dev/null || true

  echo "  ✓ SSH (22) from $MY_IP"
  echo "  ✓ HTTP (80) from anywhere"
  echo "  ✓ HTTPS (443) from anywhere"
fi
echo ""

# Step 4: Create instance
echo "[Step 4/6] Launching EC2 instance..."

INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --block-device-mappings "[{\"DeviceName\":\"/dev/xvda\",\"Ebs\":{\"VolumeSize\":${VOLUME_SIZE},\"VolumeType\":\"gp3\"}}]" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT_NAME}},{Key=Project,Value=arke-upload}]" \
  --region "$REGION" \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "✓ Instance launched: $INSTANCE_ID"
echo ""

# Step 5: Wait for instance to be running
echo "[Step 5/6] Waiting for instance to start..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"
echo "✓ Instance is running"
echo ""

# Step 6: Get instance details
echo "[Step 6/6] Retrieving instance details..."
INSTANCE_INFO=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$REGION" \
  --query 'Reservations[0].Instances[0]')

PUBLIC_IP=$(echo "$INSTANCE_INFO" | jq -r '.PublicIpAddress')
PUBLIC_DNS=$(echo "$INSTANCE_INFO" | jq -r '.PublicDnsName')
PRIVATE_IP=$(echo "$INSTANCE_INFO" | jq -r '.PrivateIpAddress')

echo "✓ Instance details retrieved"
echo ""

# Save instance info to file
INFO_FILE="deployment/instance-info.json"
cat > "$INFO_FILE" <<EOF
{
  "instanceId": "$INSTANCE_ID",
  "publicIp": "$PUBLIC_IP",
  "publicDns": "$PUBLIC_DNS",
  "privateIp": "$PRIVATE_IP",
  "region": "$REGION",
  "keyName": "$KEY_NAME",
  "securityGroupId": "$SG_ID",
  "createdAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

echo "=================================================="
echo "✅ EC2 Instance Created Successfully!"
echo "=================================================="
echo ""
echo "Instance Details:"
echo "  Instance ID:     $INSTANCE_ID"
echo "  Public IP:       $PUBLIC_IP"
echo "  Public DNS:      $PUBLIC_DNS"
echo "  Region:          $REGION"
echo "  SSH Key:         $KEY_NAME"
echo ""
echo "SSH Connection:"
echo "  ssh -i ${KEY_NAME}.pem ec2-user@${PUBLIC_IP}"
echo ""
echo "Instance info saved to: $INFO_FILE"
echo ""
echo "Next Steps:"
echo "  1. Wait 2-3 minutes for instance to fully initialize"
echo "  2. Run: ./deployment/scripts/02-deploy-server.sh"
echo ""
echo "⚠️  Note: It may take a few minutes for SSH to become available"
echo "=================================================="

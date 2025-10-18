#!/bin/bash
#
# VXLAN Machine Registration Script
#
# This script collects machine information and registers it with the VXLAN Manager.
# Run this script on each machine that should be monitored.
#

set -e

# Configuration
MANAGER_URL="${VXLAN_MANAGER_URL:-http://192.168.100.1:8000}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Collect machine information
log_info "Collecting machine information..."

HOSTNAME=$(hostname)
if [ -z "$HOSTNAME" ]; then
    log_error "Failed to get hostname"
    exit 1
fi

# Get primary IP address
IP_ADDRESS=$(hostname -I | awk '{print $1}')
if [ -z "$IP_ADDRESS" ]; then
    log_error "Failed to get IP address"
    exit 1
fi

# Get MAC address of primary interface
# Find the interface with the IP address
INTERFACE=$(ip addr show | grep -B2 "$IP_ADDRESS" | head -n1 | awk '{print $2}' | tr -d ':')
if [ -z "$INTERFACE" ]; then
    log_warn "Failed to determine network interface, using first UP interface"
    INTERFACE=$(ip link show | grep -B1 'state UP' | head -n1 | awk '{print $2}' | tr -d ':')
fi

MAC_ADDRESS=$(ip link show "$INTERFACE" 2>/dev/null | grep link/ether | awk '{print $2}')
if [ -z "$MAC_ADDRESS" ]; then
    log_error "Failed to get MAC address"
    exit 1
fi

log_info "Machine Information:"
log_info "  Hostname:    $HOSTNAME"
log_info "  IP Address:  $IP_ADDRESS"
log_info "  MAC Address: $MAC_ADDRESS"
log_info "  Interface:   $INTERFACE"

# Prepare JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
  "hostname": "$HOSTNAME",
  "ip_address": "$IP_ADDRESS",
  "mac_address": "$MAC_ADDRESS"
}
EOF
)

# Register with VXLAN Manager
log_info "Registering with VXLAN Manager at $MANAGER_URL..."

HTTP_CODE=$(curl -s -o /tmp/vxlan_register_response.json -w "%{http_code}" \
    -X PUT \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD" \
    "$MANAGER_URL/api/machines/$IP_ADDRESS")

if [ "$HTTP_CODE" -eq 200 ]; then
    log_info "Machine updated successfully (HTTP $HTTP_CODE)"
    cat /tmp/vxlan_register_response.json | python3 -m json.tool 2>/dev/null || cat /tmp/vxlan_register_response.json
    exit 0
elif [ "$HTTP_CODE" -eq 201 ]; then
    log_info "Machine registered successfully (HTTP $HTTP_CODE)"
    cat /tmp/vxlan_register_response.json | python3 -m json.tool 2>/dev/null || cat /tmp/vxlan_register_response.json
    exit 0
else
    log_error "Registration failed with HTTP $HTTP_CODE"
    cat /tmp/vxlan_register_response.json 2>/dev/null
    exit 1
fi

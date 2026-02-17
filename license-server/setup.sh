#!/bin/bash
# ─────────────────────────────────────────────────────────────
# CraftOS License Server — VPS Setup & Run Script
# ─────────────────────────────────────────────────────────────
# Usage:
#   1. Clone the repo:  git clone https://github.com/Bakenake/minecraft-server-manager.git
#   2. cd minecraft-server-manager/license-server
#   3. chmod +x setup.sh
#   4. ./setup.sh
#
# After first run, just use: ./setup.sh start
# ─────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  CraftOS License Server Setup${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════${NC}"
  echo ""
}

# ─── Check for Node.js ──────────────────────────────────────

check_node() {
  if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed.${NC}"
    echo ""
    echo "Install it with:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -"
    echo "  sudo apt install -y nodejs"
    exit 1
  fi

  NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js v18+ required (found v$(node -v))${NC}"
    exit 1
  fi

  echo -e "${GREEN}✓${NC} Node.js $(node -v)"
}

# ─── Create .env if it doesn't exist ────────────────────────

setup_env() {
  if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    echo ""

    # Generate a random JWT secret
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

    # Prompt for admin credentials
    read -p "  Admin username [admin]: " ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-admin}

    read -sp "  Admin password: " ADMIN_PASS
    echo ""

    if [ -z "$ADMIN_PASS" ]; then
      ADMIN_PASS=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")
      echo -e "  ${YELLOW}Auto-generated password: ${ADMIN_PASS}${NC}"
    fi

    read -p "  Port [3100]: " PORT
    PORT=${PORT:-3100}

    read -p "  Domain (for CORS, leave empty for any): " DOMAIN

    cat > .env << EOF
# CraftOS License Server Configuration
PORT=${PORT}
HOST=0.0.0.0

# Admin credentials
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASS}

# JWT secret (auto-generated, keep this safe)
JWT_SECRET=${JWT_SECRET}

# Database location
DB_PATH=./data/licenses.db

# CORS (comma-separated origins, or * for any)
ALLOWED_ORIGINS=${DOMAIN:-*}

# Rate limiting
RATE_LIMIT_VALIDATE_WINDOW_MS=60000
RATE_LIMIT_VALIDATE_MAX=30
RATE_LIMIT_ADMIN_WINDOW_MS=60000
RATE_LIMIT_ADMIN_MAX=60

# HTTPS (set to true if terminating SSL here instead of a reverse proxy)
HTTPS_ENABLED=false
# HTTPS_CERT_PATH=/etc/letsencrypt/live/yourdomain/fullchain.pem
# HTTPS_KEY_PATH=/etc/letsencrypt/live/yourdomain/privkey.pem
EOF

    echo -e "${GREEN}✓${NC} .env created"
  else
    echo -e "${GREEN}✓${NC} .env already exists"
  fi
}

# ─── Install & Build ────────────────────────────────────────

install_deps() {
  echo -e "${CYAN}Installing dependencies...${NC}"
  npm install --production=false
  echo -e "${GREEN}✓${NC} Dependencies installed"
}

build_project() {
  echo -e "${CYAN}Building TypeScript...${NC}"
  npx tsc
  echo -e "${GREEN}✓${NC} Build complete"
}

# ─── Create data directory ───────────────────────────────────

setup_data() {
  mkdir -p data
  echo -e "${GREEN}✓${NC} Data directory ready"
}

# ─── Systemd Service ────────────────────────────────────────

setup_systemd() {
  if [ "$(id -u)" -ne 0 ]; then
    echo -e "${YELLOW}Skipping systemd setup (not root). Run with sudo to install as service.${NC}"
    return
  fi

  SERVICE_FILE="/etc/systemd/system/craftos-license.service"

  if [ -f "$SERVICE_FILE" ]; then
    echo -e "${GREEN}✓${NC} systemd service already exists"
    return
  fi

  read -p "  Install as systemd service? [Y/n]: " INSTALL_SERVICE
  INSTALL_SERVICE=${INSTALL_SERVICE:-Y}

  if [[ "$INSTALL_SERVICE" =~ ^[Yy]$ ]]; then
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=CraftOS License Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${SCRIPT_DIR}
EnvironmentFile=${SCRIPT_DIR}/.env
ExecStart=$(which node) ${SCRIPT_DIR}/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable craftos-license
    echo -e "${GREEN}✓${NC} systemd service installed & enabled"
    echo -e "  Start with: ${CYAN}sudo systemctl start craftos-license${NC}"
    echo -e "  Logs:       ${CYAN}journalctl -u craftos-license -f${NC}"
  fi
}

# ─── Start the server ───────────────────────────────────────

start_server() {
  if [ -f dist/index.js ]; then
    echo ""
    echo -e "${GREEN}Starting CraftOS License Server...${NC}"
    echo ""
    node dist/index.js
  else
    echo -e "${RED}Build not found. Run ./setup.sh first.${NC}"
    exit 1
  fi
}

# ─── Update from GitHub ─────────────────────────────────────

update() {
  echo -e "${CYAN}Pulling latest from GitHub...${NC}"
  cd "$SCRIPT_DIR/.."
  git pull origin main
  cd "$SCRIPT_DIR"

  echo -e "${CYAN}Installing dependencies...${NC}"
  npm install --production=false

  echo -e "${CYAN}Rebuilding...${NC}"
  npx tsc

  echo ""
  echo -e "${GREEN}✓ Updated!${NC}"

  # Restart systemd service if it exists
  if systemctl is-active --quiet craftos-license 2>/dev/null; then
    echo -e "${CYAN}Restarting service...${NC}"
    sudo systemctl restart craftos-license
    echo -e "${GREEN}✓${NC} Service restarted"
  else
    echo -e "${YELLOW}Restart the server manually or run: ./setup.sh start${NC}"
  fi
}

# ─── Main ────────────────────────────────────────────────────

case "${1:-}" in
  start)
    start_server
    ;;
  update)
    update
    ;;
  build)
    build_project
    ;;
  *)
    print_header
    check_node
    setup_env
    setup_data
    install_deps
    build_project
    setup_systemd

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Setup Complete!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  Start:      ${CYAN}./setup.sh start${NC}"
    echo -e "  Update:     ${CYAN}./setup.sh update${NC}"
    echo -e "  Dashboard:  ${CYAN}http://localhost:$(grep PORT .env | head -1 | cut -d= -f2)/dashboard/${NC}"
    echo ""

    read -p "  Start the server now? [Y/n]: " START_NOW
    START_NOW=${START_NOW:-Y}
    if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
      start_server
    fi
    ;;
esac

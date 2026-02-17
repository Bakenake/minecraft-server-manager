# CraftOS License Server

Lightweight license validation API for the CraftOS Server Manager desktop app.

## Architecture

```
Desktop App (Electron)
    ↓ POST /v1/license/validate (every hour)
    ↓ POST /v1/license/activate (on key entry)
    ↓ POST /v1/license/deactivate (on key removal)
License Server (Express + SQLite)
    ↑ Admin API (/admin/*)
Admin Dashboard / CLI
```

## Quick Start (Development)

```bash
cd license-server
npm install

# Set environment variables
export ADMIN_USERNAME=admin
export ADMIN_PASSWORD=your-secure-password
export JWT_SECRET=your-random-jwt-secret

# Start in dev mode
npm run dev
# → http://localhost:3100
```

## API Endpoints

### Public (called by desktop app)

| Method | Path                      | Description                      |
|--------|---------------------------|----------------------------------|
| POST   | `/v1/license/validate`    | Phone-home validation            |
| POST   | `/v1/license/activate`    | Activate key on a machine        |
| POST   | `/v1/license/deactivate`  | Deactivate key from a machine    |

### Admin (JWT-protected)

| Method | Path                              | Description                |
|--------|-----------------------------------|----------------------------|
| POST   | `/admin/login`                    | Get JWT token              |
| GET    | `/admin/licenses`                 | List all licenses          |
| POST   | `/admin/licenses`                 | Create license(s)          |
| GET    | `/admin/licenses/:id`             | Get license details        |
| PATCH  | `/admin/licenses/:id`             | Update license             |
| DELETE | `/admin/licenses/:id`             | Delete license             |
| POST   | `/admin/licenses/:id/revoke`      | Revoke a license           |
| POST   | `/admin/licenses/:id/reactivate`  | Reactivate revoked license |
| GET    | `/admin/activations`              | List all activations       |
| DELETE | `/admin/activations/:id`          | Remove activation          |
| GET    | `/admin/stats`                    | Dashboard statistics       |
| GET    | `/admin/logs`                     | Validation log history     |

### Health Check

| Method | Path       | Description    |
|--------|------------|----------------|
| GET    | `/health`  | Server status  |

---

## VPS Deployment Guide

### 1. Provision a VPS

Any Linux VPS works (DigitalOcean, Linode, Hetzner, Vultr, etc.).

- **Minimum specs**: 1 vCPU, 512 MB RAM, 10 GB disk
- **OS**: Ubuntu 22.04+ or Debian 12+
- **Open port**: **443** (HTTPS only)

### 2. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 3. Clone & Install

```bash
cd /opt
git clone https://github.com/Bakenake/minecraft-server-manager.git craftos
cd craftos/license-server
npm install --production
npm run build
```

### 4. Configure Environment

```bash
sudo cp .env.example /etc/craftos-license/.env
sudo nano /etc/craftos-license/.env
```

**Required settings:**

```env
PORT=3100
HOST=127.0.0.1
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>
JWT_SECRET=<random-64-char-string>
DB_PATH=/opt/craftos/license-server/data/licenses.db
```

### 5. Setup Caddy (Recommended) or Nginx as Reverse Proxy

#### Option A: Caddy (auto HTTPS)

```bash
sudo apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```
api.craftos.app {
    reverse_proxy localhost:3100
}
```

```bash
sudo systemctl enable caddy
sudo systemctl restart caddy
```

Caddy automatically provisions Let's Encrypt certificates. **No extra port config needed.**

#### Option B: Nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/craftos-license`:

```nginx
server {
    listen 80;
    server_name api.craftos.app;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/craftos-license /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.craftos.app
sudo systemctl restart nginx
```

### 6. Create systemd Service

Create `/etc/systemd/system/craftos-license.service`:

```ini
[Unit]
Description=CraftOS License Server
After=network.target

[Service]
Type=simple
User=craftos
WorkingDirectory=/opt/craftos/license-server
EnvironmentFile=/etc/craftos-license/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/craftos/license-server/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false craftos
sudo mkdir -p /opt/craftos/license-server/data
sudo chown -R craftos:craftos /opt/craftos/license-server
sudo systemctl daemon-reload
sudo systemctl enable craftos-license
sudo systemctl start craftos-license
```

### 7. DNS Setup

Point your domain to the VPS IP:

```
api.craftos.app  →  A Record  →  <your-vps-ip>
```

### 8. Verify

```bash
curl https://api.craftos.app/health
# {"status":"ok","timestamp":"..."}
```

---

## Firewall Rules

Only **one port** needs to be open on the VPS:

| Port | Protocol | Direction | Purpose                |
|------|----------|-----------|------------------------|
| 443  | TCP      | Inbound   | HTTPS (license API)    |
| 22   | TCP      | Inbound   | SSH (admin access)     |

**No ports need to be opened on end-user machines.** The desktop app makes outbound HTTPS requests only.

```bash
# UFW example
sudo ufw allow 22/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## Admin Usage Examples

### Login

```bash
TOKEN=$(curl -s -X POST https://api.craftos.app/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}' | jq -r .token)
```

### Create a Premium Lifetime Key

```bash
curl -X POST https://api.craftos.app/admin/licenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"tier":"premium","plan":"lifetime","email":"customer@example.com","maxActivations":3}'
```

### Create Batch Keys (e.g., 10 keys for a giveaway)

```bash
curl -X POST https://api.craftos.app/admin/licenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"tier":"premium","plan":"monthly","count":10}'
```

### Revoke a Key

```bash
curl -X POST https://api.craftos.app/admin/licenses/<license-id>/revoke \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"reason":"Chargeback"}'
```

### View Stats

```bash
curl https://api.craftos.app/admin/stats \
  -H "Authorization: Bearer $TOKEN"
```

---

## Connecting the Desktop App

The desktop app reads `LICENSE_SERVER_URL` from its environment. It defaults to:

```
https://api.craftos.app/v1/license
```

The app calls these endpoints every hour for phone-home validation:

- `POST ${LICENSE_SERVER_URL}/validate` — sends license key + hardware ID
- If validation fails for 7 consecutive days, the app reverts to free tier

To point the app at a different server during development:

```bash
# In electron/main.js env block or as system env var
LICENSE_SERVER_URL=http://localhost:3100/v1/license
```

---

## Backup

The entire license database is a single SQLite file:

```bash
# Backup
cp /opt/craftos/license-server/data/licenses.db /backup/licenses-$(date +%Y%m%d).db

# Set up daily backup cron
echo "0 2 * * * cp /opt/craftos/license-server/data/licenses.db /backup/licenses-\$(date +\%Y\%m\%d).db" | crontab -
```

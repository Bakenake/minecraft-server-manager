# CraftOS Server Manager

A production-ready, professional Minecraft server management platform with a modern dashboard UI. Manage multiple Minecraft servers, plugins, players, backups, and more — all from your browser.

![Version](https://img.shields.io/badge/version-1.0.0--beta.1-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

### Server Lifecycle Management
- **Multi-server support** — Run Vanilla, Paper, Spigot, Forge, and Fabric servers simultaneously
- **Automatic downloads** — Fetches server JARs from Mojang API and PaperMC API
- **One-click start/stop/restart** with graceful shutdown
- **Crash detection & auto-restart** with exponential backoff
- **Java auto-detection** — Finds installed Java versions and recommends the best one
- **JVM optimization** — Pre-configured G1GC flags for optimal performance

### Real-Time Dashboard
- **Live console** with color-coded log output (info, warn, error)
- **System metrics** — CPU, RAM, disk, and network usage charts
- **TPS monitoring** — Track server performance in real-time
- **Player count graphs** across all servers
- **WebSocket-powered** — Instant updates with no polling

### Player Management
- **Online player list** with Minecraft head avatars
- **Kick / Ban / Unban** directly from the dashboard
- **Whitelist management** — Add/remove players
- **Play time tracking** and first/last seen timestamps

### Plugin & Mod Management
- **List installed plugins/mods** with version and description
- **Enable/Disable** plugins (rename to `.disabled`)
- **Upload new plugins** via drag-and-drop
- **Error detection** — Flags plugins causing server errors

### File Management
- **Web-based file browser** with breadcrumb navigation
- **Inline file editor** for configs (YAML, JSON, properties, etc.)
- **Upload / Download / Delete / Rename** operations
- **Create directories** and manage server files safely
- **Path traversal protection** — Sandboxed to server directories

### Backup System
- **One-click backups** as compressed `.tar.gz` archives
- **Scheduled backups** via cron expressions
- **Restore backups** with automatic pre-restore snapshot
- **Backup size tracking** and storage management

### Security
- **JWT authentication** with configurable expiration
- **Role-based access control** — Admin, Moderator, Viewer
- **Optional TOTP 2FA** via authenticator apps
- **Rate limiting** on all API endpoints
- **Helmet security headers** and CORS configuration

### Scheduling
- **Cron-based task scheduler** for automated operations
- **Auto-restart**, **auto-backup**, and **custom commands** on schedule
- **Enable/disable** tasks without deleting them

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js 20+, Fastify 5, TypeScript |
| **Frontend** | React 18, Vite 6, TailwindCSS 3.4 |
| **Database** | SQLite (better-sqlite3) + Drizzle ORM |
| **Real-time** | WebSocket (@fastify/websocket) |
| **Auth** | JWT + bcrypt + TOTP (otplib) |
| **State** | Zustand 5 with persist middleware |
| **Charts** | Recharts 2.15 |
| **Metrics** | systeminformation |
| **Packaging** | pkg (standalone binaries) |
| **CI/CD** | GitHub Actions |
| **Container** | Docker + Docker Compose |

---

## Quick Start

### Prerequisites
- **Node.js** >= 20.0.0
- **npm** >= 9.0.0
- **Java** 17+ (for Minecraft servers)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/craftos-server-manager.git
cd craftos-server-manager

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings (at minimum, set JWT_SECRET)

# Start in development mode
npm run dev
```

Open **http://localhost:5173** in your browser. On first launch, you'll be guided through creating an admin account.

### Production Build

```bash
# Build everything
npm run build

# Start production server
npm start
```

The built application is served from **http://localhost:3001**.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `JWT_SECRET` | (required) | Secret for JWT signing |
| `JWT_EXPIRES_IN` | `7d` | Token expiration time |
| `DB_PATH` | `./data/craftos.db` | SQLite database path |
| `SERVERS_DIR` | `./servers` | Directory for server files |
| `BACKUPS_DIR` | `./backups` | Directory for backup files |
| `LOGS_DIR` | `./logs` | Application log directory |
| `ENABLE_2FA` | `true` | Allow two-factor auth |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW` | `1m` | Rate limit time window |

---

## Docker

### Docker Compose (recommended)

```bash
cd docker

# Set your JWT secret
export JWT_SECRET="your-random-secret-here"

# Start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Docker Build

```bash
docker build -f docker/Dockerfile -t craftos .
docker run -d \
  --name craftos \
  -p 3001:3001 \
  -e JWT_SECRET="your-secret" \
  -v craftos-data:/app/data \
  -v craftos-servers:/app/servers \
  -v craftos-backups:/app/backups \
  craftos
```

---

## Packaging

Create standalone executables for distribution:

```bash
# Build first
npm run build

# Package for Windows
node scripts/package-win.js

# Output: release/win/CraftOS.exe
```

The release CI workflow automatically builds for Windows, macOS, and Linux on tagged commits.

---

## Project Structure

```
craftos-server-manager/
├── backend/
│   └── src/
│       ├── auth/           # JWT, password, TOTP, middleware
│       ├── db/             # SQLite schema & migrations
│       ├── routes/         # REST API route handlers
│       ├── services/       # Core business logic
│       ├── utils/          # Logger, Java detection, downloads
│       ├── ws/             # WebSocket handler
│       ├── app.ts          # Fastify app configuration
│       ├── config.ts       # Environment configuration
│       └── index.ts        # Entry point
├── frontend/
│   └── src/
│       ├── components/     # Layout & reusable components
│       ├── hooks/          # WebSocket & custom hooks
│       ├── lib/            # API client & utilities
│       ├── pages/          # Route page components
│       ├── stores/         # Zustand state stores
│       └── types/          # TypeScript interfaces
├── scripts/                # Build & packaging scripts
├── docker/                 # Dockerfile & docker-compose
├── .github/workflows/      # CI/CD pipelines
└── .env.example            # Environment template
```

---

## API Reference

All API routes are prefixed with `/api`.

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/status` | Check if setup is required |
| POST | `/auth/setup` | Create initial admin account |
| POST | `/auth/login` | Authenticate user |
| GET | `/auth/me` | Get current user |
| POST | `/auth/change-password` | Update password |
| GET | `/auth/users` | List all users (admin) |
| POST | `/auth/users` | Create user (admin) |
| DELETE | `/auth/users/:id` | Delete user (admin) |
| POST | `/auth/2fa/enable` | Enable TOTP 2FA |
| POST | `/auth/2fa/verify` | Verify TOTP token |
| POST | `/auth/2fa/disable` | Disable TOTP 2FA |

### Servers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/servers` | List all servers |
| POST | `/servers` | Create a new server |
| GET | `/servers/:id` | Get server details |
| PUT | `/servers/:id` | Update server config |
| DELETE | `/servers/:id` | Delete server |
| POST | `/servers/:id/start` | Start server |
| POST | `/servers/:id/stop` | Stop server gracefully |
| POST | `/servers/:id/restart` | Restart server |
| POST | `/servers/:id/kill` | Force kill server |
| POST | `/servers/:id/command` | Send console command |
| GET | `/servers/:id/logs` | Get recent log lines |
| GET | `/servers/versions/:type` | List available versions |
| GET | `/servers/java` | Detect Java installations |

### Players
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/players/:serverId/online` | Get online players |
| POST | `/players/:serverId/kick` | Kick a player |
| POST | `/players/:serverId/ban` | Ban a player |
| POST | `/players/:serverId/unban` | Unban a player |
| GET | `/players/:serverId/bans` | List active bans |
| GET | `/players/:serverId/whitelist` | Get whitelist |
| POST | `/players/:serverId/whitelist` | Add to whitelist |
| DELETE | `/players/:serverId/whitelist/:name` | Remove from whitelist |

### Backups
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/backups/:serverId` | List backups |
| POST | `/backups/:serverId` | Create backup |
| POST | `/backups/:serverId/restore/:backupId` | Restore backup |
| DELETE | `/backups/:serverId/:backupId` | Delete backup |
| GET | `/backups/:serverId/size` | Get total backup size |

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/files/:serverId` | List directory contents |
| GET | `/files/:serverId/read` | Read file content |
| PUT | `/files/:serverId/write` | Write file content |
| DELETE | `/files/:serverId` | Delete file or directory |
| POST | `/files/:serverId/mkdir` | Create directory |
| POST | `/files/:serverId/rename` | Rename file or directory |
| POST | `/files/:serverId/upload` | Upload file |
| GET | `/files/:serverId/download` | Download file |

### Plugins
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/plugins/:serverId` | List installed plugins |
| POST | `/plugins/:serverId/enable` | Enable a plugin |
| POST | `/plugins/:serverId/disable` | Disable a plugin |
| POST | `/plugins/:serverId/upload` | Upload a plugin |
| DELETE | `/plugins/:serverId/:fileName` | Remove a plugin |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/system/metrics` | Get system metrics |
| GET | `/system/info` | Get application info |
| GET | `/system/tasks` | List scheduled tasks |
| POST | `/system/tasks` | Create scheduled task |
| PUT | `/system/tasks/:id` | Update scheduled task |
| DELETE | `/system/tasks/:id` | Delete scheduled task |
| POST | `/system/feedback` | Submit feedback |
| GET | `/system/audit-log` | Get audit log (admin) |
| GET | `/system/settings` | Get app settings |
| PUT | `/system/settings` | Update app settings |

### WebSocket
Connect to `ws://host:port/ws?token=JWT_TOKEN`

**Client Messages:**
```json
{ "type": "subscribe", "data": { "serverId": "xxx" } }
{ "type": "unsubscribe", "data": { "serverId": "xxx" } }
{ "type": "command", "data": { "serverId": "xxx", "command": "say hello" } }
```

**Server Messages:**
```json
{ "type": "server:log", "data": { "serverId": "xxx", "line": "..." } }
{ "type": "server:status", "data": { "serverId": "xxx", "newStatus": "running" } }
{ "type": "server:player_join", "data": { "serverId": "xxx", "player": "...", "playerCount": 5 } }
{ "type": "server:tps", "data": { "serverId": "xxx", "tps": 19.8 } }
{ "type": "server:crash", "data": { "serverId": "xxx" } }
{ "type": "metrics", "data": { "system": {...}, "servers": {...} } }
```

---

## Development

```bash
# Start backend in watch mode
npm run dev:backend

# Start frontend dev server
npm run dev:frontend

# Or both simultaneously
npm run dev
```

The frontend dev server runs on port 5173 with API proxy to port 3001.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Roadmap

- [ ] RCON protocol support
- [ ] Server world map rendering (Dynmap integration)
- [ ] Plugin marketplace integration (Modrinth, Spigot)
- [ ] Multi-node cluster management
- [ ] Mobile companion app
- [ ] Automatic server JAR updates
- [ ] Discord webhook notifications
- [ ] Custom dashboard widgets
- [ ] Server template system
- [ ] Performance profiling tools

---

<div align="center">
  <strong>CraftOS Server Manager</strong> — Built for server administrators who demand reliability.
</div>

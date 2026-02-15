# GeekSpace 2.0 -- Operations Runbook

## Prerequisites

| Requirement | Minimum |
|---|---|
| VPS | 2 vCPU, 2 GB RAM (Hostinger KVM2 or equivalent) |
| OS | Ubuntu 22.04+ / Debian 12+ |
| Docker | 24.0+ with Compose v2 |
| Caddy | 2.6+ (installed on host, not in Docker) |
| Domain | A-record pointing to VPS IP |
| Ollama | Running on host or accessible via Docker network |

---

## First Deploy

### 1. Install System Dependencies

```bash
# Docker
curl -fsSL https://get.docker.com | sh

# Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy

# Ollama
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull qwen2.5-coder:7b
```

### 2. Configure Caddy

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
{
    email admin@yourdomain.com
}

yourdomain.com {
    handle /api/* {
        reverse_proxy localhost:3001
    }
    handle {
        root * /var/www/geekspace
        try_files {path} /index.html
        file_server
    }
}
EOF

mkdir -p /var/www/geekspace
systemctl restart caddy
```

Caddy handles TLS automatically via Let's Encrypt. No manual certificate management needed.

### 3. Create Shared Docker Network

```bash
# Required for GeekSpace to reach Ollama/OpenClaw containers
docker network create geekspace-shared
```

### 4. Clone and Configure

```bash
git clone https://github.com/trendywink247-afk/GeekSpace2.0.git
cd GeekSpace2.0

cp .env.example .env
nano .env
```

Required `.env` values for production:

```env
NODE_ENV=production
JWT_SECRET=$(openssl rand -hex 64)
ENCRYPTION_KEY=$(openssl rand -hex 32)
CORS_ORIGINS=https://yourdomain.com
PUBLIC_URL=https://yourdomain.com
OLLAMA_BASE_URL=http://ollama-container-name:11434    # Docker container DNS
OLLAMA_MODEL=qwen2.5-coder:7b
REDIS_URL=redis://redis:6379
SEED_DEMO_DATA=false
```

### 5. Build and Start

```bash
# Build and start containers
docker compose up -d --build

# Copy frontend to Caddy serving directory
docker cp geekspace-app:/app/dist/. /var/www/geekspace/

# Verify
docker compose ps          # all services "Up (healthy)"
curl https://yourdomain.com/api/health
```

### 6. Create Your Account

Visit `https://yourdomain.com` and sign up, or use the API:

```bash
curl -X POST https://yourdomain.com/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"YourPassword123","username":"yourname"}'
```

---

## Update Procedure

```bash
cd GeekSpace2.0

# 1. Pull latest code
git pull origin main

# 2. Rebuild and restart
docker compose up -d --build

# 3. Copy updated frontend to Caddy
docker cp geekspace-app:/app/dist/. /var/www/geekspace/

# 4. Verify
docker compose ps
curl https://yourdomain.com/api/health

# 5. Check logs
docker compose logs --tail=50 geekspace
```

> **Important**: Step 3 is required because Caddy serves the frontend from `/var/www/geekspace`, not from the Docker container. Forgetting this step means users see the old frontend.

---

## Container Management

### Service Overview

| Container | Image | Purpose | Port |
|---|---|---|---|
| `geekspace-app` | `geekspace20-geekspace` | Express API + built frontend | 3001 |
| `geekspace-redis` | `redis:7-alpine` | Job queue + cache | 6379 (internal) |
| `geekspace-edith-bridge` | `geekspace20-edith-bridge` | OpenClaw WS-to-HTTP bridge | 8787 (internal) |

### Common Commands

```bash
# Status
docker compose ps

# Logs (structured JSON in production)
docker compose logs -f geekspace          # follow app logs
docker compose logs --tail=100 geekspace  # last 100 lines

# Restart a single service
docker compose restart geekspace

# Rebuild and restart (after code changes)
docker compose up -d --build geekspace

# Start with EDITH bridge (optional profile)
docker compose --profile edith up -d

# Resource usage
docker stats --no-stream
```

---

## Backup & Restore

### Backup SQLite Database

```bash
# Quick backup to host
docker cp geekspace-app:/app/data/geekspace.db ./backups/geekspace-$(date +%Y%m%d).db

# Volume-level backup (works even if container is stopped)
docker run --rm \
  -v geekspace20_geekspace-data:/data \
  -v $(pwd)/backups:/backups \
  alpine cp /data/geekspace.db /backups/geekspace-$(date +%Y%m%d).db
```

### Restore from Backup

```bash
# 1. Stop the app
docker compose stop geekspace

# 2. Copy backup into volume
docker run --rm \
  -v geekspace20_geekspace-data:/data \
  -v $(pwd)/backups:/backups \
  alpine cp /backups/geekspace-20260215.db /data/geekspace.db

# 3. Restart
docker compose start geekspace
```

### Automated Daily Backups (cron)

```bash
# Add to crontab: crontab -e
0 3 * * * mkdir -p /root/backups && docker run --rm \
  -v geekspace20_geekspace-data:/data \
  -v /root/backups:/backups \
  alpine cp /data/geekspace.db /backups/geekspace-$(date +\%Y\%m\%d).db

# Prune backups older than 30 days
0 4 * * * find /root/backups -name "geekspace-*.db" -mtime +30 -delete
```

---

## Secret Rotation

### Rotate JWT_SECRET

1. Generate new secret: `openssl rand -hex 64`
2. Update `JWT_SECRET` in `.env`
3. Restart: `docker compose restart geekspace`
4. **Impact**: All existing sessions are invalidated -- users must log in again

### Rotate ENCRYPTION_KEY

> **Warning**: Changing the encryption key will make previously encrypted API keys unreadable. Users must re-enter their API keys after rotation.

1. Generate new key: `openssl rand -hex 32`
2. Update `ENCRYPTION_KEY` in `.env`
3. Restart: `docker compose restart geekspace`

---

## Monitoring

### Health Endpoint

```bash
curl https://yourdomain.com/api/health
```

Response:
```json
{
  "ok": true,
  "status": "ok",
  "timestamp": "2026-02-15T12:00:00.000Z",
  "version": "2.2.0",
  "uptime": 86400,
  "edith": true,
  "ollama": true,
  "components": {
    "database": "ok",
    "ollama": "reachable",
    "openrouter": "configured",
    "edith": "reachable"
  }
}
```

| Status | Meaning |
|---|---|
| `"ok": true` | Database is healthy (core requirement) |
| `"status": "degraded"` | Database is down |
| `ollama: "reachable"` | Ollama responded to `/api/tags` |
| `edith: "reachable"` | EDITH bridge health check passed |

### Log Analysis

```bash
# All logs (follow)
docker compose logs -f

# App logs only
docker compose logs -f geekspace

# Filter errors (level 50 = error in Pino)
docker compose logs geekspace 2>&1 | grep '"level":50'

# Filter warnings (level 40)
docker compose logs geekspace 2>&1 | grep '"level":40'

# Count 401 errors (auth failures)
docker compose logs geekspace 2>&1 | grep -c '"status":401'
```

### Caddy Logs

```bash
journalctl -u caddy -f              # follow
journalctl -u caddy --since "1h"    # last hour
```

### Resource Usage

```bash
docker stats --no-stream

# Expected baseline (idle):
# geekspace-app:   ~80MB RAM, <1% CPU
# geekspace-redis: ~10MB RAM, <1% CPU
```

---

## Troubleshooting

### Container won't start

```bash
docker compose logs geekspace
# Look for: "FATAL: Required env var JWT_SECRET is not set"
# Fix: ensure .env has JWT_SECRET and ENCRYPTION_KEY set
```

### Ollama connection refused

```bash
# Check Ollama is running
systemctl status ollama
curl http://localhost:11434/api/tags

# Check container can reach Ollama via shared network
docker exec geekspace-app curl -s http://ollama-container:11434/api/tags

# Verify OLLAMA_BASE_URL in .env matches the container name on the shared network
# Example: OLLAMA_BASE_URL=http://ollama-qtzz-ollama-1:11434
```

### EDITH bridge 502 / connection refused

```bash
# Check bridge is running
docker compose --profile edith ps

# Check bridge logs
docker compose logs geekspace-edith-bridge

# Test bridge health
curl http://localhost:8787/health

# Verify OpenClaw is reachable from bridge
docker exec geekspace-edith-bridge curl -s http://openclaw-container:55550

# Common causes:
# - OpenClaw container not on geekspace-shared network
# - Wrong EDITH_OPENCLAW_WS URL in .env
# - OpenClaw not accepting connections (check its logs)
```

### Frontend not updating after deploy

```bash
# The frontend is served by Caddy from /var/www/geekspace, NOT from Docker
# After rebuilding, you MUST copy the new files:
docker cp geekspace-app:/app/dist/. /var/www/geekspace/

# Verify the new files are in place
ls -la /var/www/geekspace/assets/index-*.js

# If users still see old version, they need a hard refresh (Ctrl+Shift+R)
```

### API returns 401 on all requests

```bash
# Check if the token is valid
curl -H "Authorization: Bearer <token>" https://yourdomain.com/api/auth/me

# Common causes:
# 1. JWT_SECRET changed since token was issued -> user must re-login
# 2. Token expired (default 7 days)
# 3. Frontend has stale token in localStorage -> clear and re-login

# Test demo login works end-to-end
curl -s -X POST https://yourdomain.com/api/auth/demo | python3 -m json.tool
```

### Database locked errors

```bash
# SQLite WAL mode handles most concurrency, but only one writer at a time
# Check no duplicate containers are running
docker compose ps

# If stuck, restart
docker compose restart geekspace
```

### High memory usage

```bash
# Check per-container usage
docker stats --no-stream

# Redis is capped at 128MB (configured in docker-compose.yml)
# If the app exceeds ~200MB, check for memory leaks in logs

# Ollama models consume significant VRAM/RAM:
# - qwen2.5-coder:7b needs ~5GB RAM on CPU
# - Reduce with: OLLAMA_MODEL=qwen2.5-coder:1.5b (~1.5GB)
```

### CORS errors in browser console

```bash
# Check CORS_ORIGINS in .env matches the exact origin (including https://)
# Example: CORS_ORIGINS=https://ai.geekspace.space

# Multiple origins:
# CORS_ORIGINS=https://ai.geekspace.space,https://www.geekspace.space

# Verify in app logs:
docker compose logs geekspace | head -5
# Look for: corsOrigins: ["https://ai.geekspace.space"]
```

### Rate limit errors (429)

```bash
# Default limits:
# - 200 requests / 15 minutes (global)
# - 10 login attempts / 15 minutes (auth)
# - 30 chat requests / 15 minutes (LLM)

# Adjust in .env:
# RATE_LIMIT_MAX=500
# RATE_LIMIT_AUTH_MAX=20

# Restart after changing:
docker compose restart geekspace
```

---

## Password Reset

If a user forgets their password, reset it from the host:

```bash
docker exec geekspace-app node -e "
const Database = require('/app/server/node_modules/better-sqlite3');
const bcrypt = require('/app/server/node_modules/bcryptjs');
const db = new Database('/app/data/geekspace.db');
const hash = bcrypt.hashSync('NewPassword123', 10);
db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, 'user@example.com');
console.log('Password reset successful');
"
```

---

## Database Queries

Useful queries you can run from the host:

```bash
# List all users
docker exec geekspace-app node -e "
const db = require('/app/server/node_modules/better-sqlite3')('/app/data/geekspace.db');
console.table(db.prepare('SELECT id, email, username, name, plan, credits FROM users').all());
"

# Check table sizes
docker exec geekspace-app node -e "
const db = require('/app/server/node_modules/better-sqlite3')('/app/data/geekspace.db');
const tables = ['users','agent_configs','reminders','integrations','portfolios','automations','usage_events','api_keys','features','activity_log','contact_submissions'];
tables.forEach(t => { const r = db.prepare('SELECT COUNT(*) as count FROM ' + t).get(); console.log(t + ': ' + r.count + ' rows'); });
"

# Recent activity
docker exec geekspace-app node -e "
const db = require('/app/server/node_modules/better-sqlite3')('/app/data/geekspace.db');
console.table(db.prepare('SELECT action, details, created_at FROM activity_log ORDER BY created_at DESC LIMIT 10').all());
"
```

---

## Network Topology

```
Internet
    │
    ▼
Caddy (:443, auto-HTTPS)
    │
    ├── /api/*  ──▶  geekspace-app (:3001)  ──┬── Redis (:6379)
    │                     │                    │   [geekspace-net]
    │                     │                    │
    │                     ▼                    │
    │              EDITH Bridge (:8787) ───────┘
    │                     │
    │                     ▼  [geekspace-shared]
    │              OpenClaw (:55550)
    │                     │
    └── /*  ──▶  /var/www/geekspace (SPA)
                          │
                     Ollama (:11434)
                     [geekspace-shared]
```

**Networks:**
- `geekspace-net` -- internal bridge for GeekSpace containers (app, redis, bridge)
- `geekspace-shared` -- external network shared with Ollama and OpenClaw containers

---

## Caddy Management

```bash
# Status
systemctl status caddy

# Reload config (no downtime)
systemctl reload caddy

# View config
cat /etc/caddy/Caddyfile

# Check certificates
caddy trust
ls /var/lib/caddy/.local/share/caddy/certificates/

# Logs
journalctl -u caddy -f
```

---

## Full Rebuild (Nuclear Option)

If everything is broken and you need to start fresh (preserves database):

```bash
cd GeekSpace2.0

# Stop everything
docker compose down

# Remove old images
docker image prune -f

# Rebuild from scratch
docker compose build --no-cache
docker compose up -d

# Re-deploy frontend
docker cp geekspace-app:/app/dist/. /var/www/geekspace/

# Verify
docker compose ps
curl https://yourdomain.com/api/health
```

To also reset the database (lose all data):

```bash
docker compose down -v    # removes volumes
docker compose up -d --build
docker cp geekspace-app:/app/dist/. /var/www/geekspace/
```

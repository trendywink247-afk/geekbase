# GeekSpace 2.0 — Personal AI Operating System

A self-hosted AI-OS platform where every user gets a personal AI agent (codename **OpenClaw / EDITH**), a customizable dashboard, terminal CLI, portfolio, and automation engine.

Built with React 19 + TypeScript frontend, Express + SQLite backend, and a **Tri-Brain LLM router** that intelligently routes queries across local (Ollama), cloud (OpenRouter), and gateway (EDITH/OpenClaw) providers.

## Architecture

```
                   +-----------+
                   |  Caddy    |  :443 (auto-HTTPS)
                   |  Reverse  |
                   |  Proxy    |
                   +-----+-----+
                         |
              +----------+----------+
              |                     |
        /api/*                  /*  (SPA)
              |                     |
     +--------v--------+   +-------v-----------+
     |  Express API     |   |  /var/www/geekspace|
     |  :3001           |   |  React 19 + Vite   |
     |  JWT + SQLite    |   |  Tailwind + shadcn |
     +--------+---------+   +-------------------+
              |
    +---------+---------+---------+
    |         |         |         |
  Ollama   OpenRouter  EDITH    Redis
  (local)  (cloud)   (bridge)  (queue)
  Brain 1  Brain 2    Brain 3
```

Caddy handles TLS termination and serves the frontend SPA from `/var/www/geekspace`. API requests (`/api/*`) are reverse-proxied to Express on port 3001. All backend services run in Docker containers on a shared bridge network.

### Tri-Brain LLM Router

The chat endpoint (`POST /api/agent/chat`) classifies user intent and routes to the best provider:

| Brain | Provider | Use Case | Cost |
|-------|----------|----------|------|
| Brain 1 | **Ollama** (local) | Simple queries, quick tasks | Free |
| Brain 2 | **OpenRouter** (cloud) | Mid-tier fallback when Ollama is down | Credits |
| Brain 3 | **EDITH / OpenClaw** (gateway) | Complex reasoning, coding, planning | Free (self-hosted) |

**Routing logic:**
- `/edith <message>` -- Force route to EDITH/OpenClaw
- `/local <message>` -- Force route to Ollama
- No prefix -- Auto-classify intent via keyword heuristic + word count, then route accordingly
- If EDITH fails, silently falls back to tri-brain (Ollama -> OpenRouter -> builtin)

### Response Contract

```json
{
  "text": "The AI response",
  "route": "edith | local",
  "latencyMs": 342,
  "provider": "edith | ollama | openrouter | builtin",
  "debug": { "intent": "coding", "forceRoute": null }
}
```

The `debug` field is only included when `LOG_LEVEL=debug`.

## Tech Stack

### Frontend
- **React 19** + TypeScript 5.9
- **Vite 7** build tool
- **Tailwind CSS 3** + shadcn/ui + Radix UI
- **Zustand** state management
- **Recharts** for dashboard charts
- **Lucide React** icons

### Backend
- **Express 4** + TypeScript
- **SQLite** via better-sqlite3 (WAL mode)
- **JWT** authentication with HS256 algorithm pinning
- **Zod** request validation on all endpoints
- **Pino** structured logging (JSON in production)
- **Helmet** security headers
- **Rate limiting** (express-rate-limit)
- **AES-256-GCM** encryption for stored API keys

### Infrastructure
- **Docker** multi-stage build (Node 20 Alpine)
- **Caddy** reverse proxy with auto-HTTPS (Let's Encrypt)
- **Redis 7** for job queue + cache
- **Ollama** for local LLM inference (qwen2.5-coder:7b)
- **EDITH Bridge** -- WebSocket-to-HTTP bridge for OpenClaw

## Quick Start

### Prerequisites
- Node.js 20+
- npm

### Development

```bash
# Clone
git clone https://github.com/trendywink247-afk/GeekSpace2.0.git
cd GeekSpace2.0

# Install dependencies (frontend + server)
npm install
cd server && npm install && cd ..

# Copy env and configure
cp .env.example .env
# Edit .env -- at minimum set JWT_SECRET and ENCRYPTION_KEY

# Start dev servers (frontend :5173, API :3001)
./scripts/dev.sh

# Or manually:
npm run dev                       # Frontend on :5173
cd server && npm run dev          # API on :3001
```

### Production (Docker + Caddy)

```bash
cp .env.example .env
# Fill in production values (JWT_SECRET, ENCRYPTION_KEY, CORS_ORIGINS, etc.)

# Build and start containers
docker compose up -d --build

# Copy frontend to Caddy serving directory
docker cp geekspace-app:/app/dist/. /var/www/geekspace/

# Verify
docker compose ps
curl https://yourdomain.com/api/health
```

See the [RUNBOOK.md](RUNBOOK.md) for the full VPS deployment guide.

## Project Structure

```
GeekSpace2.0/
├── src/                              # React frontend
│   ├── App.tsx                       # Root with routing
│   ├── main.tsx                      # Entry point
│   ├── components/ui/                # shadcn/ui components
│   ├── dashboard/pages/              # Dashboard views
│   │   ├── OverviewPage.tsx          # Charts, stats, activity
│   │   ├── RemindersPage.tsx         # Calendar + list view
│   │   ├── ConnectionsPage.tsx       # Integration health
│   │   ├── AgentSettingsPage.tsx     # AI personality config
│   │   ├── AutomationsPage.tsx      # Trigger -> action workflows
│   │   ├── SettingsPage.tsx         # Profile, security, billing
│   │   └── TerminalPage.tsx         # CLI interface
│   ├── landing/                      # Public landing page
│   ├── onboarding/                   # Login + onboarding flow
│   ├── portfolio/                    # Public portfolio view
│   ├── explore/                      # User directory
│   ├── services/api.ts              # Typed HTTP client
│   ├── stores/                       # Zustand state management
│   └── hooks/                        # Custom React hooks
│
├── server/                           # Express API
│   └── src/
│       ├── index.ts                  # Server entry, health check, route mounting
│       ├── config.ts                 # Validated env config
│       ├── logger.ts                 # Pino structured logging
│       ├── db/index.ts               # SQLite schema + demo seed data
│       ├── middleware/
│       │   ├── auth.ts               # JWT verify + sign (HS256 pinned)
│       │   ├── validate.ts           # Zod schemas for all endpoints
│       │   └── errors.ts             # Global error handler
│       ├── routes/
│       │   ├── auth.ts               # /api/auth -- login, signup, demo
│       │   ├── agent.ts              # /api/agent -- chat, commands, config
│       │   ├── reminders.ts          # /api/reminders -- CRUD
│       │   ├── automations.ts        # /api/automations -- CRUD
│       │   ├── integrations.ts       # /api/integrations -- manage
│       │   ├── portfolio.ts          # /api/portfolio -- public profile
│       │   ├── users.ts              # /api/users -- profile
│       │   ├── usage.ts              # /api/usage -- token/cost tracking
│       │   ├── dashboard.ts          # /api/dashboard -- stats + contact
│       │   ├── apiKeys.ts            # /api/api-keys -- encrypted storage
│       │   ├── directory.ts          # /api/directory -- user discovery
│       │   └── features.ts           # /api/features -- feature flags
│       ├── services/
│       │   ├── llm.ts                # Tri-Brain router (Ollama/OpenRouter/EDITH)
│       │   └── edith.ts              # EDITH/OpenClaw HTTP client
│       ├── prompts/
│       │   └── openclaw-system.ts    # OpenClaw master system prompt
│       └── utils/
│           └── encryption.ts         # AES-256-GCM + scrypt encryption
│
├── bridge/edith-bridge/              # EDITH WS-to-HTTP bridge
│   ├── Dockerfile
│   ├── index.js                      # OpenClaw WS JSON-RPC <-> OpenAI HTTP
│   └── package.json
│
├── scripts/
│   ├── dev.sh                        # Local dev launcher
│   ├── prod.sh                       # Production deploy
│   └── healthcheck.sh                # Diagnostic health check
│
├── docs/
│   ├── ARCHITECTURE.md               # Deep-dive system architecture
│   ├── API.md                        # Full API reference
│   ├── ENV_VARS.md                   # Environment variables reference
│   ├── DEPLOYMENT.md                 # Docker + VPS deployment guide
│   └── TROUBLESHOOTING.md           # Common issues + fixes
│
├── docker-compose.yml                # GeekSpace + Redis + EDITH bridge
├── Dockerfile                        # Multi-stage production build
├── RUNBOOK.md                        # Operations runbook
├── OPENCLAW.md                       # OpenClaw/EDITH identity + capabilities
├── RELEASE_NOTES.md                  # Version history
└── .env.example                      # Environment template
```

## EDITH / OpenClaw Integration

OpenClaw (codename EDITH) is Brain 3 of the Tri-Brain router -- the premium reasoning engine for complex tasks.

### How It Works

1. **EDITH Bridge** (`bridge/edith-bridge/`):
   - Translates OpenClaw's WebSocket JSON-RPC protocol to OpenAI-compatible HTTP
   - Runs as an optional Docker service (`docker compose --profile edith up`)
   - 120-second request timeout for long-running completions
   - Health endpoint at `/health`

2. **EDITH Service** (`server/src/services/edith.ts`):
   - Sends requests to the bridge at `EDITH_GATEWAY_URL`
   - OpenAI-compatible `/v1/chat/completions` format
   - 120-second timeout, falls back gracefully on failure

3. **Routing** (`server/src/routes/agent.ts`):
   - `/edith <msg>` prefix forces EDITH routing
   - Auto-routes to EDITH when intent is `complex`, `coding`, or `planning`
   - Keyword heuristic: `code`, `debug`, `analyze`, `architecture`, `refactor`, etc.
   - Falls back to tri-brain (Ollama -> OpenRouter -> builtin) on failure

4. **Health probing** (`GET /api/health`):
   - Live-probes EDITH bridge (3s timeout)
   - Returns `"edith": true/false` in health response

### Docker Networking

GeekSpace and OpenClaw communicate through a shared Docker network (`geekspace-shared`). The EDITH bridge connects to OpenClaw via WebSocket on the shared network and exposes an HTTP endpoint to GeekSpace.

```
GeekSpace :3001 --HTTP--> EDITH Bridge :8787 --WS--> OpenClaw :55550
                          (geekspace-net)            (geekspace-shared)
```

### Environment Variables

```env
EDITH_GATEWAY_URL=http://edith-bridge:8787    # Bridge HTTP endpoint
EDITH_TOKEN=<bearer-token>                     # Optional auth token
EDITH_OPENCLAW_WS=ws://openclaw:55550         # OpenClaw WebSocket (bridge config)
OPENCLAW_CHAT_METHOD=chat.completions          # RPC method name
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | No | Health check with live Ollama + EDITH probing |
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/login` | No | Login, returns JWT |
| POST | `/api/auth/demo` | No | Demo login, seeds demo data + returns JWT |
| GET | `/api/auth/me` | JWT | Get current user profile |
| POST | `/api/auth/onboarding` | JWT | Complete onboarding flow |
| GET | `/api/agent/config` | JWT | Get agent personality config |
| PATCH | `/api/agent/config` | JWT | Update agent personality |
| POST | `/api/agent/chat` | JWT | AI chat (tri-brain routed) |
| POST | `/api/agent/command` | JWT | Terminal command execution |
| POST | `/api/agent/chat/public/:username` | No | Public portfolio chat |
| GET/PATCH | `/api/users/me` | JWT | User profile management |
| GET/POST/PATCH/DELETE | `/api/reminders` | JWT | Reminder CRUD |
| GET/POST/PATCH/DELETE | `/api/automations` | JWT | Automation CRUD |
| POST | `/api/automations/:id/trigger` | JWT | Manually trigger an automation |
| GET | `/api/integrations` | JWT | List connected services |
| POST | `/api/integrations/:type/connect` | JWT | Connect an integration |
| POST | `/api/integrations/:id/disconnect` | JWT | Disconnect an integration |
| PATCH | `/api/integrations/:id/permissions` | JWT | Update integration permissions |
| GET/PATCH | `/api/portfolio/me` | JWT | Portfolio management |
| GET | `/api/portfolio/:username` | No | Public portfolio view |
| POST | `/api/portfolio/ai-edit` | JWT | AI-enhanced portfolio edit |
| GET | `/api/usage/summary` | JWT | Usage statistics |
| GET | `/api/usage/events` | JWT | Usage event history |
| GET | `/api/usage/billing` | JWT | Billing information |
| GET | `/api/dashboard/stats` | JWT | Dashboard statistics |
| POST | `/api/dashboard/contact` | No | Landing page contact form |
| GET/POST/DELETE | `/api/api-keys` | JWT | Encrypted API key storage |
| PATCH | `/api/api-keys/:id/default` | JWT | Set default API key |
| GET | `/api/directory` | JWT | User discovery |
| GET/PATCH | `/api/features` | JWT | Feature flags |

See [docs/API.md](docs/API.md) for full request/response schemas.

## Terminal Commands

The built-in CLI (`gs` command system) available in the Terminal page and via `POST /api/agent/command`:

```
gs me                       Show your profile
gs reminders list           List reminders
gs reminders add "text"     Create a reminder
gs credits                  Check credit balance
gs usage today|month        Usage reports
gs integrations             List integrations
gs connect <service>        Connect integration
gs disconnect <service>     Disconnect integration
gs automations              List automations
gs status                   Agent status
gs portfolio                Portfolio URL
gs deploy                   Deploy portfolio (make public)
gs profile set <field> <v>  Update profile field
gs export                   Export all data as JSON
ai "prompt"                 Ask your AI agent (real LLM)
clear                       Clear terminal
help                        Show help
```

## Database Schema

SQLite with WAL mode and foreign keys enabled. 11 tables:

| Table | Purpose |
|-------|---------|
| `users` | Accounts, profile, plan, credits, notification/privacy prefs |
| `agent_configs` | Per-user AI personality (name, voice, mode, model, colors) |
| `reminders` | Tasks with datetime, category, recurring schedule, channel |
| `integrations` | Service connections (Telegram, GitHub, Calendar, n8n, etc.) |
| `portfolios` | Public profiles with skills, projects, milestones, social links |
| `automations` | Trigger -> action workflows with run count tracking |
| `usage_events` | Token/cost tracking per provider per channel |
| `api_keys` | AES-256-GCM encrypted API key storage |
| `features` | Per-user feature flags |
| `contact_submissions` | Landing page contact form entries |
| `activity_log` | User activity tracking with icons |

## Security

- **JWT HS256 pinning** -- prevents algorithm-none attacks
- **bcryptjs** password hashing (10 rounds, async)
- **AES-256-GCM + scrypt** encryption for stored API keys
- **Zod validation** on every mutating endpoint
- **Helmet** security headers (CSP in production)
- **CORS** restricted to configured origins
- **Rate limiting** -- 200 req/15min global, 10 auth/15min, 30 chat/15min
- **Body size limit** -- 1MB default
- **Trust proxy** -- correct client IP behind Caddy
- **Non-root Docker user** (node)
- **`.env.production` gitignored** -- secrets never committed

## Environment Variables

See [`.env.example`](.env.example) and [docs/ENV_VARS.md](docs/ENV_VARS.md) for the complete list. Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Prod | dev fallback | JWT signing secret (64-byte hex) |
| `ENCRYPTION_KEY` | Prod | dev fallback | AES key for API key encryption (32-byte hex) |
| `CORS_ORIGINS` | No | `localhost:5173` | Allowed origins (comma-separated) |
| `OLLAMA_BASE_URL` | No | `localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | No | `qwen2.5-coder:7b` | Local model name |
| `OLLAMA_TIMEOUT_MS` | No | `120000` | Ollama request timeout |
| `OLLAMA_MAX_TOKENS` | No | `1024` | Max generation tokens |
| `OPENROUTER_API_KEY` | No | -- | OpenRouter API key for cloud fallback |
| `EDITH_GATEWAY_URL` | No | -- | EDITH bridge HTTP endpoint |
| `EDITH_TOKEN` | No | -- | OpenClaw bearer token |
| `REDIS_URL` | No | `localhost:6379` | Redis connection string |
| `SEED_DEMO_DATA` | No | `true` (dev) | Seed demo users on startup |

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| Primary | `#7B61FF` | Purple accent |
| Background | `#05050A` | Dark base |
| Surface | `#0B0B10` | Card backgrounds |
| Success | `#61FF7B` | Green indicators |
| Warning | `#FFD761` | Yellow alerts |
| Error | `#FF6161` | Red errors |
| Heading font | Space Grotesk | |
| Body font | Inter | |
| Mono font | IBM Plex Mono | |

## License

MIT

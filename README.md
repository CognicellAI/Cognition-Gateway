# Cognition Gateway

A self-hosted web interface for any [Cognition](https://github.com/CognicellAI/Cognition) server. The Gateway provides authentication, user management, streaming chat, and full configuration management — without touching the Cognition server itself.

**Analogy:** OpenWebUI is to Ollama what Cognition Gateway is to Cognition Server.

---

## What It Does

Cognition is a headless agent backend. The Gateway is its front door:

- **Chat** — Streaming agent conversations with live tool call visualization, planning step canvas, and artifact shelf
- **Agent Builder** — Create and manage custom agents with skill assignment, system prompts, and model overrides
- **Skills** — Create reusable skill definitions (SKILL.md content) and assign them to agents
- **Providers** — Manage LLM provider configs (Bedrock, OpenAI, Anthropic, OpenRouter, etc.) with live connection testing
- **Model Catalog** — Searchable catalog of 3,800+ models with context windows, pricing, and capability filters
- **Config** — Runtime configuration editor for the connected Cognition server
- **Tools** — Tool browser with hot-reload
- **Cron Jobs** — Schedule agent-driven tasks on a cron expression
- **Webhooks** — Trigger agent sessions from external services via inbound webhooks
- **Admin** — User management, registration control, role assignment
- **Audit Log** — Full audit trail of config changes, session creation, and admin actions
- **API Keys** — Generate and revoke API keys for programmatic access

---

## Quick Start

```bash
# Production (SQLite + published Gateway image)
docker compose up -d

# Open in browser
open http://localhost:3000
```

The first user to sign up becomes admin. Enter the URL of your Cognition server during setup.

---

## Development Stack

The dev compose brings up a local Cognition instance alongside the Gateway:

```bash
# Copy and populate your AWS credentials
cp .env.dev.example .env.dev  # add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN

# Build and start
docker compose -f docker-compose.dev.yml up --build -d

# Tail logs
docker compose -f docker-compose.dev.yml logs -f
```

| Service | URL |
|---------|-----|
| Gateway | http://localhost:3002 |
| Cognition API | http://localhost:8002 |

### Local Development (without Docker)

```bash
cd gateway
pnpm install
pnpm db:push        # Create SQLite database
pnpm dev:server     # Custom server (cron + WebSocket + Next.js)
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite path or PostgreSQL URL | `file:./dev.db` |
| `AUTH_SECRET` | Auth.js secret (generate with `openssl rand -hex 32`) | — |
| `AUTH_URL` | Public URL of the Gateway (required in Docker) | — |
| `AUTH_TRUST_HOST` | Set `true` when behind a proxy/Docker | `false` |
| `REGISTRATION_ENABLED` | Allow new user signups | `true` |
| `COGNITION_SERVER_URL` | URL of the Cognition backend | `http://localhost:8000` |

---

## Architecture

Single Next.js 15 process with a custom `server.ts` entry point. One container, one port.

```
Browser ──HTTP/WS──▶ Cognition Gateway (Next.js + custom server.ts)
                          │
                          │ HTTP + SSE (proxied, scoped)
                          ▼
                     Cognition Server (Python/FastAPI, headless)
```

**Key design decisions:**

- **Proxy pattern** — The browser never calls Cognition directly. The Gateway proxies all requests through `/api/c/[...path]` with an allowlist and injects `X-Cognition-Scope-User: {userId}` for multi-tenant isolation.
- **No shared state with Cognition** — The Gateway owns users, sessions, cron jobs, webhooks, API keys, and audit logs in its own SQLite database. Cognition knows nothing about them.
- **`src/lib/gateway/` is pure Node.js** — No React, no Next.js imports. This is the extractable core — it could become a standalone service without architectural changes.

See [`docs/plans/2026-03-10-cognition-gateway-design.md`](docs/plans/2026-03-10-cognition-gateway-design.md) for the full architecture design.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router, custom server) |
| UI | React 19, Tailwind v4, shadcn/ui |
| State | Zustand 5 |
| Auth | Auth.js v5 (JWT, Prisma adapter) |
| ORM | Prisma 7 + better-sqlite3 |
| Validation | Zod |
| WebSocket | ws 8 |
| Cron | Croner 9 |
| Package manager | pnpm |

---

## Commands

```bash
pnpm dev              # Next.js dev server
pnpm dev:server       # Custom server (cron + WebSocket)
pnpm build            # Production build
pnpm typecheck        # TypeScript check
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm db:push          # Apply schema to dev DB
pnpm db:migrate       # Create and apply migration
pnpm db:studio        # Prisma Studio
pnpm test             # Run tests
```

---

## Contributing

See [`AGENTS.md`](AGENTS.md) for code style, architecture boundaries, naming conventions, and the Definition of Done for each work category.

See [`ROADMAP.md`](ROADMAP.md) for current status and planned features.

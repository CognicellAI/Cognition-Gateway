# Cognition Gateway -- Architecture Design

**Date:** 2026-03-10
**Updated:** 2026-03-20
**Status:** Historical implementation design — see `docs/discussions/cognition-gateway-future-guidance.md` for the current accepted architecture direction

## Purpose

A self-hosted web interface that acts as a detached frontend gateway for any Cognition server. Users get a polished chat-and-configure experience without the Cognition server bundling any UI. The Gateway handles authentication, user management, cron scheduling, webhook ingress, and proxies all agent interactions to the Cognition backend.

**Analogy:** OpenWebUI is to Ollama what Cognition Gateway is to Cognition Server.

## Principles

1. **Separation of concerns** -- Cognition is a headless agent backend. The Gateway is a standalone app that talks to it over HTTP/SSE.
2. **Gateway is the user's front door** -- It owns auth, user identity, preferences, orchestration (cron, webhooks). Cognition owns agent execution, tools, LLM providers.
3. **Proxy pattern** -- The browser never talks directly to Cognition. The Gateway proxies requests, injecting scope headers for multi-tenant isolation.
4. **Progressive complexity** -- A single user runs one command and chats in minutes. Teams enable auth, multi-user scoping, and Postgres later.
5. **Gateway owns orchestration, Cognition owns execution** -- Cron jobs and webhooks are triggers (when/why to run an agent). Cognition handles how agents run. The Gateway calls Cognition's existing API to trigger agent runs.

## Architecture

Single Next.js process with a custom server entry point. One container, one port, one deploy.

```
Browser
  |  HTTP + WebSocket (single port)
  v
Cognition Gateway (Next.js + custom server.ts)
  - Pages: Chat, Agents, Skills, Models, Providers, Tools, Config, Cron, Webhooks, Admin, Audit
  - API Routes: /api/auth/*, /api/c/* (proxy), /api/cron/*, /api/hooks/*, /api/user/*
  - Server-side: Cron scheduler, WebSocket server, Prisma (SQLite/Postgres)
  |  HTTP + SSE (proxied)
  v
Cognition Server (Python/FastAPI, unchanged, headless)
```

The custom `server.ts` handles three things standard Next.js cannot:
- Cron scheduling (persistent in-process scheduler, jobs loaded from DB)
- WebSocket connections (server-to-client push notifications)
- Startup initialization (DB migrations, scheduler boot)

Everything under `src/lib/gateway/` is pure Node.js with no React or browser API dependencies. This is the code that would be extracted into a separate service if scaling demands it.

## Technology Stack

| Layer | Choice | Version |
|-------|--------|---------|
| Runtime | Node.js | 22+ |
| Framework | Next.js (App Router, custom server) | 15 |
| UI | React + Tailwind CSS + shadcn/ui | React 19, Tailwind v4 |
| State | Zustand | 5.x |
| Server data fetching | TanStack Query | 5.x |
| Auth | Auth.js (Prisma adapter, JWT sessions) | v5 |
| ORM | Prisma | 7.x |
| DB driver | @prisma/adapter-better-sqlite3 | 7.x |
| Database | SQLite (default) / PostgreSQL (production) | - |
| WebSocket | ws | 8.x |
| Cron | Croner | 9.x |
| Validation | Zod | 3.x |
| Markdown | react-markdown + rehype-highlight + remark-gfm | - |
| Package manager | pnpm | 9.x |

> **Note:** Auth.js v5 requires `strategy: "jwt"` with `jwt`/`session` callbacks when using the Credentials provider. Database sessions are not compatible with Credentials in v5.

## Project Structure

```
cognition-ui/                        # Repo root
├── gateway/                         # Next.js application
│   ├── server.ts                    # Custom Node.js server (cron, WS, Next.js handler)
│   ├── prisma.config.ts             # Prisma 7 config (driver adapter)
│   ├── prisma/schema.prisma         # DB schema
│   ├── Dockerfile                   # Multi-stage production build
│   ├── docker-compose.yml           # Production compose
│   └── src/
│       ├── app/                     # Next.js App Router (pages)
│       │   ├── (auth)/              # Login, signup (unauthenticated layout)
│       │   ├── (app)/               # Main app (authenticated layout + sidebar)
│       │   │   ├── chat/            # Session home screen + chat
│       │   │   ├── agents/          # Agent builder (full CRUD)
│       │   │   ├── models/          # Model catalog (searchable, filterable)
│       │   │   ├── providers/       # Provider manager (full CRUD + test)
│       │   │   ├── tools/           # Tools browser + reload
│       │   │   ├── skills/          # Skills CRUD (content editor)
│       │   │   ├── config/          # Config editor + rollback
│       │   │   ├── cron/            # Cron job management
│       │   │   ├── webhooks/        # Webhook management
│       │   │   ├── admin/           # User management + audit log
│       │   │   └── settings/        # Preferences, API keys
│       │   └── api/                 # API routes
│       │       ├── auth/            # Auth endpoints
│       │       ├── c/[...path]/     # Cognition proxy (catch-all + allowlist)
│       │       ├── cron/            # Cron CRUD
│       │       ├── hooks/[...path]/ # Webhook ingress (public)
│       │       ├── user/            # User-scoped API (API keys)
│       │       └── audit/           # Audit log query
│       ├── lib/
│       │   ├── gateway/             # Server-side: proxy, cron scheduler, audit, webhooks
│       │   ├── auth/                # Session utilities, password hashing, API key verification
│       │   ├── db/                  # Prisma client singleton (better-sqlite3 adapter)
│       │   └── cognition/           # Typed Cognition API client + allowlist
│       ├── components/
│       │   ├── canvas/              # Live Task Canvas (planning step visualization)
│       │   ├── chat/                # Chat view, message bubbles, model picker
│       │   ├── layout/              # Sidebar, app shell, nav
│       │   ├── shelf/               # Artifact shelf (code block extraction + @label)
│       │   ├── tool-renderers/      # Pluggable tool card renderers
│       │   └── ui/                  # shadcn/ui base components
│       ├── hooks/                   # Client-side React hooks (chat stream, store)
│       ├── store/                   # Zustand store (chat, streams, artifacts, canvas)
│       └── types/                   # Shared TypeScript types (Cognition API contracts)
├── .cognition/
│   └── config.yaml                  # Cognition ConfigRegistry bootstrap (dev)
├── Dockerfile.cognition-dev         # Dev Cognition image with config baked in
├── docker-compose.dev.yml           # Dev stack (Gateway :3002, Cognition :8002)
├── AGENTS.md                        # Coding standards and contribution guidelines
├── ROADMAP.md                       # Feature phases and work category tracking
└── docs/plans/                      # Architecture design documents
```

## Data Model

Full schema as of Phase 4. All tables use SQLite by default; schema is compatible with PostgreSQL via env var switch.

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  passwordHash  String?
  role          String    @default("user")   // "user" | "admin"
  preferences   String    @default("{}")     // JSON: theme, defaultAgent, fontSize
  serverUrl     String    @default("http://localhost:8000")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  apiKeys       ApiKey[]
  auditLogs     AuditLog[]
}

model ApiKey { ... }           // Hashed API keys for bearer token auth
model AuditLog { ... }         // Action log: session, config, cron, webhook, user events
model CronJob { ... }          // Scheduled agent triggers
model CronJobRun { ... }       // Execution history per cron job
model Webhook { ... }          // Inbound webhook registrations
model WebhookInvocation { ... } // Delivery history per webhook
model GatewaySettings { ... }  // Server-level settings (registrationEnabled, etc.)
```

> **SQLite note:** Prisma 7 with SQLite does not support the `Json` column type. JSON fields are stored as `String` and parsed at the application layer with Zod.

Auth.js v5 manages its own tables (Account, Session, VerificationToken) via the Prisma adapter.

## Authentication

Auth.js v5 with Prisma adapter and JWT session strategy. The Credentials provider requires JWT — database sessions are not supported with Credentials in v5.

```
Signup:  POST /api/auth/signup  -> hash password (bcrypt, cost 12), create User, sign JWT
Signin:  POST /api/auth/signin  -> verify password, sign JWT
Session: Middleware checks JWT on every (app)/ route via edge-safe auth config
```

Key env vars: `AUTH_SECRET`, `AUTH_URL` (required in Docker), `AUTH_TRUST_HOST=true`.

## Cognition Proxy

A catch-all API route `/api/c/[...path]/route.ts` with an allowlist defined in `src/lib/gateway/proxy.ts`.

Behaviors:
- **Auth-gated** — every proxied request validates session or API key bearer token
- **Allowlist** — only permitted Cognition paths are forwarded; all others return 403
- **Scope injection** — adds `X-Cognition-Scope-User: {user.id}` header for multi-tenant isolation
- **SSE pass-through** — streaming responses are piped without buffering; `Last-Event-ID` forwarded
- **Audit logging** — config mutations and session creation are logged to AuditLog
- **Server URL from user record** — each user record stores their Cognition server URL

Allowed paths (as of Phase 6):

```
health, ready,
sessions, sessions/*,
agents, agents/*,
models, models/*,
config, config/*,
tools, tools/*,
skills, skills/*,
```

## Chat UI & Streaming

### State Management

Zustand store (`src/store/chat.ts`) with concurrent stream support:

```typescript
interface ChatStore {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  messagesBySession: Map<string, Map<string, Message>>;
  messageOrderBySession: Map<string, string[]>;
  streams: Map<string, StreamState>;
  artifactsBySession: Map<string, Artifact[]>;
  canvasOpen: boolean;
}

interface StreamState {
  status: "idle" | "streaming" | "thinking";
  content: string;
  toolCalls: ToolCall[];
  todos: Todo[];
  usage: UsageData | null;
  error: string | null;
}
```

### SSE Event Types (from Cognition server)

| Event | Payload | UI Behavior |
|-------|---------|-------------|
| `token` | `{content}` | Append to streaming text |
| `tool_call` | `{name, args, id}` | Show expandable tool card |
| `tool_result` | `{tool_call_id, output, exit_code}` | Update tool card with result |
| `planning` | `{todos}` | Populate Live Task Canvas |
| `step_complete` | `{step_number, total_steps, description}` | Update canvas step |
| `status` | `{status}` | Update streaming indicator |
| `usage` | `{input_tokens, output_tokens, estimated_cost, model}` | Show token/cost bar |
| `delegation` | `{from_agent, to_agent, task}` | Show agent handoff |
| `error` | `{message, code}` | Inline error with retry button |
| `done` | `{assistant_data, message_id}` | Finalize message, auto-title session |
| `reconnected` | `{last_event_id, resumed}` | Resume stream |

### Phase 5 UX Features

- **Live Task Canvas** — persistent side panel rendering `planning` todos as cards; updates in real-time; survives stream completion as audit trail
- **Artifact Shelf** — auto-extracts code blocks ≥8 lines; `@label` syntax injects artifact content into follow-up messages
- **Model Picker** — popover in input bar: select provider chip → searchable model list from `GET /models/providers/{id}/models`; writes `SessionConfig.provider_id` + `SessionConfig.model` via `PATCH /sessions/{id}`

### Tool Renderer Registry

```typescript
const toolRenderers: Record<string, ComponentType<ToolCallProps>> = {
  default: GenericToolCard,
  // Future: bash -> TerminalOutput, edit_file -> DiffView, web_search -> SearchResults
};
```

## WebSocket

Attached to the custom server on `/ws`. Uses `noServer: true` mode with manual `upgrade` event handling to avoid conflicting with Next.js HMR websocket (`/_next/webpack-hmr`).

Events broadcast to all connected clients:
- `cron.run.complete` / `cron.run.failed` — cron job execution results
- `webhook.invoked` — inbound webhook triggered
- `config.updated` — Cognition config changed

## Cron Jobs (Phase 3)

In-process scheduler (Croner) persisted to DB. Jobs reload on Gateway restart.

Flow: User creates job → scheduler registers → on trigger: create Cognition session → send message → consume SSE → write CronJobRun → broadcast WebSocket event.

## Webhooks (Phase 3)

External services POST to `/api/hooks/{path}`. Path is exempt from auth middleware. HMAC validation against stored secret. Prompt template rendered with request body. Agent session triggered on Cognition.

## Dev Stack

```
docker-compose.dev.yml:
  dev-cognition-gateway  → ghcr.io/cognicellai/cognition:latest  :8002
  dev-gateway-ui         → built from ./gateway/Dockerfile         :3002
```

Cognition provider is bootstrapped from `.cognition/config.yaml` (v0.4.0 `llm:` format) via `seed_if_absent` on startup. AWS credentials injected from `.env.dev` (gitignored).

## Phase Plan

### Phase 1: Foundation + Working Chat ✅
Scaffold, auth, proxy, SSE, setup wizard, chat UI, health indicator, Docker.

### Phase 2: Configuration + Management ✅
Config editor, models/tools/agents browsers, user preferences, admin panel.

### Phase 3: Automation ✅
Cron jobs + scheduler, webhook ingress, WebSocket notifications.

### Phase 4: Enterprise Polish (partial) ✅
API keys, audit logging, audit viewer, WS notification bell. Pending: PostgreSQL, multi-server, RBAC, session replay.

### Phase 5: Signature UX ✅
Live Task Canvas, Artifact Shelf, session home screen, inline error surfacing, session rename.

### Phase 6: Dynamic Config (Cognition v0.3.0–v0.4.0) ✅
Skills CRUD, Agent Builder, Provider Manager (with live test), Model Catalog (3,800+ models, search/filter), per-session model picker. Pending: real-time config updates.


## Note On Current Direction

This document remains useful as a snapshot of the implemented system shape through the earlier phase-based roadmap, but it is no longer the primary architecture guide for future work. The accepted forward-looking architecture now lives in `docs/discussions/cognition-gateway-future-guidance.md`, especially for unified dispatch, governance-first UX, approvals, integrations, and session continuity.

## Purpose

A self-hosted web interface that acts as a detached frontend gateway for any Cognition server. Users get a polished chat-and-configure experience without the Cognition server bundling any UI. The Gateway handles authentication, user management, cron scheduling, webhook ingress, and proxies all agent interactions to the Cognition backend.

**Analogy:** OpenWebUI is to Ollama what Cognition Gateway is to Cognition Server.

## Principles

1. **Separation of concerns** -- Cognition is a headless agent backend. The Gateway is a standalone app that talks to it over HTTP/SSE.
2. **Gateway is the user's front door** -- It owns auth, user identity, preferences, orchestration (cron, webhooks). Cognition owns agent execution, tools, LLM providers.
3. **Proxy pattern** -- The browser never talks directly to Cognition. The Gateway proxies requests, injecting scope headers for multi-tenant isolation.
4. **Progressive complexity** -- A single user runs one command and chats in minutes. Teams enable auth, multi-user scoping, and Postgres later.
5. **Gateway owns orchestration, Cognition owns execution** -- Cron jobs and webhooks are triggers (when/why to run an agent). Cognition handles how agents run. The Gateway calls Cognition's existing API to trigger agent runs.

## Architecture

Single Next.js process with a custom server entry point. One container, one port, one deploy.

```
Browser
  |  HTTP + WebSocket (single port)
  v
Cognition Gateway (Next.js + custom server.ts)
  - Pages: Chat, Settings, Agents, Cron UI
  - API Routes: /api/auth/*, /api/c/* (proxy), /api/cron/*, /api/hooks/*
  - Server-side: Cron scheduler, WebSocket server, Prisma (SQLite/Postgres)
  |  HTTP + SSE (proxied)
  v
Cognition Server (Python/FastAPI, unchanged, headless)
```

The custom `server.ts` handles three things standard Next.js cannot:
- Cron scheduling (persistent in-process scheduler, jobs loaded from DB)
- WebSocket connections (server-to-client push notifications)
- Startup initialization (DB migrations, scheduler boot)

Everything under `src/lib/gateway/` is pure Node.js with no React or browser API dependencies. This is the code that would be extracted into a separate service if scaling demands it.

## Technology Stack

| Layer | Choice | Version |
|-------|--------|---------|
| Runtime | Node.js | 22+ |
| Framework | Next.js (App Router, custom server) | 15 |
| UI | React + Tailwind CSS + shadcn/ui | React 19, Tailwind v4 |
| State | Zustand | 5.x |
| Server data fetching | TanStack Query | 5.x |
| Auth | Auth.js (Prisma adapter, database sessions) | v5 |
| ORM | Prisma | 6.x |
| Database | SQLite (default) / PostgreSQL (production) | - |
| WebSocket | ws | 8.x |
| Cron | Croner | 9.x |
| Validation | Zod | 3.x |
| Markdown | react-markdown + rehype-highlight + remark-gfm | - |
| Package manager | pnpm | 9.x |

## Project Structure

```
cognition-gateway/
├── server.ts                    # Custom Node.js server (cron, WS, Next.js handler)
├── src/
│   ├── app/                     # Next.js App Router (pages)
│   │   ├── (auth)/              # Login, signup (unauthenticated layout)
│   │   ├── (app)/               # Main app (authenticated layout + sidebar)
│   │   │   ├── chat/[id]/       # Chat session
│   │   │   ├── agents/          # Agent browser
│   │   │   ├── cron/            # Cron job management
│   │   │   └── settings/        # Server connection, config, preferences
│   │   └── api/                 # API routes
│   │       ├── auth/            # Auth endpoints
│   │       ├── c/[...path]/     # Cognition proxy (catch-all + allowlist)
│   │       ├── cron/            # Cron CRUD
│   │       └── hooks/[...path]/ # Webhook ingress
│   ├── lib/
│   │   ├── gateway/             # Server-side: proxy, cron scheduler, event bus
│   │   ├── auth/                # Session utilities, password hashing
│   │   ├── db/                  # Prisma client singleton
│   │   └── cognition/           # Typed Cognition API client
│   ├── components/              # React components (shadcn/ui based)
│   ├── hooks/                   # Client-side React hooks
│   └── types/                   # Shared TypeScript types
├── prisma/
│   └── schema.prisma
├── Dockerfile
├── docker-compose.yml
├── next.config.ts
├── tailwind.config.ts
├── package.json
└── tsconfig.json
```

## Data Model

Phase 1 schema -- one table, extend as features are built.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  passwordHash  String?
  role          String   @default("user")  // "user" | "admin"
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  preferences   Json     @default("{}")    // theme, defaultAgent, fontSize
  serverUrl     String   @default("http://localhost:8000")
}
```

Auth.js adds its own tables (Account, Session, VerificationToken) via the Prisma adapter.

The first user to sign up gets `role: "admin"`. Subsequent users get `role: "user"`. A `REGISTRATION_ENABLED` env var (default `true`) controls open registration.

### Future Tables (added per phase)

- **Phase 3:** CronJob, CronJobRun, Webhook, WebhookInvocation
- **Phase 4:** ApiKey, AuditLog

## Authentication

Auth.js v5 with Prisma adapter and database-backed sessions. Database sessions provide instant revocation and server-side truth -- better for enterprise than JWT.

```
Signup:  POST /api/auth/signup  -> hash password, create User, create session
Signin:  POST /api/auth/signin  -> verify password, create session
Session: Middleware checks session cookie on every (app)/ route
```

No OAuth in Phase 1. Adding Google/GitHub OAuth later is a config change in Auth.js.

## Cognition Proxy

A catch-all API route `/api/c/[...path]/route.ts` with an allowlist.

Behaviors:
- **Auth-gated** -- every proxied request validates the session
- **Allowlist** -- only permitted Cognition paths are forwarded
- **Scope injection** -- adds `X-Cognition-Scope-User: {user.id}` header
- **SSE pass-through** -- streaming responses are piped without buffering
- **Server URL from user record** -- each user points to their own Cognition server

Allowed paths:

```
health, ready,
sessions, sessions/*, sessions/*/messages, sessions/*/messages/*, sessions/*/abort,
agents, agents/*,
models, models/providers/*,
config, config/rollback,
tools, tools/reload, tools/errors, tools/*
```

## Chat UI & Streaming

### State Management

Zustand store with a tree-ready shape from day one:

```typescript
interface ChatStore {
  sessions: SessionSummary[];
  activeSessionId: string | null;
  messagesBySession: Map<string, Map<string, Message>>;  // sessionId -> messageId -> Message
  messageOrder: Map<string, string[]>;                    // sessionId -> ordered messageIds
  streams: Map<string, StreamState>;                      // supports concurrent streams
  sidebarOpen: boolean;
  notifications: Notification[];
}

interface StreamState {
  status: "idle" | "streaming" | "thinking";
  content: string;
  toolCalls: ToolCall[];
  todos: Todo[];
  activeAgent: string;
}
```

Renders as a flat list in Phase 1 (iterate `messageOrder`). Supports tree rendering later (walk `parent_id` from `messagesBySession`). Multiple concurrent streams enable background cron session monitoring.

### SSE Event Types (from Cognition server)

| Event | Payload | UI Behavior |
|-------|---------|-------------|
| `token` | `{content}` | Append to streaming text |
| `tool_call` | `{name, args, id}` | Show expandable tool card |
| `tool_result` | `{tool_call_id, output, exit_code}` | Update tool card with result |
| `planning` | `{todos}` | Show progress checklist |
| `step_complete` | `{step_number, total_steps, description}` | Update checklist |
| `status` | `{status}` | Update streaming indicator |
| `usage` | `{input_tokens, output_tokens, estimated_cost}` | Update token counter |
| `delegation` | `{from_agent, to_agent, task}` | Show agent handoff |
| `error` | `{message, code}` | Show error toast |
| `done` | `{assistant_data, message_id}` | Finalize message |
| `reconnected` | `{last_event_id, resumed}` | Resume stream |

### Tool Renderer Registry

Pluggable rendering per tool name, built from Phase 1:

```typescript
const toolRenderers: Record<string, ComponentType<ToolCallProps>> = {
  default: GenericToolCard,
  // Future: bash -> TerminalOutput, edit_file -> DiffView, web_search -> SearchResults
};
```

## WebSocket

Attached to the custom server on `/ws`. Phase 1 use is limited to:
- Connection status ("Connected to Cognition" / "Server unreachable")
- Background event notifications (cron completions in Phase 3)

SSE stays over HTTP for chat. WS complements it for out-of-band notifications not tied to a specific chat session.

## Cron Jobs (Phase 3)

The Gateway's custom server runs an in-process scheduler (Croner). Jobs are persisted in the database and reloaded on startup.

Flow:
1. User creates job via UI (name, cron expression, agent, prompt)
2. Scheduler registers the job
3. On trigger: create Cognition session, send message, consume SSE, store result
4. Deliver result (webhook, notification) if configured
5. Broadcast status via WebSocket to connected browsers

## Webhooks (Phase 3)

External services POST to `/api/hooks/{path}`. The Gateway validates the payload, renders a prompt template with the request body, and triggers an agent session on Cognition.

## Phase Plan

### Phase 1: Foundation + Working Chat
- Project scaffold (Next.js + custom server + Prisma + Tailwind + shadcn)
- Auth (signup/login, database sessions, first-user-is-admin)
- Cognition proxy (catch-all + allowlist, SSE pass-through)
- Setup wizard (server URL, connection test, first account)
- Chat UI (session sidebar, streaming, tool cards, abort, agent selector)
- Health status indicator
- Docker + docker-compose

### Phase 2: Configuration + Management
- Config editor (form UI for patchable fields, rollback button)
- Models browser + selector
- Tools browser + reload
- Agents browser + detail view
- User preferences (theme, defaults)
- Admin panel (user list, registration toggle, roles)

### Phase 3: Automation
- Cron job CRUD + scheduler
- Cron run history + monitoring UI
- Webhook registration + ingress routing
- Webhook invocation history
- WebSocket notifications for background events

### Phase 4: Enterprise Polish
- PostgreSQL migration path + documentation
- API key management
- Audit logging + viewer
- Multi-server connections
- RBAC (fine-grained permissions)
- Session replay / event timeline view

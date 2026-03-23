# Cognition Gateway Roadmap

This roadmap tracks the path toward a self-hosted control plane for any Cognition server.

`docs/discussions/cognition-gateway-future-guidance.md` is the accepted architectural source of truth for product direction, governance boundaries, and the dispatch/integration model. This roadmap remains the implementation tracker and should be interpreted through that architecture.

All work is categorized by type: Security Fixes, Bug Fixes, Performance Improvements, Dependency Updates, and Features (Phase 1--4).

---

## Work Categories

See AGENTS.md for category definitions, DoD requirements, and precedence rules.

## Architecture Alignment

- Gateway is the governance and supervision surface for agent work.
- Cognition is the execution substrate for sessions, streaming, tools, and resume behavior.
- External systems are trigger and delivery surfaces, not approval surfaces.
- The current implementation roadmap now converges toward a unified dispatch architecture built around shared execution, `DispatchRun`, `ContextMapping`, approvals, activity feed, and integrations.
- Existing phase-based items remain valid delivery history, but new architectural work should align with the migration path captured in `docs/discussions/cognition-gateway-future-guidance.md` and the linked GitHub issues.

---

## Security Fixes

| Date | Description | Severity | Layer | Status |
|------|-------------|----------|-------|--------|
| | | | | |

---

## Bug Fixes

| Date | Description | Issue | Layer | Status |
|------|-------------|-------|-------|--------|
| 2026-03-10 | Auth route handler incompatible with Next.js 16 route type constraints | — | 3 | Fixed |
| 2026-03-10 | `server.ts` constructed bare `PrismaClient()` without the required driver adapter, crashing on startup | — | 2 | Fixed |
| 2026-03-10 | `WebSocketServer({ server, path: "/ws" })` intercepted all upgrade requests including Next.js HMR (`/_next/webpack-hmr`), causing 400 errors and breaking hot reload in dev | — | 2 | Fixed |
| 2026-03-10 | `DATABASE_URL` in `.env` pointed to `file:./dev.db` (project root) but `prisma.config.ts` defaulted to `file:./prisma/dev.db`; mismatch caused "table does not exist" on fresh server start | — | 1 | Fixed |
| 2026-03-10 | `prisma.config.ts` used removed `datasourceUrl` field (Prisma 7 renamed to `datasource.url`) | — | 1 | Fixed |
| 2026-03-10 | `server.ts` used DOM `WebSocket` type instead of `ws` library type, causing type error | — | 2 | Fixed |
| 2026-03-10 | `tool-call-card.tsx` had always-truthy JSX expression in `&&` conditional | — | 4 | Fixed |
| 2026-03-10 | `PrismaClient` used removed library engine; Prisma 7 requires a driver adapter | — | 1 | Fixed |
| 2026-03-10 | Middleware imported Prisma/bcrypt (Node.js-only) causing Edge Runtime build failure | — | 3 | Fixed |
| 2026-03-10 | `better-sqlite3` native binary not compiled (pnpm blocked install script) | — | 1 | Fixed |

---

## Performance Improvements

| Description | Metric | Before | After | Layer | Status |
|-------------|--------|--------|-------|-------|--------|
| | | | | | |

---

## Dependency Updates

| Package | From | To | Breaking | Status |
|---------|------|----|----------|--------|
| `@prisma/adapter-better-sqlite3` | — | 7.4.2 | No | Done |
| `better-sqlite3` | — | 12.6.2 | No | Done |
| `@types/ws` | — | 8.18.1 | No | Done |
| `@types/bcrypt` | — | 6.0.0 | No | Done |
| `@types/better-sqlite3` | — | 7.6.13 | No | Done |
| `tsx` | — | 4.21.0 | No | Done |
| `prettier` | — | 3.8.1 | No | Done |
| `vitest` | — | 4.0.18 | No | Done |
| `@vitejs/plugin-react` | — | 5.1.4 | No | Done |

---

# Features (Phase 1--4)

## Phase Definitions

- **Phase 1 (Foundation + Working Chat)**: End-to-end proof of architecture. A user can sign up, connect a Cognition server, and have a streaming chat with an agent.
- **Phase 2 (Configuration + Management)**: Operational control. Users can browse agents, models, and tools; edit runtime config; manage preferences and other users.
- **Phase 3 (Automation)**: Orchestration. Users can schedule agent-driven cron jobs and register inbound webhooks that trigger agent sessions.
- **Phase 4 (Enterprise Polish)**: Production hardening. API keys, audit logging, RBAC, multi-server connections, and session replay.
- **Phase 5 (Signature UX)**: Differentiated features that make Cognition Gateway feel purpose-built for agentic work — not a generic chat wrapper.

---

## Phase 1: Foundation + Working Chat

| Task | Layer | Status | Acceptance Criteria | Effort | Dependencies |
|------|-------|--------|---------------------|--------|--------------|
| Project scaffold (Next.js 15, custom server.ts, Prisma, Tailwind v4, shadcn/ui) | 1--4 | Done | `pnpm dev:server` starts; `pnpm build` succeeds; `pnpm typecheck` passes | 1 day | None |
| Prisma schema + SQLite (User table, Auth.js tables) | 1 | Done | `pnpm db:push` creates database; User model has id, email, passwordHash, role, preferences, serverUrl | 0.5 days | Scaffold |
| Auth (signup, login, database sessions, first-user-is-admin) | 3 | Done | First signup gets admin role; subsequent signups get user role; `REGISTRATION_ENABLED` env var controls open registration; session cookie set on login; unauthenticated requests to `(app)/` redirect to login | 1.5 days | Prisma schema |
| Cognition proxy (catch-all + allowlist, scope injection) | 3 | Done | `GET /api/c/health` proxies to Cognition `/health`; disallowed paths return 403; `X-Cognition-Scope-User` header injected; unauthenticated requests return 401 | 1 day | Auth |
| SSE pass-through for streaming | 3 | Done | `POST /api/c/sessions/{id}/messages` streams SSE events from Cognition to browser without buffering; `Last-Event-ID` forwarded for reconnection | 1 day | Proxy |
| Setup wizard (server URL input, connection test) | 4 | Done | First-run redirects to `/setup`; user enters name, email, password, Cognition server URL; account created as admin; redirects to login with success message; `/api/setup` returns 403 after first user exists | 1 day | Auth, Proxy |
| Chat UI: session sidebar (list, create, delete) | 4 | Done | Sidebar lists sessions from `GET /api/c/sessions`; "New Chat" creates session via `POST /api/c/sessions`; delete removes session; active session highlighted | 1 day | Proxy |
| Chat UI: message streaming (tokens, tool calls, planning) | 4 | Done | User message sent via POST; tokens render incrementally; tool calls show expandable cards with name, args, output; planning events show checklist; done event finalizes message | 2 days | SSE pass-through |
| Chat UI: abort button | 4 | Done | Abort button visible during streaming; click calls `POST /api/c/sessions/{id}/abort`; stream ends; UI returns to idle state | 0.5 days | Message streaming |
| Chat UI: agent selector | 4 | Done | Dropdown populated from `GET /api/c/agents`; selected agent passed when creating session; current agent displayed per session | 0.5 days | Proxy |
| Health status indicator | 4 | Done | Header shows green/yellow/red dot based on periodic `GET /api/c/health`; tooltip shows version, active sessions, circuit breaker status | 0.5 days | Proxy |
| Docker + docker-compose | 1 | Done | `docker compose up` starts Gateway; Gateway reachable at `localhost:3000`; SQLite data persisted in named volume; schema migration runs on container startup | 1 day | All above |

---

## Phase 2: Configuration + Management

| Task | Layer | Status | Acceptance Criteria | Effort | Dependencies |
|------|-------|--------|---------------------|--------|--------------|
| Config editor (form UI for patchable fields) | 4 | Done | Form renders current values from `GET /api/c/config`; fields match `ALLOWED_CONFIG_PATHS` (LLM, agent, rate_limit, observability, MLflow sections); submit calls `PATCH /api/c/config`; success/error feedback | 2 days | Phase 1 |
| Config rollback button | 4 | Done | "Rollback" button calls `POST /api/c/config/rollback`; confirmation dialog before action; shows result | 0.5 days | Config editor |
| Models browser + selector | 4 | Done | Page lists models from `GET /api/c/models` grouped by provider; shows id, display name, capabilities; model selectable per session from chat UI | 1 day | Phase 1 |
| Tools browser + reload | 4 | Done | Page lists tools from `GET /api/c/tools`; shows name, source, module; "Reload" button calls `POST /api/c/tools/reload`; errors shown from `GET /api/c/tools/errors` | 1 day | Phase 1 |
| Agents browser + detail view | 4 | Done | Page lists agents from `GET /api/c/agents`; detail view shows name, description, mode, tools, skills, system prompt (truncated) | 1 day | Phase 1 |
| User preferences (theme, default agent, font size) | 3--4 | Done | Settings page with theme toggle (light/dark/system), stored in User.preferences JSON column; applied on page load via next-themes | 1 day | Phase 1 |
| Admin panel: user list | 3--4 | Done | Admin-only page listing all users; shows email, role, created date; admin can change user roles | 1 day | Phase 1 |
| Admin panel: registration toggle | 3 | Done | Admin can enable/disable open registration; setting persisted in GatewaySettings DB model; signup page shows "Registration disabled" when off | 0.5 days | Admin panel |

---

## Phase 3: Automation

| Task | Layer | Status | Acceptance Criteria | Effort | Dependencies |
|------|-------|--------|---------------------|--------|--------------|
| CronJob + CronJobRun Prisma models | 1 | Done | Migration adds CronJob (schedule, agentName, prompt, sessionMode, deliveryMode, enabled) and CronJobRun (status, sessionId, output, tokenUsage) tables | 0.5 days | Phase 1 |
| Cron scheduler in custom server | 2 | Done | `server.ts` loads enabled CronJobs from DB on startup; Croner schedules each; on trigger: creates Cognition session, sends prompt, consumes SSE, writes CronJobRun; survives Gateway restart (reloads from DB) | 2 days | CronJob models |
| Cron job CRUD API routes | 3 | Done | `POST/GET/PATCH/DELETE /api/cron/jobs`; Zod validation; auth-gated; creating/updating a job registers/updates the live scheduler | 1 day | Cron scheduler |
| Cron job management UI | 4 | Done | Page lists jobs with name, schedule, agent, enabled toggle, last run status; create/edit dialog with cron expression input; run history expandable per job | 2 days | Cron CRUD API |
| Cron delivery: webhook mode | 2 | Done | CronJob with `deliveryMode: "webhook"` POSTs result to `deliveryTarget` URL on completion; includes run summary, token usage, session link | 1 day | Cron scheduler |
| Webhook + WebhookInvocation Prisma models | 1 | Done | Migration adds Webhook (path, secret, agentName, promptTemplate, sessionMode, enabled) and WebhookInvocation (status, sessionId, sourceIp) tables | 0.5 days | Phase 1 |
| Webhook ingress routing | 2--3 | Done | `POST /api/hooks/{path}` matches Webhook record; validates HMAC if secret set; renders promptTemplate with request body; creates Cognition session; stores WebhookInvocation | 2 days | Webhook models |
| Webhook management UI | 4 | Done | Page lists webhooks with name, path (copyable URL), agent, enabled toggle; create/edit dialog; invocation history per webhook with status, timestamp, session link | 1.5 days | Webhook ingress |
| WebSocket notifications for background events | 2--4 | Done | `server.ts` WebSocket broadcasts cron completion and webhook invocation events; browser shows toast notification with link to session; notification bell with unread count | 1.5 days | Cron scheduler, Webhook ingress |

---

## Phase 4: Enterprise Polish

| Task | Layer | Status | Acceptance Criteria | Effort | Dependencies |
|------|-------|--------|---------------------|--------|--------------|
| PostgreSQL migration path | 1 | Pending | Prisma schema works with `provider = "postgresql"`; `DATABASE_URL` env var switches between SQLite and Postgres; migration docs written; docker-compose includes Postgres profile | 1 day | Phase 1 |
| ApiKey Prisma model + management | 1--3 | Done | Users can create named API keys; keys are hashed (only prefix shown after creation); API routes accept `Authorization: Bearer {key}` as alternative to session cookie; keys have optional expiry | 2 days | Phase 1 |
| Audit logging | 1--3 | Done | AuditLog table records: user, action, resource, details, IP, timestamp; logged actions: session.create, session.delete, config.patch, config.rollback, cron.create, cron.run, webhook.create, user.create, user.role_change, apikey.create, apikey.delete, apikey.use | 2 days | Phase 1 |
| Audit log viewer | 4 | Done | Admin-only page (`/audit`) showing filterable audit log; filters: action, userId, resource; paginated (50/page); table columns: timestamp, user, action, resource, details, IP | 1.5 days | Audit logging |
| API Keys UI | 4 | Done | `/settings/api-keys` page — generate named keys, view prefix/last-used, revoke with confirmation; full key shown once in modal with copy button | 1 day | ApiKey model |
| WebSocket notification bell | 2--4 | Done | Bell icon in header; subscribes to `/ws` on mount; shows unread badge; dropdown lists `cron.run.complete`, `cron.run.failed`, `webhook.invoked` events with timestamps | 1 day | Phase 3 WS |
| Multi-server connections | 1--4 | Pending | ServerConnection Prisma model (extracted from User.serverUrl); users can add multiple Cognition servers with labels; server selector in UI; active server determines proxy target | 2 days | Phase 2 |
| RBAC (role-based access control) | 3 | Pending | Permissions beyond admin/user: config_editor, cron_manager, webhook_manager; role-to-permission mapping; middleware checks permissions per route | 3 days | Phase 2 |
| Session replay / event timeline | 4 | Pending | Persisted SSE event log per session (stored in Gateway DB); replay UI shows events arriving in original timing; timeline scrubber for debugging agent behavior | 3 days | Phase 1 |

---

## Phase 5: Signature UX

Features that make Cognition Gateway feel purpose-built for agentic work rather than a generic chat wrapper. These expose the planning and tool-execution loop as first-class UI — not collapsed cards buried in a scroll history.

| Task | Layer | Status | Acceptance Criteria | Effort | Dependencies |
|------|-------|--------|---------------------|--------|--------------|
| Live Task Canvas | 4 | Done | During an active agent run, a persistent side panel renders the `planning` todo list as interactive cards; each card updates in real-time as `step_complete` events arrive; tool call results attach inline to their respective step card; the canvas persists after the run completes as a visual audit trail of what the agent did; panel is collapsible and remembers its state per session | 2 days | Phase 1 chat UI |
| Artifact Shelf | 4 | Done | Code blocks and file outputs (≥8 lines) are automatically detected and pinned to a persistent shelf above the input bar; shelf survives scrolling and persists for the session lifetime; each artifact can be expanded, copied, or referenced in a follow-up message via `@label` syntax that injects the content into the outgoing prompt; shelf is collapsible | 2 days | Phase 1 chat UI |
| Session titles + home screen | 4 | Done | `/chat` shows a home screen (recent sessions list + new session CTA) instead of auto-creating a blank session; after the first message `done` event, the Gateway auto-titles the session from the first 8 words of the user input via `PATCH /api/c/sessions/{id}`; title updates live in the sidebar | 1 day | Phase 1 chat UI |
| Inline stream error surfacing | 4 | Done | Stream errors (`error` SSE event, network failure, abort) render as an inline red message in the conversation rather than silently clearing; error includes the message from Cognition and a "retry" button that re-sends the last user message | 0.5 days | Phase 1 chat UI |
| Session rename | 4 | Done | Hover a session in the sidebar to reveal an edit icon; click to enter inline rename mode; `Enter` or blur commits via `PATCH /api/c/sessions/{id}`; `Escape` cancels | 0.5 days | Phase 1 chat UI |

---

## Roadmap Governance

Per AGENTS.md requirements:

1. **Structure**: Organized by work category (Security, Bug, Performance, Dependency, Features).
2. **Categories**: All six categories tracked here with appropriate detail levels.
3. **Precedence**: Security fixes override all. Bug fixes > Features. Performance/Dependency can proceed alongside Features. Features follow phase ordering: Phase 1 > 2 > 3 > 4.
4. **When to Update**:
   - Features/Architectural: Before starting work.
   - Security/Bug/Performance/Dependency: As part of PR.

**Last Updated**: 2026-03-20 — Phase 6 complete (Skills CRUD, Agent Builder, Provider/Model Manager, Model Catalog, per-session model picker, Cognition v0.4.0 upgrade). Phase 4 partial: PostgreSQL migration, multi-server, RBAC, session replay remain pending.

---

## Phase 6: Dynamic Config (Cognition v0.3.0–v0.4.0)

Integration with Cognition's ConfigRegistry API — hot-reloadable agent definitions, skills, and LLM providers with multi-tenant scoping.

### Breaking Changes Addressed

| Task | Layer | Status | Acceptance Criteria | Effort | Dependencies |
|------|-------|--------|---------------------|--------|--------------|
| Remove deprecated env vars from docker-compose | 1 | Done | `COGNITION_LLM_PROVIDER`, `COGNITION_LLM_MODEL`, `COGNITION_BEDROCK_MODEL_ID` removed from `docker-compose.dev.yml`; replaced with `.cognition/config.yaml` bootstrap (v0.4.0 `llm:` format) | 0.5 days | Cognition v0.3.0 image |
| Proxy allowlist updates | 3 | Done | `/skills`, `/skills/`, `/models/providers`, `/models/providers/` added to `ALLOWED_PATHS`/`ALLOWED_PREFIXES` | 0.5 days | Phase 1 proxy |
| Cognition v0.4.0 type updates | 1 | Done | `ProviderResponse`, `ProviderCreate`, `ProviderUpdate`, `ModelInfo`, `SkillResponse`, `SkillCreate`, `AgentCreate`, `AgentUpdate`, `SessionConfig` rewritten to match exact v0.4.0 Pydantic schemas | 0.5 days | Cognition v0.4.0 |

### New Gateway Features

| Task | Layer | Status | Acceptance Criteria | Effort | Dependencies |
|------|-------|--------|---------------------|--------|--------------|
| Skills browser + CRUD UI | 4 | Done | `/skills` page lists skills; create dialog with name, description, SKILL.md content editor (auto-generates frontmatter from form fields); edit dialog pre-fills existing content; delete with confirmation; built-in/file skills shown read-only; source + content badges; scoped per-user | 2 days | Proxy updates |
| Agent Builder | 4 | Done | `/agents` full CRUD: create dialog with name, description, mode selector, system prompt, model override, tools, skill assignment (toggle chips from live skill list); edit existing agents; delete non-native agents; native agents (`default`, `readonly`) edit-only; scoped per-user | 3 days | Proxy updates, Skills UI |
| Provider Manager | 4 | Done | `/providers` full CRUD: list provider configs with type/model/region/status badges; create dialog with type selector (Bedrock/OpenAI/Anthropic/OpenAI-compatible/Google), model, display name, api_key_env, base_url, region; edit dialog; delete with confirmation; **Test** button hits `POST /models/providers/{id}/test` and shows live result; seeded providers marked with "seeded" badge | 2 days | Proxy updates |
| Model Catalog | 4 | Done | `/models` upgraded to searchable catalog powered by models.dev (3,800+ models); search by name/ID; filter by provider chip or "Tool call" toggle; model cards show context window, input/output pricing, capability badges (Tools/Vision/Reasoning/etc.); grouped by provider | 1.5 days | Proxy updates |
| Per-session model picker | 4 | Done | Chat input bar includes model picker button (CpuIcon); opens popover with provider chip selector + searchable model list from `GET /models/providers/{id}/models`; selection writes `provider_id` + `model` to `SessionConfig` via `PATCH /sessions/{id}` on first message; button label shows active selection; X clears to Auto | 1.5 days | Provider Manager, Model Catalog |
| Real-time config updates | 4 | Pending | WebSocket or polling for config changes; sidebar agents list refreshes when new agent created elsewhere; toast notification on config hot-reload | 1 day | Phase 3 WS |

**Phase 6 Goal**: Gateway becomes the primary interface for managing Cognition's runtime configuration — no more restarting containers to change models or system prompts.

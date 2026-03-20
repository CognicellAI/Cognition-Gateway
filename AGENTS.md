# AGENTS.md — Cognition Gateway

Guidelines for agentic coding assistants working on this codebase.

## Project Overview

Cognition Gateway is a self-hosted web interface that acts as a detached frontend for any Cognition server. It provides:

- **Chat UI**: Streaming agent conversations with tool call rendering
- **Proxy**: Auth-gated pass-through to a Cognition backend with scope injection
- **Auth**: Database-backed sessions, first-user-is-admin, registration control
- **Orchestration**: Cron scheduling and webhook ingress for agent-driven automation
- **Configuration**: Runtime config management for the connected Cognition server

The Gateway does not execute agents. It owns _when_ and _why_ agents run. The Cognition server owns _how_ they run.

## Build / Test / Lint Commands

This project uses `pnpm` for dependency management.

```bash
# Install dependencies
pnpm install

# Run development server (standard Next.js)
pnpm dev

# Run development server (custom server with cron + WebSocket)
pnpm dev:server

# Run production build
pnpm build

# Start production server
pnpm start

# Run all tests
pnpm test

# Run single test file
pnpm test -- src/lib/gateway/proxy.test.ts

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Format
pnpm format

# Database migrations
pnpm db:push       # Apply schema to dev database
pnpm db:migrate    # Create and apply migration
pnpm db:studio     # Open Prisma Studio
```

## Code Style Guidelines

### TypeScript Standards

- **TypeScript 5.x**, strict mode enabled.
- **No `any`**. Use `unknown` and narrow with type guards. The only exception is third-party library interop where types are unavailable.
- **Zod for runtime validation**. All external input (API request bodies, webhook payloads, environment variables) must be validated with Zod schemas. Infer TypeScript types from Zod schemas, not the other way around.
- **Prefer `interface` over `type`** for object shapes. Use `type` for unions, intersections, and mapped types.
- **Explicit return types** on exported functions and all API route handlers.

### Naming Conventions

- `camelCase`: functions, variables, hook names (`useChat`, `fetchSessions`).
- `PascalCase`: components, types, interfaces, classes (`ChatView`, `SessionStore`).
- `UPPER_SNAKE_CASE`: constants and environment variable references (`ALLOWED_PATHS`, `DATABASE_URL`).
- `kebab-case`: file names and directory names (`chat-store.ts`, `tool-card.tsx`).
- Prefix hooks with `use`: `useChatStream`, `useServerHealth`.
- Prefix server-only utilities with module path: `lib/gateway/`, `lib/auth/`, `lib/db/`.

### File Organization

- **One component per file**. Co-locate component-specific types and helpers in the same file only if they are not shared.
- **Barrel exports (`index.ts`) are prohibited**. Import directly from the source file. Barrel files obscure dependency graphs and break tree-shaking.
- **Co-locate tests**. Place `foo.test.ts` next to `foo.ts`. Use `__tests__/` only for integration tests spanning multiple modules.

### Async Patterns

- **`async`/`await`** for all I/O (database, fetch, file system).
- **No fire-and-forget promises**. Every `async` call must be `await`ed or explicitly handled with `.catch()`.
- **Use `Promise.all`** for concurrent independent operations.
- **Server Actions**: Prefer Next.js Server Actions for form mutations. Use API routes for non-form endpoints (proxy, webhooks, cron).

### Error Handling

- **Throw descriptive errors** with context. Never `throw new Error("failed")`.
- **API routes return structured errors**: `{ error: string; code?: string; details?: unknown }`.
- **Client-side**: Use error boundaries for component trees. Use toast notifications for transient errors. Use inline messages for form validation.
- **Proxy errors**: Distinguish between Gateway errors (auth, allowlist) and Cognition errors (forwarded as-is with status code).

### React & Component Patterns

- **Server Components by default**. Only add `"use client"` when the component needs browser APIs, event handlers, or hooks.
- **shadcn/ui as the component foundation**. Do not install additional component libraries. Extend shadcn/ui components when needed.
- **Zustand for client state**. No React Context for global state. Context is acceptable for scoped provider patterns (theme, auth session).
- **TanStack Query for server data**. Use for all non-streaming GET requests (sessions list, agents, models, config). Do not use for SSE streams.

## Project Structure

```
cognition-gateway/
├── server.ts                    # Custom Node.js server (cron, WS, Next.js)
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/              # Unauthenticated routes (login, signup)
│   │   ├── (app)/               # Authenticated routes (chat, settings)
│   │   └── api/                 # API route handlers
│   │       ├── auth/            # Auth endpoints
│   │       ├── c/[...path]/     # Cognition proxy
│   │       ├── cron/            # Cron job CRUD
│   │       └── hooks/[...path]/ # Webhook ingress
│   ├── lib/
│   │   ├── gateway/             # Server-side only: proxy, cron, events
│   │   ├── auth/                # Session utilities, password hashing
│   │   ├── db/                  # Prisma client singleton
│   │   └── cognition/           # Typed Cognition API client + SSE types
│   ├── components/              # React components
│   ├── hooks/                   # Client-side React hooks
│   └── types/                   # Shared TypeScript type definitions
├── prisma/
│   └── schema.prisma
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### Boundary Rules

The codebase has two distinct runtime environments. Respect the boundary:

| Directory | Runtime | May import from |
|-----------|---------|-----------------|
| `src/lib/gateway/` | Node.js only | `src/lib/db/`, `src/lib/cognition/`, `src/types/` |
| `src/lib/auth/` | Node.js only | `src/lib/db/`, `src/types/` |
| `src/lib/db/` | Node.js only | `src/types/` |
| `src/lib/cognition/` | Node.js only | `src/types/` |
| `src/app/api/` | Node.js only | `src/lib/*`, `src/types/` |
| `src/components/` | Browser | `src/hooks/`, `src/types/` |
| `src/hooks/` | Browser | `src/types/` |
| `src/types/` | Both | Nothing (leaf module) |

**Never import from `src/lib/` in browser components.** Use API routes or Server Components to bridge the boundary.

**`src/lib/gateway/` must not import from React, Next.js page/component modules, or any browser API.** This is the extractable core — it must remain a pure Node.js module.

## Key Workflows

### Adding a New Page

1. Create the route directory under `src/app/(app)/` or `src/app/(auth)/`.
2. Add a `page.tsx` (Server Component by default).
3. If it needs client interactivity, create a separate `"use client"` component and compose it inside the server page.
4. Add navigation entry in the sidebar component if applicable.

### Adding a New Proxied Cognition Endpoint

1. Add the path pattern to the `ALLOWED_PATHS` set in `src/lib/gateway/proxy.ts`.
2. Add the corresponding type definitions in `src/types/cognition.ts`.
3. No new API route file needed — the catch-all handler picks it up automatically.

### Adding a New Gateway-Owned API Route

1. Create the route file under `src/app/api/`.
2. Validate input with Zod.
3. Authenticate with the session utility from `src/lib/auth/`.
4. Return structured JSON responses with appropriate status codes.

### Adding a Tool Renderer

1. Create a component in `src/components/tool-renderers/`.
2. Register it in the tool renderer registry by tool name.
3. The `GenericToolCard` handles any unregistered tool automatically.

## Testing

- **Unit tests**: Vitest. Test pure functions, Zod schemas, store logic, proxy allowlist.
- **Component tests**: Vitest + Testing Library. Test interactive components in isolation.
- **Integration tests**: Test API routes with mocked Prisma and mocked Cognition server responses.
- **E2E tests**: Playwright. Test critical flows: signup, connect server, send message, receive stream.
- **No tests for trivial components**. A component that renders static markup from props does not need a test.

## Security

- **Never commit secrets**. Use `.env` and `.env.local`. Both are gitignored.
- **Validate all proxy paths** against the allowlist. A request to an unlisted Cognition endpoint must return 403.
- **Hash passwords with bcrypt** (cost factor 12+). Never store plaintext.
- **Sanitize webhook payloads**. Treat all inbound webhook data as untrusted.
- **CSRF protection**: Auth.js handles this for session endpoints. Webhook endpoints use HMAC signature validation.
- **No `dangerouslySetInnerHTML`**. Use react-markdown for rendering user/agent content.

---

# Hard Requirements

## Mission

Cognition Gateway is a **detached, self-hosted interface** for any Cognition server.

A single deployment must provide:

* Authentication and user management
* Proxied access to Cognition with multi-tenant isolation
* Real-time streaming chat with tool visualization
* Runtime configuration management
* Scheduled and event-triggered agent orchestration
* Audit trail for enterprise compliance

---

# 0. Work Categories & Roadmap Governance

## Work Categories

All work falls into one of six categories. Each has different ROADMAP.md requirements and Definition of Done criteria.

| Category | ROADMAP Entry | Priority | Can Proceed Without Planning? |
|----------|--------------|----------|-------------------------------|
| **Security Fix** | Line item (severity + layer) | **Immediate** — overrides all | Yes |
| **Bug Fix** | Line item (description + layer) | **High** — next available cycle | Yes |
| **Performance Improvement** | Entry with benchmarks | **Medium-High** | Yes, unless architectural change |
| **Dependency Update** | Line item (package + versions) | **Medium** — batch when practical | Yes, unless breaking changes |
| **Feature / Enhancement** | Full entry (criteria + layer + effort) | Per roadmap phase | **No** — must have roadmap entry first |
| **Architectural Change** | Full entry + migration plan | Per roadmap phase | **No** — must have roadmap entry first |

### Category Details

**Security Fix**
- Address vulnerabilities, data exposure, or auth bypasses.
- Severity: Critical, High, Medium, Low.
- Can be merged immediately after review, bypassing feature roadmap.

**Bug Fix**
- Correct incorrect behavior, crashes, or regressions.
- Must include a test that reproduces the bug and verifies the fix.

**Performance Improvement**
- Optimize latency, bundle size, memory, or throughput.
- Must include measurement (before/after).
- Must not degrade code readability without strong justification.

**Dependency Update**
- Upgrade external packages or tools.
- Breaking changes that require code modifications bump to Feature category.
- Lock file (`pnpm-lock.yaml`) must be updated.

**Feature / Enhancement**
- New capabilities, pages, API endpoints, or UX improvements.
- Must have a ROADMAP.md entry with acceptance criteria before work begins.

**Architectural Change**
- Refactoring that changes module boundaries, data flow, or runtime model.
- Must have a ROADMAP.md entry plus migration plan if breaking.

---

## ROADMAP.md Structure

ROADMAP.md is organized by work category at the top and by delivery phase for features:

```markdown
# Cognition Gateway Roadmap

## Security Fixes
| Date | Description | Severity | Layer | Status |

## Bug Fixes
| Date | Description | Issue | Layer | Status |

## Performance Improvements
| Description | Metric | Before | After | Layer | Status |

## Dependency Updates
| Package | From | To | Breaking | Status |

## Features (Phase 1–4)
### Phase 1: Foundation + Working Chat
...
### Phase 2: Configuration + Management
...
### Phase 3: Automation
...
### Phase 4: Enterprise Polish
...
```

### When to Update ROADMAP.md

- **Before starting work**: Features and architectural changes.
- **As part of PR**: Security fixes, bug fixes, performance, dependencies.
- **Before merging architectural changes**: Migration plan documented.

---

## Precedence Rules

1. **Security fixes override all other work.**
2. **Bug fixes take priority over new features.**
3. **Architectural corrections take priority over feature work.**
4. **Performance and dependency work can proceed alongside features.**
5. **Features follow phase ordering (Phase 1 > 2 > 3 > 4).**

---

# 1. Architectural Layers

The Gateway has four logical layers. Dependency direction is top-down.

```
Layer 4: UI (pages, components, hooks)
Layer 3: API (route handlers, auth middleware, proxy)
Layer 2: Gateway Core (cron scheduler, event bus, WebSocket)
Layer 1: Data & Integration (Prisma, Cognition API client, types)
```

- Layer 4 may import from Layers 3, 2, 1.
- Layer 3 may import from Layers 2, 1.
- Layer 2 may import from Layer 1.
- Layer 1 imports from nothing internal.

**No upward imports.** Layer 1 must never import from Layer 2, 3, or 4.

---

# 2. Definition of Done (by Category)

### Security Fixes
- [ ] Test verifying the vulnerability is addressed
- [ ] No regressions (existing tests pass)
- [ ] Respects layer boundaries

### Bug Fixes
- [ ] Test reproducing and verifying the fix
- [ ] No regressions
- [ ] Respects layer boundaries

### Performance Improvements
- [ ] No regressions
- [ ] Benchmark demonstrating improvement (before/after)
- [ ] Does not degrade readability without justification

### Dependency Updates
- [ ] Full test suite passes
- [ ] Lock file updated
- [ ] Breaking changes documented and handled

### Features / Enhancements
- [ ] Listed in ROADMAP.md with acceptance criteria
- [ ] Layer assignment identified
- [ ] Respects boundary rules (server/browser split)
- [ ] Has tests (unit, integration, or E2E as appropriate)
- [ ] Does not introduce architectural drift
- [ ] Accessible (keyboard navigable, screen reader compatible where applicable)

### Architectural Changes
- [ ] Meets full Feature DoD, plus:
- [ ] Migration path documented if breaking
- [ ] Layer dependency direction preserved
- [ ] `src/lib/gateway/` remains extractable (no React/Next.js page imports)

---

# 3. Enforcement Protocol

Before merging any PR, agents must verify:

- [ ] Work category is identified
- [ ] ROADMAP.md is updated appropriately for the category
- [ ] Layer boundaries are respected
- [ ] Tests pass for the category
- [ ] Category-specific Definition of Done is met

If any answer is "no," the PR must be revised.

---

# 4. Architectural North Star

Cognition Gateway must eventually allow:

```bash
docker run -p 3000:3000 \
  -e COGNITION_SERVER_URL=http://my-cognition:8000 \
  cognition-gateway
```

And automatically provide:

* First-user setup wizard
* Authentication and user management
* Proxied, scoped access to any Cognition server
* Real-time streaming chat with tool visualization
* Runtime Cognition configuration management
* Scheduled agent-driven cron jobs
* Webhook-triggered agent runs
* Audit logging for enterprise compliance
* Multi-server connection management

The roadmap exists to force convergence toward that state.

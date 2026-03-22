# RFC: GitHub-Driven Agent Orchestration via Gateway Webhooks (Human-in-the-Loop Control Plane)

**Category:** Architecture / Orchestration
**Status:** Proposal — open for discussion
**Related:** [Option A: GitHub Actions Direct to Cognition](./github-actions-direct-to-cognition.md)

---

## Overview

This discussion proposes using **Cognition Gateway as the primary orchestration layer** for autonomous agent workflows on GitHub projects. GitHub sends webhook events to Gateway; Gateway dispatches agents to Cognition Server; agents use `gh` CLI to interact with GitHub. The Gateway UI provides a human-in-the-loop break-glass interface — a human can open any agent session, observe the full reasoning trace, inject instructions, and take over when needed.

The core premise: Cognition Gateway already has the webhook ingress, HMAC validation, session management, audit trail, and chat UI to serve as a control plane. The missing pieces (webhook output capture, notification wiring, session discoverability) are fixable gaps, not architectural problems.

---

## Architecture

```mermaid
flowchart TD
    subgraph GitHub
        E1[push]
        E2[pull_request.opened]
        E3[pull_request.synchronize]
        E4[issues.opened]
        E5[issue_comment.created]
        E6[workflow_run.completed\nCI failure]
    end

    subgraph "Cognition Gateway (k8s)"
        WH[Webhook Ingress\nPOST /api/hooks/gh-pr\nHMAC validated]
        DB[(Gateway DB\nSQLite → Postgres\nWebhook + Session map\nAudit log)]
        CRON[Cron Scheduler\nStale issue sweep\nCI health check]
        WS[WebSocket\nReal-time notifications]
        UI[Chat UI\nbreak-glass\nhuman-in-the-loop]
        AUDIT[Audit Log\nWho triggered what\nWhen, output, tokens]
    end

    subgraph "Cognition Server (k8s)"
        API[Cognition HTTP API]
        AGENT[Agent Process\nwith gh CLI tool\nwith GitHub PAT]
    end

    subgraph "GitHub Output"
        COMMENT[PR / Issue Comment]
        PR_OUT[Pull Request]
        COMMIT[Commit / Branch]
        CHECK[Check Run]
    end

    subgraph "Human"
        BROWSER[Browser\nGateway UI]
        MOBILE[GitHub Mobile\nnotifications]
    end

    E1 -->|X-Hub-Signature-256| WH
    E2 -->|X-Hub-Signature-256| WH
    E3 -->|X-Hub-Signature-256| WH
    E4 -->|X-Hub-Signature-256| WH
    E5 -->|X-Hub-Signature-256| WH
    E6 -->|X-Hub-Signature-256| WH

    WH -->|202 Accepted| GitHub
    WH --> DB
    WH -->|create session\nsend prompt| API
    CRON -->|periodic sweep| API

    API --> AGENT
    AGENT -->|gh CLI| COMMENT
    AGENT -->|gh CLI| PR_OUT
    AGENT -->|gh CLI| COMMIT
    AGENT -->|gh CLI| CHECK

    DB --> AUDIT
    API -->|SSE stream| WH
    WH -->|store output| DB
    WH -->|broadcast| WS

    WS -->|notification: session link| BROWSER
    BROWSER --> UI
    UI -->|resume session\ninteractive chat| API

    MOBILE -->|GitHub notification\nfrom agent comment| BROWSER
```

---

## Sequence: PR Review with Human Takeover

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer
    actor Human as Human (Gateway UI)
    participant GH as GitHub
    participant GW as Cognition Gateway
    participant COG as Cognition Server
    participant Agent as Agent (gh CLI)

    Dev->>GH: Opens Pull Request #42
    GH->>GW: POST /api/hooks/gh-pr\nX-Hub-Signature-256: sha256=...
    GW->>GW: Validate HMAC ✓
    GW-->>GH: HTTP 202 Accepted (immediate)
    GW->>GW: Render prompt template\n"Review PR {{number}} in {{repository}}"
    GW->>COG: POST /sessions\n{agent: "code-reviewer", scope: "system"}
    COG-->>GW: {session_id: "sess_pr42_abc"}
    GW->>GW: Store {repo:owner/repo, pr:42} → sess_pr42_abc
    GW->>COG: POST /sessions/sess_pr42_abc/messages\n(streaming)
    COG->>Agent: Dispatch
    Agent->>GH: gh pr view 42 --json
    GH-->>Agent: diff, files, commits
    Agent->>Agent: Analyze, form review
    Agent->>GH: gh pr review 42 --comment "Found 3 issues..."
    COG-->>GW: SSE: done {output: "Posted review"}
    GW->>GW: Store output in WebhookInvocation
    GW->>GW: Broadcast WebSocket event\n{type: "webhook.invoked", sessionId: "sess_pr42_abc"}

    Note over Human: Receives notification in Gateway UI bell

    Human->>GW: Clicks notification → /chat/sess_pr42_abc
    GW->>COG: GET /sessions/sess_pr42_abc/messages
    COG-->>GW: Full message history\n(agent reasoning, tool calls, output)
    Human->>Human: Reads full trace:\nwhich files were checked,\nwhat tools were called,\nwhat the agent concluded

    Note over Human: Wants to override agent's approach

    Human->>GW: Types: "The API surface change is intentional — ignore that finding, focus only on the test coverage gaps"
    GW->>COG: POST /sessions/sess_pr42_abc/messages\n{content: "Human override: ..."}
    COG->>Agent: Resume session with instruction
    Agent->>GH: gh pr review 42 --comment "Updated review: focusing on test coverage..."
    COG-->>GW: SSE: done
    GW->>GW: Update WebhookInvocation output
```

---

## Sequence: Stale Issue Sweep (Cron-Triggered)

```mermaid
sequenceDiagram
    autonumber
    participant CRON as Gateway Cron Scheduler
    participant GW as Cognition Gateway
    participant COG as Cognition Server
    participant Agent as Agent (gh CLI)
    participant GH as GitHub Issues

    Note over CRON: 0 9 * * 1 — Monday 9am

    CRON->>COG: POST /sessions\n{agent: "issue-triager", title: "Weekly triage"}
    COG-->>CRON: {session_id: "sess_triage_xyz"}
    CRON->>COG: POST /sessions/sess_triage_xyz/messages\n"Triage open issues in owner/repo older than 30 days"
    COG->>Agent: Dispatch
    Agent->>GH: gh issue list --state open --json number,title,createdAt,labels
    GH-->>Agent: 12 open issues
    Agent->>Agent: Classify: stale(4), needs-triage(3), active(5)
    Agent->>GH: gh issue edit 8 --add-label stale
    Agent->>GH: gh issue comment 8 --body "Marking stale after 45 days..."
    Agent->>GH: gh issue edit 12 --add-label needs-triage
    Agent->>GH: gh issue comment 22 --body "Closing as duplicate of #19"
    Agent->>GH: gh issue close 22
    COG-->>CRON: SSE: done\n{output: "Processed 12 issues, labeled 7, closed 1"}
    CRON->>GW: Store CronJobRun {status: success, output: "..."}
    CRON->>GW: Broadcast WebSocket\n{type: "cron.run.complete", jobName: "Weekly Issue Triage"}

    Note over GW: Human sees notification in bell dropdown
```

---

## Sequence: Failed CI — Human Decides Whether to Engage

```mermaid
sequenceDiagram
    autonumber
    actor Human as Human (Gateway UI)
    participant GH as GitHub Actions
    participant GW as Cognition Gateway
    participant COG as Cognition Server
    participant Agent as Agent (gh CLI)

    GH->>GW: POST /api/hooks/gh-ci-failure\n{workflow: "test.yml", conclusion: "failure", run_id: 99}
    GW->>GW: Validate HMAC ✓
    GW-->>GH: HTTP 202
    GW->>COG: POST /sessions {agent: "ci-troubleshooter"}
    GW->>COG: POST /sessions/sess_ci_99/messages\n"CI failed on workflow test.yml run 99. Diagnose and fix."
    COG->>Agent: Dispatch
    Agent->>GH: gh run view 99 --log-failed
    GH-->>Agent: Failure log: "TypeError: Cannot read property 'x' of undefined"
    Agent->>Agent: Identify root cause: missing null check in src/lib/parser.ts:44
    Agent->>GH: gh issue create --title "CI: null ref in parser.ts" --body "..."
    COG-->>GW: SSE: done
    GW->>GW: Broadcast notification

    Note over Human: Sees "CI Troubleshooter completed — sess_ci_99"

    Human->>GW: Opens session → reads agent's diagnosis
    Human->>Human: Evaluates: "This is wrong, the issue is in the test fixture, not the source"
    Human->>GW: Types: "The source is correct. The test fixture is missing a mock. Close that issue and fix the test."
    GW->>COG: POST /sessions/sess_ci_99/messages {content: "Human correction: ..."}
    COG->>Agent: Resume
    Agent->>GH: gh issue close {issue_number} --comment "Closing — root cause was test fixture, not source"
    Agent->>GH: gh pr create --title "fix: add missing mock to parser test" --body "..."
    COG-->>GW: SSE: done
```

---

## Gateway Configuration: Webhook Setup

Each GitHub event type maps to a named webhook in Gateway. The prompt template interpolates payload fields using `{{field}}` syntax.

```
Gateway Webhook Registry
─────────────────────────────────────────────────────────
Name             Path                  Agent             Secret
──────────────────────────────────────────────────────────────
gh-pr-review     gh-pr-review          code-reviewer     ••••••••
gh-issue-opened  gh-issue-opened       issue-triager     ••••••••
gh-ci-failure    gh-ci-failure         ci-troubleshooter ••••••••
gh-discussion    gh-discussion         community-bot     ••••••••
─────────────────────────────────────────────────────────
```

**GitHub Repo Webhook Configuration:**

```
Payload URL:     https://gateway.your-domain.com/api/hooks/gh-pr-review
Content type:    application/json
Secret:          (matches Gateway webhook secret)
Events:          Pull requests
```

**Prompt template example (PR review):**

```
A pull request event was received.
Action: {{action}}
PR title: {{pull_request.title}}
Repository: {{repository.full_name}}
Author: {{pull_request.user.login}}
Base branch: {{pull_request.base.ref}}
Head branch: {{pull_request.head.ref}}

Full payload: {{body}}

Review this pull request. Use gh CLI to read the diff, analyze the changes,
and post a detailed inline review. Flag security issues, missing tests,
and breaking API changes.
```

> **Note:** The current Gateway prompt template only supports top-level `{{field}}` interpolation. Nested fields like `{{pull_request.title}}` require a small enhancement to the template renderer, or the agent can be instructed to parse `{{body}}` (the full JSON payload) directly.

---

## Required Gateway Enhancements

The following gaps must be addressed before this model is production-ready. All are small-scope fixes — they are wiring issues, not architectural rewrites.

```mermaid
gantt
    title Gateway Enhancements for GitHub Orchestration
    dateFormat  YYYY-MM-DD
    section Bug Fixes
    Fix notification event name mismatch (dots vs underscores)   :crit, fix1, 2026-04-01, 1d
    section Webhook Enhancements
    Capture webhook output + token usage in WebhookInvocation    :p0a, after fix1, 1d
    Add deliveryMode + deliveryTarget to Webhook model           :p0b, after p0a, 1d
    Add userId scoping to webhook sessions                       :p0c, after fix1, 1d
    Clickable session links in notification bell                 :p1a, after p0c, 1d
    section Routing
    Nested field interpolation in prompt templates               :p1b, after p0a, 1d
    Event-type filter on webhook (only fire on action=opened)    :p2a, after p1b, 2d
    section Session Management
    PR→session mapping in Gateway DB                             :p2b, after p0c, 2d
    Persistent session mode for webhooks                         :p2c, after p2b, 1d
```

| Priority | Enhancement | Effort | Blocks |
|---|---|---|---|
| **P0 — Bug** | Fix WebSocket notification event name mismatch (dots vs underscores) | 1 hour | All notifications |
| **P0** | Capture webhook output + token usage in `WebhookInvocation` | 3 hours | Observability, delivery |
| **P0** | Add `userId` scoping to webhook/cron sessions | 3 hours | Session discoverability |
| **P0** | Clickable session links in notification dropdown | 2 hours | HITL break-glass flow |
| **P1** | Nested field interpolation in prompt templates (`{{pull_request.title}}`) | 2 hours | Rich prompt context |
| **P1** | Webhook result delivery (add `deliveryMode`/`deliveryTarget` to Webhook model) | 4 hours | Agent-to-external delivery |
| **P2** | Event-type filter on webhook payload (only trigger on `action: "opened"`) | 1 day | Noise reduction |
| **P2** | PR→session mapping in Gateway DB | 1 day | Session continuity across events |
| **P2** | Persistent session mode for webhooks | 4 hours | Multi-turn PR conversations |

**Total estimated effort: ~3–4 days**

---

## Failure Modes and Recovery

```mermaid
flowchart TD
    GH[GitHub sends webhook] --> HMAC{HMAC\nvalid?}

    HMAC -->|No| Reject[403 Rejected\nlogged in Gateway audit]
    HMAC -->|Yes| GW_UP{Gateway\nreachable?}

    GW_UP -->|No - timeout or 5xx| GH_RETRY[GitHub retries\n3x with backoff]
    GH_RETRY -->|Still failing| GH_FAIL[Delivery marked failed\nvisible in repo Settings\nWebhooks → Recent Deliveries]
    GH_FAIL --> Manual_GH[Human redelivers\nfrom GitHub UI\nor GitHub API]

    GW_UP -->|Yes| Accepted[202 Accepted immediately\nprocessing begins async]
    Accepted --> COG_UP{Cognition\nServer up?}

    COG_UP -->|No| Invocation_Fail[WebhookInvocation\nstatus=error\nmessage stored]
    Invocation_Fail --> GW_Retry[Gateway cron sweep:\nquery failed invocations\nretry up to 3x]

    COG_UP -->|Yes| Stream{SSE stream\ncompletes?}
    Stream -->|Yes| Success[WebhookInvocation\nstatus=success\noutput stored\nnotification broadcast]
    Stream -->|No - agent error| Agent_Fail[WebhookInvocation\nstatus=error\nerror message stored]
    Agent_Fail --> GW_Retry

    GW_Retry -->|Max retries exceeded| Alert[Human sees\nfailed invocation\nin Gateway webhook history]
    Alert --> HITL[Human opens Gateway\nchat UI → resumes session\nor triggers manually]

    style Reject fill:#fee2e2
    style GH_FAIL fill:#fee2e2
    style Invocation_Fail fill:#fee2e2
    style Agent_Fail fill:#fee2e2
    style Success fill:#dcfce7
    style HITL fill:#fef9c3
    style Manual_GH fill:#fef9c3
```

**Reconciliation sweep (cron-based backfill):**

A Gateway cron job running every 15 minutes queries for open PRs/issues that should have received agent attention but have no linked session. This provides eventual consistency when webhook delivery fails:

```
Every 15 minutes:
  → gh issue list --label needs-triage --json number
  → For each issue with no agent comment in last 24h:
      → Trigger issue-triager agent
```

This is the **poll-based safety net** — real-time responsiveness from webhooks, reliability from polling.

---

## Pros and Cons

### Advantages

| Advantage | Why It Matters |
|---|---|
| **Centralized control plane** | All agent activity across all repos visible in one Gateway audit log and UI |
| **Human-in-the-loop native** | Gateway chat UI lets humans join, observe, and steer any agent session |
| **Full reasoning visibility** | Every tool call, planning step, and token visible — not just the final GitHub comment |
| **No per-repo workflow files** | Point GitHub webhooks at Gateway once per repo; no YAML maintenance |
| **Session continuity in Gateway DB** | PR→session mapping survives independent of PR body or labels |
| **Cron + webhook unified** | Scheduled sweeps and event-driven runs in the same system, same audit trail |
| **No Actions minutes consumed** | No cap on agent run duration; no monthly quota |
| **No cold start** | Immediate dispatch on webhook receipt; no runner boot time |
| **Centralized credential management** | GitHub PAT for `gh` CLI configured once on Cognition Server; not distributed across repos |
| **Model + agent control** | Change which agent handles PR reviews across all repos by editing one Gateway config |

### Disadvantages

| Disadvantage | Mitigation |
|---|---|
| **Infrastructure to own** | Gateway on k8s; requires uptime, monitoring, and maintenance |
| **Single point of failure** | Cron reconciliation sweep as fallback; GitHub stores undelivered webhooks for redelivery |
| **Coarser event filtering** | Implement event-type filter enhancement (P2 above) or create separate webhook per action type |
| **GitHub PAT management** | PAT on Cognition Server must be rotated; use GitHub App installation token for production |
| **Webhook gaps need fixing** | ~3–4 days of enhancement work before HITL model works end-to-end |
| **Not native to GitHub** | Agent activity appears in GitHub (comments, PRs) but the control plane is outside GitHub |

---

## Kubernetes Deployment

```mermaid
flowchart LR
    subgraph k8s_cluster ["k8s Cluster"]
        subgraph gateway_pod ["Gateway Pod"]
            GW_SERVER[Next.js + custom server.ts\nCron scheduler\nWebSocket server]
            GW_DB[(SQLite PVC\nor Postgres sidecar)]
        end

        subgraph cognition_pod ["Cognition Pod"]
            COG_SERVER[Cognition Server\nHTTP API + SSE]
            COG_AGENT[Agent runtime\nwith gh CLI\nwith GitHub PAT]
        end
    end

    subgraph ingress ["Ingress / Load Balancer"]
        ING[nginx / Traefik\nTLS termination]
    end

    Internet[GitHub Webhooks\nHuman Browser] --> ING
    ING -->|/api/hooks/*| GW_SERVER
    ING -->|/chat, /cron, /webhooks| GW_SERVER
    GW_SERVER <-->|internal| COG_SERVER
    GW_SERVER <--> GW_DB
```

**Minimal `docker-compose.yml` for local testing:**

```yaml
services:
  gateway:
    image: cognition-gateway:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: file:/data/gateway.db
    volumes:
      - gateway-data:/data
    depends_on:
      - cognition

  cognition:
    image: cognition:latest
    environment:
      GITHUB_TOKEN: ${GITHUB_PAT}  # for gh CLI inside agent
    expose:
      - "8000"

volumes:
  gateway-data:
```

---

## When to Use This Approach

**This is the right choice when:**

- You want a human to be able to monitor, intervene, and steer any agent run — across all repos — from a single UI
- You need cross-repo visibility and centralized audit logs
- You want to change agent behavior (model, system prompt, skills) without touching every repo
- You want the full reasoning trace (tool calls, planning steps), not just the agent's final GitHub comment
- Actions minutes are a constraint

**This is the wrong choice when:**

- You want agent activity to feel completely native to GitHub (Actions runs, repo-level logs)
- You are running in an environment where the Gateway cannot be reliably kept online
- You do not need HITL — fully autonomous workflows where GitHub output is sufficient

---

## Open Questions

1. **GitHub App vs. PAT**: The `gh` CLI on the Cognition Server needs a credential. A GitHub App installation token is more secure (fine-grained permissions, auto-rotates) but requires more setup. Is a PAT acceptable initially?

2. **Multi-repo webhook management**: Should each repo have its own Gateway webhook endpoint (e.g., `/api/hooks/myrepo-pr`), or should a single endpoint handle all repos and use `{{repository.full_name}}` to route to the right agent? The latter requires the event-type filter enhancement.

3. **PostgreSQL migration**: The Gateway DB is currently SQLite. For a production k8s deployment with potential failover, PostgreSQL is needed (Phase 4, pending). Is SQLite acceptable for the initial experiment?

4. **Session continuity across events**: For multi-event PR workflows (opened → comment → synchronize → approved), Gateway needs to map `{repo, pr_number} → session_id`. This mapping should live in the Gateway DB as a new `AgentContext` model. Worth adding before experimenting?

5. **Webhook output capture**: Currently, `WebhookInvocation` discards the agent's output. Without the P0 enhancement, you cannot see what the agent said from the Gateway UI. This should be considered a prerequisite for any real experiment.

---

## Related Discussion

See [Option A: GitHub Actions Direct to Cognition](./github-actions-direct-to-cognition.md) for the alternative where GitHub Actions serves as the orchestration layer with no Gateway involvement in the trigger path.

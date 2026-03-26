# Generic Integration + Digital Twin Design

Category: Architectural Change / Feature Design
Status: Updated for implementation
Related issues: #43, #44, #45, #46, #47, #48, #49, #50, #51

## Goal

Design Cognition Gateway so it can support repository-specific workflows like "work Cognition Gateway issues and open PRs" without baking GitHub-specific assumptions into the product core. The Gateway should remain generically useful for other vendors and webhook sources while allowing a bound execution environment to act as a digital twin for controlled agent execution.

This design covers two user goals:

1. Interactive issue work sessions where a human can discuss an issue with an agent and have it investigate or implement changes in the local twin environment.
2. Webhook-driven issue triage that can classify work, create or continue a session, and optionally proceed toward implementation and PR creation.

## Product framing

Cognition Gateway remains the control plane. Cognition remains the execution substrate. External platforms like GitHub, Jira, Slack, and custom vendor webhooks are contextual surfaces that trigger work, receive updates, and link back into the Gateway. The local repository plus its attached runtime environment is treated as a bound digital twin, not a product special case.

The key design principle is:

- generic orchestration primitives in Gateway
- vendor-specific adapters at the integration boundary
- workflow recipes on top of those primitives

This allows "GitHub issue to PR" to be implemented as one recipe while keeping the platform reusable for other systems.

## Current implementation status

The first platform slices are now in motion:

- `WorkspaceBinding` exists as a first-class model and UI surface
- `RuntimeBinding` exists as a first-class model and UI surface
- dispatch rules support `resourceType` and `runIntent`
- GitHub issue triage is available as a preset workflow seed
- issue-aware workbench context is visible in chat
- approvals show issue/workflow context in the queue

The current platform is still GitHub-first in workflow UX, but the core abstractions are being shaped to avoid GitHub-only or Docker Compose-only assumptions.

## Remaining generalization goals

The generalization pass should make sure that:

- the UI describes workspace/runtime bindings in vendor-neutral terms
- orchestration logic depends on resource, scope, and intent metadata rather than GitHub-specific conditionals where avoidable
- runtime bindings stay descriptive/policy-oriented rather than turning Gateway into an environment manager
- Docker Compose remains only the first runtime profile, not the core runtime abstraction
- a future second adapter (for example Jira or custom webhook resources) can be added without redesigning the same primitives again

## Architecture overview

The architecture splits into three layers:

### 1. Generic orchestration primitives

These are product-level concepts that should not mention GitHub directly:

- `Integration`: connection metadata, auth strategy, capabilities
- `NormalizedEvent`: generic inbound event model
- `DispatchRule`: matching + routing policy
- `ContextMapping`: session continuity for a resource over time
- `DispatchRun`: durable execution record
- `WorkspaceBinding`: maps an integration resource to code and execution context
- `RuntimeBinding`: describes how the digital twin is started, reached, and validated
- `RunIntent`: what kind of work is being requested (`triage`, `investigate`, `implement`, `review`, `notify`)
- `ApprovalPolicy`: what actions require human authorization

### 2. Vendor adapters

These normalize specific platforms into the generic model:

- GitHub adapter
- Jira adapter
- Slack adapter
- Custom webhook adapter

Each adapter is responsible for:

- auth strategy
- inbound event normalization
- context-key derivation
- outbound action support
- capability declarations

### 3. Workflow recipes

Recipes define automation behavior using the generic model. Examples:

- GitHub issue opened -> triage
- GitHub issue comment `/agent-fix` -> implementation session
- GitHub PR opened -> review
- Jira ticket escalated -> investigation
- vendor alert webhook -> summarize and route

## Core data model additions

### Integration

Add a first-class `Integration` model if not already present in durable form.

Suggested fields:

- `id`
- `type` (`github`, `jira`, `slack`, `custom_webhook`, ...)
- `name`
- `status`
- `authStrategy`
- `credentials` (encrypted)
- `capabilities` (json)
- `defaultApprovalMode`
- `createdByUserId`

### WorkspaceBinding

New model that maps an external resource scope to a source workspace.

Suggested fields:

- `id`
- `integrationId`
- `scopeType` (`repo`, `project`, `tenant`, `resource_prefix`)
- `scopeKey` (for example `CognicellAI/Cognition-Gateway`)
- `workspacePath`
- `repoRoot`
- `defaultBranch`
- `envProfile`
- `enabled`

This is the abstraction that tells Gateway where code lives without hardcoding a specific repo into the product.

### RuntimeBinding

New model that maps a workspace binding to a deployment/runtime strategy.

Suggested fields:

- `id`
- `workspaceBindingId`
- `runtimeType` (`docker_compose`, `kubernetes`, `http_only`, `shell`, `custom`)
- `connectionConfig` (json)
- `lifecyclePolicy` (json)
- `executionPolicy` (json)
- `capabilities` (json)
- `enabled`

The runtime binding is deliberately deployment-agnostic. Docker Compose is one adapter. Kubernetes should be able to use the same model later.

Examples:

- Docker Compose
  - compose file path
  - service names
  - local health endpoints
- Kubernetes
  - cluster/context reference
  - namespace
  - deployment/service names
  - ingress/base URLs
  - optional port-forward strategy

Workflows should depend on runtime capabilities, not Compose-specific semantics.

### NormalizedEvent shape

Introduce or formalize a generic normalized event contract:

- `integrationType`
- `eventType`
- `action`
- `resourceType`
- `resourceId`
- `resourceTitle`
- `scopeKey`
- `actor`
- `url`
- `rawBody`

Examples:

- GitHub issue opened
- GitHub PR synchronized
- Jira issue updated
- custom vendor incident created

### RunIntent

Formalize a small enum/field for the intent of a run:

- `triage`
- `investigate`
- `implement`
- `review`
- `notify`

This keeps rules generic and useful across vendors.

## Session continuity model

The Gateway should continue to use resource-level context keys to keep related events in one Cognition session. The format should be generic but adapter-specific in composition.

Examples:

- `github:CognicellAI/Cognition-Gateway:issue:123`
- `github:CognicellAI/Cognition-Gateway:pull_request:42`
- `jira:PROJ:INC-17`
- `vendorx:tenant-a:incident:999`

This allows:

- repeated webhook events to continue the same work session
- humans to break glass into the same session from the Gateway chat UI
- audit continuity across triage, implementation, and review phases

## GitHub-specific recipe: issue to PR

This is a recipe on top of the generic layer, not a core engine concept.

### Phase A: issue triage

Trigger:

- `issues.opened`

Behavior:

- normalize the event
- derive `scopeKey` from repo + issue number
- bind to workspace and runtime using `WorkspaceBinding` + `RuntimeBinding`
- start or continue a session with run intent `triage`
- provide issue metadata to the agent
- agent classifies the issue and suggests next steps
- optionally comment on GitHub with the triage result

Recommended policy:

- triage can be automatic
- outbound GitHub comment can be configurable or approval-gated

### Phase B: interactive issue workbench

Trigger:

- human opens the linked Gateway chat session
- or label/comment command initiates implementation

Behavior:

- session already contains issue context
- agent works inside the mapped workspace and bound execution environment
- user can inspect runtime activity, steer, approve, or reject actions

### Phase C: implementation and PR creation

Suggested trigger policy:

- label-gated (`agent:implement`)
- or comment-gated (`/agent-fix`)
- plus explicit Gateway approval before commit/PR creation

Behavior:

- agent reproduces the issue in the bound digital twin environment
- applies code changes in the mapped workspace
- runs validation
- creates branch/commit
- opens PR using `gh`

## Interactive issue workbench UX

The Gateway chat session should become the control surface for issue work.

Suggested session header additions:

- external resource badge (for example `GitHub issue #123`)
- repo / workspace binding indicator
- current run intent (`triage`, `implement`, `review`)
- quick links:
  - open in GitHub
  - open related PR
  - open Activity entry

Recommended controls:

- `Post triage comment`
- `Start implementation`
- `Approve commit + PR`
- `Mark blocked`

This keeps Gateway aligned with the accepted architecture: external platforms trigger work, but deep supervision happens in Gateway.

## Digital twin model

Treat the digital twin as two linked concepts:

- `WorkspaceBinding` = where the code lives
- `RuntimeBinding` = how the environment is started, reached, and validated

For the Cognition Gateway repo, an example binding would be:

### Example: local Docker Compose

- integration type: `github`
- scope key: `CognicellAI/Cognition-Gateway`
- workspace path: `/Users/dubh3124/workspace/cognition-ui`
- runtime type: `docker_compose`
- connection config:
  - compose file: `docker-compose.dev.yml`
  - primary services: `gateway`, `cognition`
  - health checks: `/health`, `/api/setup`

### Example: future Kubernetes deployment

- integration type: `github`
- scope key: `CognicellAI/Cognition-Gateway`
- workspace path: `/workspace/cognition-ui`
- runtime type: `kubernetes`
- connection config:
  - cluster/context reference
  - namespace: `cognition-gateway-dev`
  - service/deployment names
  - ingress/base URL
  - health endpoints

The important design point is that the same workflow recipe should work across both environments by requesting capabilities like `healthcheck`, `logs`, `restart`, or `exec` instead of hardcoding Docker Compose commands.

## Runtime capability model

Each runtime binding should declare what it supports.

Suggested capabilities:

- `healthcheck`
- `logs`
- `start`
- `stop`
- `restart`
- `exec`
- `portForward`
- `applyConfig`

Examples:

- a local Compose twin may support all of them
- a shared Kubernetes environment may support `healthcheck`, `logs`, and `restart`, but not unrestricted `exec`

This keeps the Gateway generic and allows policy to differ by environment.

## Approval model

Recommended governance defaults:

- auto-triage allowed
- implementation entry requires label/comment or explicit user action
- code-changing actions require Gateway approval
- commit/PR creation requires Gateway approval
- destructive shell operations blocked by policy unless explicitly approved

This preserves Gateway's control-plane identity and prevents automation from skipping supervision.

## Runtime and audit surfaces

To make issue work trustworthy, Gateway should preserve structured execution history in the session and activity log.

Required surfaces:

- chat execution log per assistant turn
- task canvas for live runtime context
- activity feed across sessions and runs

For issue workflows, the execution log should capture:

- tool calls/results
- delegation/subagent activity
- GitHub actions taken (comment, label, branch, PR)
- validation/test outcomes

## Suggested implementation slices

### Slice 1: workspace + runtime bindings

- add `WorkspaceBinding` model
- add `RuntimeBinding` model
- add UI/API to define both bindings
- map GitHub repo -> local workspace + runtime adapter config

### Slice 2: generic normalized event model

- formalize adapter output shape
- update GitHub integration to emit generic event metadata
- persist resource and intent metadata on `DispatchRun`

### Slice 3: issue triage recipe

- add `issues.opened -> triage` rule preset
- seed issue context into a reusable session
- add optional GitHub comment posting policy

### Slice 4: issue workbench UX

- issue-aware chat header
- issue metadata cards
- actions for implementation and PR creation

### Slice 5: implementation gate + PR flow

- label/comment/approval entry into implementation
- branch/commit/PR actions via GitHub auth
- PR creation UX and audit trail

### Slice 6: runtime + adapter generalization

- add second adapter or custom webhook path using the same primitives
- validate that the same workflow can target both a Compose twin and a non-Compose runtime binding
- verify the design remains generic and not GitHub-locked or Compose-locked

## Recommended default policy

For Cognition Gateway's own repo, the best near-term model is:

- `issues.opened` -> auto-triage
- `issue_comment` command or label -> start implementation
- Gateway approval before commit/PR
- same issue key always maps to same session

This gives you strong automation with human supervision, and the same engine remains reusable for other platforms.

## Open questions

Before implementation, these product choices should be decided:

1. Should implementation ever start automatically after triage, or always require label/comment/approval?
2. Should outbound GitHub comments be automatic or approval-gated by default?
3. Should workspace bindings be per repo, per integration, or allow path globbing/prefix matching?
4. Should GitHub-specific recipes ship as built-in presets or user-authored templates?
5. Should the first version support only GitHub App auth, or also personal tokens for dev mode?

## Recommendation

Proceed with a generic workspace-binding + runtime-binding + integration-adapter architecture. Implement GitHub issue triage + PR creation as the first fully-realized recipe on top of that model, using Docker Compose as the first runtime adapter and leaving Kubernetes as a first-class future adapter under the same abstraction.

This gives you the repo-specific power you want without turning Gateway into a GitHub-only product.

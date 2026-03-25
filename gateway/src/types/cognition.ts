// Cognition server API types — sourced from cognition/server/app/models.py
// and cognition/server/app/api/models.py

export interface SessionSummary {
  id: string;
  title: string | null;
  thread_id: string;
  status: "active" | "inactive" | "error" | "waiting_for_approval";
  created_at: string;
  updated_at: string;
  message_count: number;
  agent_name: string;
}

export interface SessionList {
  sessions: SessionSummary[];
  total: number;
}

// v0.4.0: SessionConfig with provider_id for per-session provider selection
export interface SessionConfig {
  provider_id?: string | null; // reference to a ProviderConfig ID in the registry
  provider?: "openai" | "anthropic" | "bedrock" | "mock" | "openai_compatible" | "google_genai" | "google_vertexai" | null;
  model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  recursion_limit?: number | null;
  system_prompt?: string | null;
}

export interface SessionCreate {
  title?: string;
  agent_name?: string;
  config?: SessionConfig;
}

export interface SessionUpdate {
  title?: string;
  agent_name?: string;
  config?: SessionConfig;
}

export interface ToolCallResponse {
  name: string;
  args: Record<string, unknown>;
  id: string;
  output?: string;
  exit_code?: number;
}

export interface MessageResponse {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  parent_id: string | null;
  model: string | null;
  created_at: string;
  tool_calls: ToolCallResponse[] | null;
  tool_call_id: string | null;
  token_count: number | null;
  model_used: string | null;
  metadata: Record<string, unknown> | null;
}

export interface MessageList {
  messages: MessageResponse[];
  total: number;
  has_more: boolean;
}

export interface MessageCreate {
  content: string;
  parent_id?: string;
  model?: string;
  callback_url?: string;
}

export interface SessionResumeRequest {
  action: "approve" | "reject" | "edit";
  tool_call_id?: string;
  edited_args?: Record<string, unknown>;
  content?: string;
}

export interface AgentResponse {
  name: string;
  description: string | null;
  mode: "primary" | "subagent" | "all";
  hidden: boolean;
  native: boolean;
  model: string | null;
  temperature: number | null;
  tools: string[];
  skills: string[];
  system_prompt: string | null;
}

export interface AgentList {
  agents: AgentResponse[];
}

// v0.4.0: enriched ModelInfo from models.dev catalog
export interface ModelInfo {
  id: string;
  provider: string;
  display_name: string | null;
  context_window: number | null;
  output_limit: number | null;
  capabilities: string[]; // "tool_call" | "reasoning" | "vision" | "structured_output" | ...
  input_cost: number | null; // USD per million tokens
  output_cost: number | null; // USD per million tokens
  modalities: Record<string, string[]> | null; // e.g. { input: ["text","image"], output: ["text"] }
  family: string | null;
  status: string | null; // null = active, "deprecated", "beta"
}

export interface ModelList {
  models: ModelInfo[];
}

export interface CircuitBreakerStatus {
  provider: string;
  state: "closed" | "open" | "half_open";
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  consecutive_failures: number;
  last_failure_time: number | null;
}

export interface HealthStatus {
  status: "healthy" | "unhealthy";
  version: string;
  active_sessions: number;
  circuit_breakers: CircuitBreakerStatus[] | undefined;
  timestamp: string;
}

export interface ConfigResponse {
  server: {
    host: string;
    port: number;
    log_level: string;
    max_sessions: number;
    session_timeout_seconds: number;
    scoping_enabled: boolean;
  };
  llm: {
    provider: string;
    model: string;
    temperature: number | null;
    max_tokens: number | null;
    available_providers: Array<{ id: string; name: string; models: string[] }>;
  };
  rate_limit: {
    per_minute: number;
    burst: number;
  };
}

export interface ConfigUpdateRequest {
  llm?: Partial<{ temperature: number; max_tokens: number; model: string; provider: string }>;
  agent?: Partial<{
    memory: string[];
    skills: string[];
    interrupt_on: Record<string, boolean>;
    subagents: unknown[];
  }>;
  rate_limit?: Partial<{ per_minute: number; burst: number }>;
  observability?: Partial<{ otel_enabled: boolean; metrics_port: number; otel_endpoint: string }>;
  mlflow?: Partial<{ enabled: boolean; experiment_name: string }>;
}

// SSE event types streamed from POST /sessions/{id}/messages
export type CognitionSSEEvent =
  | { event: "token"; data: { content: string } }
  | { event: "tool_call"; data: { name: string; args: Record<string, unknown>; id: string } }
  | { event: "tool_result"; data: { tool_call_id: string; output: string; exit_code: number } }
  | { event: "planning"; data: { todos: Array<{ content: string; status: string }> } }
  | { event: "step_complete"; data: { step_number: number; total_steps: number; description: string } }
  | {
      event: "interrupt";
      data: {
        session_id?: string;
        tool_call_id?: string;
        tool_name?: string;
        args?: Record<string, unknown>;
        reason?: string;
        message?: string;
      };
    }
  | { event: "status"; data: { status: string } }
  | { event: "usage"; data: { input_tokens: number; output_tokens: number; estimated_cost: number; provider?: string; model?: string } }
  | { event: "delegation"; data: { from_agent: string; to_agent: string; task: string } }
  | { event: "error"; data: { message: string; code?: string } }
  | { event: "done"; data: { assistant_data?: AssistantData; message_id?: string } }
  | { event: "reconnected"; data: { last_event_id: string; resumed: boolean } };

export interface AssistantData {
  content: string;
  tool_calls: ToolCallResponse[] | null;
  token_count: number;
  model_used: string | null;
  metadata: Record<string, unknown> | null;
}

export interface Todo {
  content: string;
  status: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  output?: string;
  exit_code?: number;
  streaming?: boolean;
  stepIndex?: number; // which plan step (0-indexed) this call belongs to
}

export interface InterruptState {
  toolCallId: string | null;
  toolName: string | null;
  args: Record<string, unknown> | null;
  reason: string | null;
  message: string | null;
}

export interface DelegationEvent {
  fromAgent: string;
  toAgent: string;
  task: string;
  createdAt: string;
}

export interface PersistedToolOutput {
  id: string;
  output?: string;
  exit_code?: number;
  result_summary?: string;
  display_name?: string;
}

export interface ExecutionLogMetadata {
  delegations?: DelegationEvent[];
  tool_outputs?: PersistedToolOutput[];
}

export interface ToolInfo {
  name: string;
  description: string | null;
  source: string | null;
  module: string | null;
  parameters: Record<string, unknown> | null;
}

export interface ToolList {
  tools: ToolInfo[];
}

export interface ToolError {
  tool: string;
  error: string;
}

export interface ToolErrorList {
  errors: ToolError[];
}

// ============================================================================
// Skills (Cognition v0.3.0+)
// ============================================================================

export interface SkillResponse {
  name: string;
  path: string;
  enabled: boolean;
  description: string | null;
  content: string | null; // Full SKILL.md content (YAML frontmatter + markdown body)
  scope: Record<string, string>;
  source: string; // "api" | "file" | "builtin"
}

export interface SkillList {
  skills: SkillResponse[];
  count: number;
}

export interface SkillCreate {
  name: string;
  path?: string;
  enabled?: boolean;
  description?: string;
  content?: string;
  scope?: Record<string, string>;
}

export interface SkillUpdate {
  path?: string;
  enabled?: boolean;
  description?: string;
  content?: string;
  scope?: Record<string, string>;
}

// ============================================================================
// Agents (Cognition v0.4.0 — matches AgentCreate/AgentUpdate exactly)
// ============================================================================

export interface AgentCreate {
  name: string;
  system_prompt?: string;
  description?: string;
  mode?: "primary" | "subagent" | "all";
  hidden?: boolean;
  tools?: string[];
  skills?: string[];
  memory?: string[];
  interrupt_on?: Record<string, boolean>;
  model?: string | null;
  temperature?: number | null;
  scope?: Record<string, string>;
}

export interface AgentUpdate {
  system_prompt?: string;
  description?: string;
  mode?: "primary" | "subagent" | "all";
  hidden?: boolean;
  tools?: string[];
  skills?: string[];
  memory?: string[];
  interrupt_on?: Record<string, boolean>;
  model?: string | null;
  temperature?: number | null;
}

// ============================================================================
// LLM Providers (Cognition v0.4.0 — matches ProviderCreate/ProviderResponse exactly)
// ============================================================================

export type ProviderType =
  | "openai"
  | "anthropic"
  | "bedrock"
  | "openai_compatible"
  | "google_genai"
  | "google_vertexai"
  | "mock";

export interface ProviderResponse {
  id: string;
  provider: ProviderType;
  model: string;
  display_name: string | null;
  enabled: boolean;
  priority: number;
  max_retries: number;
  api_key_env: string | null;
  base_url: string | null;
  region: string | null;
  role_arn: string | null;
  extra: Record<string, unknown>;
  scope: Record<string, string>;
  source: string; // "file" | "api"
}

export interface ProviderList {
  providers: ProviderResponse[];
  count: number;
}

export interface ProviderCreate {
  id: string;
  provider: ProviderType;
  model: string;
  display_name?: string;
  enabled?: boolean;
  priority?: number;
  max_retries?: number;
  api_key_env?: string;
  base_url?: string;
  region?: string;
  role_arn?: string;
  extra?: Record<string, unknown>;
  scope?: Record<string, string>;
}

export interface ProviderUpdate {
  model?: string;
  display_name?: string;
  enabled?: boolean;
  priority?: number;
  max_retries?: number;
  api_key_env?: string;
  base_url?: string;
  region?: string;
  role_arn?: string;
  extra?: Record<string, unknown>;
}

export interface ProviderTestResponse {
  success: boolean;
  provider: string;
  model: string;
  message: string;
  response_preview: string | null;
}

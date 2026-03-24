import { describe, expect, it } from "vitest";
import { handleWebhookInvocation, renderDispatchRuleTemplate, renderPromptTemplate } from "@/lib/gateway/webhooks";

describe("dispatch rule template rendering", () => {
  it("renders nested values from GitHub-style payloads", () => {
    const body = {
      action: "opened",
      repository: { full_name: "acme/repo" },
      pull_request: { number: 42, title: "Add feature" },
    };

    const prompt = renderDispatchRuleTemplate(
      "Repo {{repository.full_name}} PR #{{pull_request.number}} {{pull_request.title}} action {{action}} body {{body}}",
      body,
    );

    expect(prompt).toContain("Repo acme/repo");
    expect(prompt).toContain("PR #42");
    expect(prompt).toContain("Add feature");
    expect(prompt).toContain('"action": "opened"');
  });

  it("keeps legacy webhook template behavior for top-level fields", () => {
    const prompt = renderPromptTemplate("User {{user}} body {{body}}", {
      user: "alice",
      action: "opened",
    });

    expect(prompt).toContain("User alice");
    expect(prompt).toContain('"action": "opened"');
  });

  it("matches GitHub rules using the X-GitHub-Event header", async () => {
    const db = {
      webhook: {
        findUnique: async () => ({
          id: "wh-1",
          name: "GitHub webhook",
          path: "github-test",
          secret: null,
          agentName: "default",
          promptTemplate: "Fallback {{body}}",
          sessionMode: "ephemeral",
          approvalMode: "none",
          integrationType: "github",
          enabled: true,
        }),
      },
      dispatchRule: {
        findMany: async () => ([{
          id: "rule-1",
          name: "PR opened",
          integrationType: "github",
          eventType: "pull_request",
          actionFilter: "opened",
          agentName: "default",
          promptTemplate: "Rule {{body}}",
          contextKeyTemplate: null,
          approvalMode: "none",
        }]),
      },
      dispatchRun: {
        create: async () => ({ id: "run-1" }),
      },
    } as any;

    const result = await handleWebhookInvocation(
      "github-test",
      { action: "opened", pull_request: { number: 1 } },
      JSON.stringify({ action: "opened", pull_request: { number: 1 } }),
      null,
      "pull_request",
      null,
      {
        db,
        serverUrl: "http://cognition",
        broadcast: () => undefined,
        scopeUserId: "gateway-automation",
      },
    );

    expect(result.httpStatus).toBe(202);
  });

  it("returns accepted-without-dispatch when an integration webhook has no matching rule", async () => {
    const db = {
      webhook: {
        findUnique: async () => ({
          id: "wh-2",
          name: "GitHub webhook",
          path: "github-test",
          secret: null,
          agentName: "default",
          promptTemplate: "Fallback {{body}}",
          sessionMode: "ephemeral",
          approvalMode: "none",
          integrationType: "github",
          enabled: true,
        }),
      },
      dispatchRule: {
        findMany: async () => ([
          {
            id: "rule-2",
            name: "PR synchronize",
            integrationType: "github",
            eventType: "pull_request",
            actionFilter: "synchronize",
            agentName: "default",
            promptTemplate: "Rule {{body}}",
            contextKeyTemplate: null,
            approvalMode: "none",
          },
        ]),
      },
      dispatchRun: {
        create: async () => ({ id: "run-2" }),
        update: async () => undefined,
      },
    } as any;

    const result = await handleWebhookInvocation(
      "github-test",
      { action: "opened", pull_request: { number: 1 } },
      JSON.stringify({ action: "opened", pull_request: { number: 1 } }),
      null,
      "pull_request",
      null,
      {
        db,
        serverUrl: "http://cognition",
        broadcast: () => undefined,
        scopeUserId: "gateway-automation",
      },
    );

    expect(result.httpStatus).toBe(202);
    expect(result.message).toContain("no matching dispatch rule");
  });
});

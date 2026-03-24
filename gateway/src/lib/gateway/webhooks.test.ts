import { describe, expect, it } from "vitest";
import { renderDispatchRuleTemplate, renderPromptTemplate } from "@/lib/gateway/webhooks";

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
});

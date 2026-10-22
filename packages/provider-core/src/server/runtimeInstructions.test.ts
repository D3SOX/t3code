import { describe, expect, it } from "vite-plus/test";
import { buildRuntimeInstructions } from "./runtimeInstructions.ts";

describe("buildRuntimeInstructions", () => {
  it("requires task-related PRs and stack layers while excluding incidental maintenance", () => {
    const instructions = buildRuntimeInstructions({ harness: "Codex" });
    expect(instructions).toContain("When the t3-code MCP server exposes link_pull_request");
    expect(instructions).toContain("PRs implementing this thread's requested changes");
    expect(instructions).toContain(
      "PRs explicitly assigned to this thread for review or monitoring",
    );
    expect(instructions).toContain(
      "with the full PR URL immediately after creating a PR for this task",
    );
    expect(instructions).toContain("For a stack implementing this task, call it for every layer");
    expect(instructions).toContain(
      "call list_thread_pull_requests and link any missing PR that meets the criteria above",
    );
    expect(instructions).toContain(
      "Do not link PRs touched only for incidental maintenance, such as release-note metadata",
    );
  });
});

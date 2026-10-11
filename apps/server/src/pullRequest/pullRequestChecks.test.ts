import type { PullRequestCheck, PullRequestCheckStatus } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { dedupeChecks } from "./pullRequestChecks.ts";

function entry(
  name: string,
  status: PullRequestCheckStatus,
  extra: {
    readonly workflowName?: string | null;
    readonly at?: string | null;
    readonly active?: boolean;
  } = {},
): {
  readonly check: PullRequestCheck;
  readonly workflowName: string | null;
  readonly at: string | null;
  readonly active?: boolean;
} {
  return {
    check: { name, status, description: null, url: null },
    workflowName: extra.workflowName ?? null,
    at: extra.at ?? null,
    ...(extra.active === undefined ? {} : { active: extra.active }),
  };
}

describe("dedupeChecks", () => {
  it.each(["success", "failure"] as const)(
    "keeps a live older run beside the newest %s result",
    (status) => {
      const running = entry("ios", "pending", {
        workflowName: "CI",
        at: "2026-10-11T12:39:29Z",
        active: true,
      });
      const completed = entry("ios", status, { workflowName: "CI", at: "2026-10-11T12:39:44Z" });
      for (const entries of [
        [running, completed],
        [completed, running],
      ]) {
        expect(dedupeChecks(entries)).toEqual([completed.check, running.check]);
      }
      // A completed rerun still supersedes earlier completed results.
      expect(
        dedupeChecks([
          { ...running, active: false, check: { ...running.check, status: "failure" } },
          completed,
        ]),
      ).toEqual([completed.check]);
    },
  );

  it("keeps an unstarted live job pending beside a dated result", () => {
    const queued = entry("ios", "pending", { active: true });
    const completed = entry("ios", "success", { at: "2026-10-11T12:39:44Z" });
    expect(dedupeChecks([queued, completed]).map((check) => check.status)).toEqual([
      "success",
      "pending",
    ]);
  });

  it("keeps the newest run of a check the host listed twice", () => {
    const checks = dedupeChecks([
      entry("Prepare PR size config", "success", {
        workflowName: "PR Size",
        at: "2026-08-11T16:06:25Z",
      }),
      entry("Prepare PR size config", "pending", {
        workflowName: "PR Size",
        at: "2026-08-11T17:01:04Z",
      }),
    ]);

    expect(checks.map((check) => [check.name, check.status])).toEqual([
      ["Prepare PR size config", "pending"],
    ]);
  });

  it("holds a check at the place it first appeared, so a re-run does not reshuffle the list", () => {
    const checks = dedupeChecks([
      entry("lint", "success", { workflowName: "CI", at: "2026-08-11T16:00:00Z" }),
      entry("test", "success", { workflowName: "CI", at: "2026-08-11T16:00:00Z" }),
      entry("lint", "failure", { workflowName: "CI", at: "2026-08-11T18:00:00Z" }),
    ]);

    expect(checks.map((check) => [check.name, check.status])).toEqual([
      ["lint", "failure"],
      ["test", "success"],
    ]);
  });

  it("loses a run that never said when it happened to one that did, whichever came first", () => {
    const undated = dedupeChecks([
      entry("build", "success", { at: "2026-08-11T16:00:00Z" }),
      entry("build", "pending"),
    ]);
    const dated = dedupeChecks([
      entry("build", "pending"),
      entry("build", "success", { at: "2026-08-11T16:00:00Z" }),
    ]);

    expect([undated[0]?.status, dated[0]?.status]).toEqual(["success", "success"]);
  });

  it("takes the last copy when neither run is dated, which is how an update is listed", () => {
    const checks = dedupeChecks([entry("build", "pending"), entry("build", "failure")]);

    expect(checks.map((check) => check.status)).toEqual(["failure"]);
  });

  it("keeps two workflows that name a job the same thing, and says which is which", () => {
    const checks = dedupeChecks([
      entry("build", "success", { workflowName: "CI", at: "2026-08-11T16:00:00Z" }),
      entry("build", "failure", { workflowName: "Release", at: "2026-08-11T16:00:00Z" }),
    ]);

    expect(checks.map((check) => [check.name, check.status])).toEqual([
      ["CI / build", "success"],
      ["Release / build", "failure"],
    ]);
  });

  it("leaves a colliding check with no workflow of its own unqualified", () => {
    // An app-provided check run belongs to no workflow, which GitHub reports as an empty name.
    const checks = dedupeChecks([
      entry("build", "success", { workflowName: "", at: "2026-08-11T16:00:00Z" }),
      entry("build", "failure", { workflowName: "CI", at: "2026-08-11T16:00:00Z" }),
    ]);

    expect(checks.map((check) => check.name)).toEqual(["build", "CI / build"]);
  });
});

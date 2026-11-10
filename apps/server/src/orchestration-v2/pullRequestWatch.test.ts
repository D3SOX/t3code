import {
  type PullRequestCheck,
  PullRequestComment,
  ThreadPullRequestWatch,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";

import {
  PULL_REQUEST_WATCH_WAKE_LIMIT,
  evaluatePullRequestWatch as evaluate,
  pullRequestWatchMessage,
} from "./pullRequestWatch.ts";

// These cases read the head once or at one moment, so the no-checks notice never comes due.
const evaluatePullRequestWatch = (
  ...args: Parameters<typeof evaluate> extends [...infer Head, number] ? Head : never
) => evaluate(...args, 0);

const STARTED = "2026-10-02T12:00:00.000Z";

const watch = (overrides: Partial<ThreadPullRequestWatch> = {}): ThreadPullRequestWatch => ({
  startedAt: STARTED,
  headSha: null,
  failedChecks: [],
  passed: false,
  passedChecks: [],
  remarksThrough: STARTED,
  remarkIds: [],
  conflicting: false,
  wakes: 0,
  ...overrides,
});

const run = (id: number) => `https://github.com/o/r/actions/runs/${id}`;

const check = (name: string, status: PullRequestCheck["status"]): PullRequestCheck => ({
  name,
  status,
  description: null,
  url: `https://ci.example/${name}`,
});

type Detail = Parameters<typeof evaluatePullRequestWatch>[1];

const capabilities = (checksAlwaysReport: boolean): Detail["capabilities"] => ({
  diff: true,
  comment: true,
  actions: [],
  mergeMethods: [],
  search: false,
  review: { inlineComment: false, reply: false, resolve: false, verdicts: [] },
  reviewers: { request: false, listCandidates: false },
  checksAlwaysReport,
});

const detail = (overrides: Partial<Detail> = {}): Detail => ({
  capabilities: capabilities(true),
  headSha: "aaaaaaaaaa",
  checks: [check("lint", "success"), check("test", "pending")],
  mergeability: "mergeable",
  viewer: "agent-user",
  author: { login: "agent-user", name: null, avatarUrl: null },
  ...overrides,
});

const remark = (
  login: string,
  createdAt: string,
  body = "Please rename this.",
): PullRequestComment => ({
  id: `${login}-${createdAt}`,
  kind: "review-comment",
  author: { login, name: null, avatarUrl: null },
  body,
  createdAt,
  url: `https://github.com/o/r/pull/1#${login}`,
  path: "src/index.ts",
  reviewState: null,
});

const noRemarks: ReadonlyArray<PullRequestComment> = [];

describe("evaluatePullRequestWatch", () => {
  it("waits for workflow approval once, through reads that miss it, until the run finishes", () => {
    const bot = check("bot", "success");
    const approval = { ...check("CI", "action-required"), url: run(1) };
    const gated = detail({ checks: [bot, approval] });
    const first = evaluatePullRequestWatch(watch(), gated, noRemarks);
    assert.deepEqual(first.changes, [{ kind: "checks-awaiting-approval", checks: [approval] }]);

    // GitHub's approval read can answer empty while the rest of the checks read fine.
    const missing = evaluatePullRequestWatch(first.next, detail({ checks: [bot] }), noRemarks);
    assert.deepEqual(missing.changes, []);
    assert.isFalse(missing.next.passed);
    assert.deepEqual(evaluatePullRequestWatch(missing.next, gated, noRemarks).changes, []);
    const later = { ...check("Preview", "action-required"), url: run(2) };
    assert.deepEqual(
      evaluatePullRequestWatch(missing.next, detail({ checks: [bot, approval, later] }), noRemarks)
        .changes,
      [],
    );
    const unnamed = { ...check("Docs", "action-required"), url: null };
    const named = detail({ checks: [bot, unnamed] });
    const alone = evaluatePullRequestWatch(watch(), named, noRemarks);
    assert.deepEqual(alone.changes, [{ kind: "checks-awaiting-approval", checks: [unnamed] }]);
    const placeholder = { ...unnamed, name: "Workflow approval status", placeholder: true };
    const unlisted = evaluatePullRequestWatch(
      alone.next,
      detail({ checks: [bot, placeholder] }),
      noRemarks,
    );
    assert.deepEqual(unlisted.changes, []);
    assert.isFalse(unlisted.next.passed);
    assert.deepEqual(evaluatePullRequestWatch(unlisted.next, named, noRemarks).changes, []);
    const dropped = evaluatePullRequestWatch(alone.next, detail({ checks: [bot] }), noRemarks);
    assert.deepEqual(dropped.changes, []);
    assert.isFalse(dropped.next.passed);
    assert.deepEqual(dropped.next.awaitingApproval, [unnamed.name]);
    assert.deepEqual(evaluatePullRequestWatch(dropped.next, named, noRemarks).changes, []);
    const namedPending = evaluatePullRequestWatch(
      dropped.next,
      detail({
        checks: [
          { ...bot, required: true },
          { ...unnamed, status: "pending" },
        ],
      }),
      noRemarks,
    );
    assert.deepEqual(namedPending.changes, []);
    assert.isFalse(namedPending.next.passed);
    const namedDone = detail({ checks: [bot, { ...unnamed, status: "success" }] });
    const namedFinished = evaluatePullRequestWatch(namedPending.next, namedDone, noRemarks);
    assert.deepEqual(namedFinished.changes, [{ kind: "checks-passed", count: 2, required: false }]);
    assert.deepEqual(namedFinished.next.awaitingApproval, []);
    assert.deepEqual(
      evaluatePullRequestWatch(namedFinished.next, namedDone, noRemarks).changes,
      [],
    );
    const pushed = detail({ headSha: "bbbbbbbbbb", checks: [bot] });
    assert.deepEqual(evaluatePullRequestWatch(missing.next, pushed, noRemarks).changes, [
      { kind: "checks-passed", count: 1, required: false },
    ]);

    // Approved, the run's jobs carry their own names under the run's URL.
    const job = { ...check("lint", "success"), url: `${run(1)}/job/7` };
    const pending = { ...check("test", "pending"), url: `${run(1)}/job/8` };
    const required = { ...bot, required: true };
    const running = evaluatePullRequestWatch(
      missing.next,
      detail({ checks: [required, job, pending] }),
      noRemarks,
    );
    assert.deepEqual(running.changes, []);
    assert.isFalse(running.next.passed);
    assert.deepEqual(running.next.awaitingApproval, [run(1)]);
    const overlap = evaluatePullRequestWatch(
      running.next,
      detail({ checks: [required, job, { ...pending, url: `${run(2)}/job/9` }] }),
      noRemarks,
    );
    assert.deepEqual(overlap.changes, []);
    assert.isFalse(overlap.next.passed);
    assert.deepEqual(overlap.next.awaitingApproval, [run(1)]);
    const unlinked = evaluatePullRequestWatch(
      overlap.next,
      detail({ checks: [required, job, { ...pending, url: null }] }),
      noRemarks,
    );
    assert.deepEqual(unlinked.changes, []);
    assert.isFalse(unlinked.next.passed);
    assert.deepEqual(unlinked.next.awaitingApproval, [run(1)]);
    const advisory = evaluatePullRequestWatch(
      unlinked.next,
      detail({ checks: [required, job, { ...pending, url: "https://ci.example/test" }] }),
      noRemarks,
    );
    assert.deepEqual(advisory.changes, [{ kind: "checks-passed", count: 1, required: true }]);
    assert.deepEqual(advisory.next.awaitingApproval, []);
    const completed = detail({ checks: [required, job, { ...pending, status: "success" }] });
    const finished = evaluatePullRequestWatch(unlinked.next, completed, noRemarks);
    assert.deepEqual(finished.changes, [{ kind: "checks-passed", count: 1, required: true }]);
    assert.deepEqual(finished.next.awaitingApproval, []);
    assert.deepEqual(evaluatePullRequestWatch(finished.next, completed, noRemarks).changes, []);

    const done = evaluatePullRequestWatch(missing.next, detail({ checks: [bot, job] }), noRemarks);
    assert.deepEqual(done.changes, [{ kind: "checks-passed", count: 2, required: false }]);
  });

  it("does not pass or fail while the host cannot tell whether workflows await approval", () => {
    const bot = check("bot", "success");
    const unknown = {
      ...check("Workflow approval status", "action-required"),
      url: null,
      placeholder: true,
    };
    const unread = evaluatePullRequestWatch(watch(), detail({ checks: [bot, unknown] }), noRemarks);
    assert.deepEqual(unread.changes, []);
    assert.isFalse(unread.next.passed);
    const read = evaluatePullRequestWatch(unread.next, detail({ checks: [bot] }), noRemarks);
    assert.deepEqual(read.changes, [{ kind: "checks-passed", count: 1, required: false }]);
    const blocked = evaluatePullRequestWatch(
      read.next,
      detail({ checks: [{ ...bot, status: "pending" }, unknown] }),
      noRemarks,
    );
    assert.isFalse(blocked.next.passed);
    assert.deepEqual(
      evaluatePullRequestWatch(blocked.next, detail({ checks: [bot] }), noRemarks).changes,
      [{ kind: "checks-passed", count: 1, required: false }],
    );
  });

  it("wakes when remaining CI finishes after an earlier failure", () => {
    const running = detail({
      checks: [check("android (31, shard 8/8)", "failure"), check("android (36)", "pending")],
    });
    const early = evaluatePullRequestWatch(watch(), running, noRemarks);
    assert.deepEqual(early.changes, [{ kind: "checks-failed", failed: [running.checks[0]!] }]);
    const finished = detail({
      checks: [running.checks[0]!, check("android (36)", "success")],
    });
    const report = evaluatePullRequestWatch(early.next, finished, noRemarks);
    assert.deepEqual(report.changes, [
      { kind: "checks-completed", count: 2, failed: [running.checks[0]!] },
    ]);
    assert.deepEqual(evaluatePullRequestWatch(report.next, finished, noRemarks).changes, []);
  });

  it("deduplicates failed completion across empty reads, reruns, later checks, and pushes", () => {
    const failed = check("lint", "failure");
    const finished = detail({ checks: [failed, check("test", "success")] });
    const reported = evaluatePullRequestWatch(watch(), finished, noRemarks);
    assert.equal(reported.changes.length, 1);
    const unreadable = evaluatePullRequestWatch(reported.next, detail({ checks: [] }), noRemarks);
    assert.deepEqual(
      evaluatePullRequestWatch(
        unreadable.next,
        { ...finished, checks: finished.checks.toReversed() },
        noRemarks,
      ).changes,
      [],
    );
    const pending = evaluatePullRequestWatch(
      reported.next,
      detail({ checks: [failed, check("test", "pending")] }),
      noRemarks,
    );
    assert.deepEqual(pending.changes, []);
    assert.deepEqual(evaluatePullRequestWatch(pending.next, finished, noRemarks).changes, [
      { kind: "checks-completed", count: 2, failed: [failed] },
    ]);
    const late = evaluatePullRequestWatch(
      reported.next,
      detail({ checks: [...finished.checks, check("package", "success")] }),
      noRemarks,
    );
    assert.deepEqual(late.changes, [{ kind: "checks-completed", count: 3, failed: [failed] }]);
    const pushed = evaluatePullRequestWatch(
      reported.next,
      { ...finished, headSha: "bbbbbbbbbb" },
      noRemarks,
    );
    assert.deepEqual(pushed.changes, [{ kind: "checks-failed", failed: [failed] }]);
    assert.deepEqual(
      evaluatePullRequestWatch(pushed.next, { ...finished, headSha: "bbbbbbbbbb" }, noRemarks)
        .changes,
      [],
    );
  });

  it("wakes when remaining CI finishes after required checks passed", () => {
    const green = detail({
      checks: [{ ...check("lint", "success"), required: true }, check("iOS", "pending")],
    });
    const early = evaluatePullRequestWatch(watch(), green, noRemarks);
    const finished = evaluatePullRequestWatch(
      early.next,
      {
        ...green,
        checks: green.checks.map((check) => ({ ...check, status: "success" })),
      },
      noRemarks,
    );
    assert.deepEqual(finished.changes, [{ kind: "checks-passed", count: 2, required: false }]);
    assert.deepEqual(
      evaluatePullRequestWatch(
        finished.next,
        {
          ...green,
          checks: green.checks.map((check) => ({ ...check, status: "success" })),
        },
        noRemarks,
      ).changes,
      [],
    );
    const pushed = evaluatePullRequestWatch(
      finished.next,
      { ...green, headSha: "bbbbbbbbbb" },
      noRemarks,
    );
    assert.equal(pushed.changes.length, 1);
    assert.deepEqual(
      evaluatePullRequestWatch(
        pushed.next,
        {
          ...green,
          headSha: "bbbbbbbbbb",
          checks: green.checks.map((check) => ({ ...check, status: "success" })),
        },
        noRemarks,
      ).changes,
      [{ kind: "checks-passed", count: 2, required: false }],
    );
  });

  it("reports a fifth required aggregate even when it starts and finishes between sweeps", () => {
    const checks = [
      "Analyze (actions)",
      "Analyze (javascript-typescript)",
      "Release Note",
      "lint",
    ].map((name) => ({ ...check(name, "success"), required: true }));
    const early = evaluatePullRequestWatch(
      watch(),
      detail({ checks: [...checks, check("iOS", "pending")] }),
      noRemarks,
    );
    const late = detail({
      checks: [...checks, { ...check("e2e", "success"), required: true }, check("iOS", "pending")],
    });
    const aggregate = evaluatePullRequestWatch(early.next, late, noRemarks);
    assert.deepEqual(aggregate.changes, [{ kind: "checks-passed", count: 5, required: true }]);
    assert.deepEqual(evaluatePullRequestWatch(aggregate.next, late, noRemarks).changes, []);
  });

  it("keeps a missing required aggregate pending and wakes once it finishes", () => {
    const checks = [
      "Analyze (actions)",
      "Analyze (javascript-typescript)",
      "Release Note",
      "lint",
    ].map((name) => ({ ...check(name, "success"), required: true }));
    const pending = detail({ checks: [...checks, { ...check("e2e", "pending"), required: true }] });
    const waiting = evaluatePullRequestWatch(watch(), pending, noRemarks);
    assert.deepEqual(waiting.changes, []);
    const finished = evaluatePullRequestWatch(
      waiting.next,
      {
        ...pending,
        checks: pending.checks.map((check) => ({ ...check, status: "success" })),
      },
      noRemarks,
    );
    assert.deepEqual(finished.changes, [{ kind: "checks-passed", count: 5, required: true }]);
  });

  it("deduplicates reordered checks and reports a rerun or later completed check", () => {
    const green = detail({
      checks: [{ ...check("lint", "success"), required: true }, check("iOS", "success")],
    });
    const first = evaluatePullRequestWatch(watch(), green, noRemarks);
    assert.equal(first.changes.length, 1);
    assert.deepEqual(
      evaluatePullRequestWatch(
        first.next,
        { ...green, checks: green.checks.toReversed() },
        noRemarks,
      ).changes,
      [],
    );
    const unreadable = evaluatePullRequestWatch(first.next, detail({ checks: [] }), noRemarks);
    assert.deepEqual(evaluatePullRequestWatch(unreadable.next, green, noRemarks).changes, []);
    const rerun = evaluatePullRequestWatch(
      first.next,
      { ...green, checks: [green.checks[0]!, check("iOS", "pending")] },
      noRemarks,
    );
    assert.deepEqual(rerun.changes, []);
    assert.deepEqual(evaluatePullRequestWatch(rerun.next, green, noRemarks).changes, [
      { kind: "checks-passed", count: 2, required: false },
    ]);
    const late = evaluatePullRequestWatch(
      first.next,
      { ...green, checks: [...green.checks, check("performance", "success")] },
      noRemarks,
    );
    assert.deepEqual(late.changes, [{ kind: "checks-passed", count: 3, required: false }]);
  });

  it("reports each failure at once, even while another check never finishes", () => {
    const bot = check("CodeRabbit", "pending");
    const first = detail({ checks: [check("lint", "failure"), check("test", "pending"), bot] });
    const lint = evaluatePullRequestWatch(watch(), first, noRemarks);
    assert.deepEqual(lint.changes, [{ kind: "checks-failed", failed: [check("lint", "failure")] }]);
    assert.deepEqual(evaluatePullRequestWatch(lint.next, first, noRemarks).changes, []);

    const second = detail({ checks: [check("lint", "failure"), check("test", "failure"), bot] });
    const test = evaluatePullRequestWatch(lint.next, second, noRemarks);
    assert.deepEqual(test.changes, [{ kind: "checks-failed", failed: [check("test", "failure")] }]);

    const rerun = evaluatePullRequestWatch(test.next, first, noRemarks);
    assert.equal(evaluatePullRequestWatch(rerun.next, second, noRemarks).changes.length, 1);

    const pushed = detail({ ...second, headSha: "bbbbbbbbbb" });
    assert.equal(evaluatePullRequestWatch(test.next, pushed, noRemarks).changes.length, 1);

    const approval = { ...check("CI", "action-required"), url: run(1) };
    const gated = detail({ checks: [approval, check("lint", "failure")] });
    assert.deepEqual(evaluatePullRequestWatch(watch(), gated, noRemarks).changes, [
      { kind: "checks-failed", failed: [check("lint", "failure")] },
      { kind: "checks-awaiting-approval", checks: [approval] },
    ]);
  });

  it("reports passed once the required checks pass, whatever the others do", () => {
    const required = (name: string, status: PullRequestCheck["status"]) => ({
      ...check(name, status),
      required: true,
    });
    const green = detail({
      checks: [required("test", "success"), required("lint", "success"), check("bot", "pending")],
    });
    const passed = evaluatePullRequestWatch(watch(), green, noRemarks);
    assert.deepEqual(passed.changes, [{ kind: "checks-passed", count: 2, required: true }]);
    assert.deepEqual(evaluatePullRequestWatch(passed.next, green, noRemarks).changes, []);

    const plain = detail({ checks: [check("test", "success"), check("bot", "pending")] });
    assert.deepEqual(evaluatePullRequestWatch(watch(), plain, noRemarks).changes, []);
  });

  it("reports passed again when a required check shows up already passed", () => {
    const required = (name: string, status: PullRequestCheck["status"]) => ({
      ...check(name, status),
      required: true,
    });
    const tests = detail({
      checks: [required("Tests", "success"), check("Smoke Tests", "pending")],
    });
    const first = evaluatePullRequestWatch(watch(), tests, noRemarks);
    assert.deepEqual(first.changes, [{ kind: "checks-passed", count: 1, required: true }]);

    const gated = detail({
      checks: [
        required("Tests", "success"),
        check("Smoke Tests", "success"),
        required("Smoke Tests Gate", "success"),
      ],
    });
    const second = evaluatePullRequestWatch(first.next, gated, noRemarks);
    assert.deepEqual(second.changes, [{ kind: "checks-passed", count: 2, required: true }]);
    assert.deepEqual(evaluatePullRequestWatch(second.next, gated, noRemarks).changes, []);

    const pending = detail({
      checks: [required("Tests", "success"), required("Smoke Tests Gate", "pending")],
    });
    const waiting = evaluatePullRequestWatch(first.next, pending, noRemarks);
    assert.deepEqual(waiting.changes, []);
    assert.deepEqual(evaluatePullRequestWatch(waiting.next, gated, noRemarks).changes, [
      { kind: "checks-passed", count: 2, required: true },
    ]);
  });

  it("reports the expanded completed CI set once where none is required", () => {
    const first = evaluatePullRequestWatch(
      watch(),
      detail({ checks: [check("test", "success")] }),
      noRemarks,
    );
    assert.deepEqual(first.changes, [{ kind: "checks-passed", count: 1, required: false }]);
    const both = detail({ checks: [check("test", "success"), check("lint", "success")] });
    const expanded = evaluatePullRequestWatch(first.next, both, noRemarks);
    assert.deepEqual(expanded.changes, [{ kind: "checks-passed", count: 2, required: false }]);
    assert.deepEqual(evaluatePullRequestWatch(expanded.next, both, noRemarks).changes, []);
  });

  it("reports all CI once for a watch saved before completion sets were recorded", () => {
    const green = detail({ checks: [{ ...check("test", "success"), required: true }] });
    const told = watch({ headSha: "aaaaaaaaaa", passed: true });
    const saved = evaluatePullRequestWatch(told, green, noRemarks);
    assert.deepEqual(saved.changes, [{ kind: "checks-passed", count: 1, required: false }]);
    assert.deepEqual(evaluatePullRequestWatch(saved.next, green, noRemarks).changes, []);
    assert.deepEqual(saved.next.passedChecks, ["test"]);
  });

  it("keeps remarks for a later pass when the conversation was not read whole", () => {
    const comments = [remark("reviewer", "2026-10-02T12:06:00Z")];
    const partial = evaluatePullRequestWatch(watch(), detail(), null);
    assert.deepEqual(partial.changes, []);
    assert.equal(
      evaluatePullRequestWatch(partial.next, detail(), comments).changes[0]?.kind,
      "remarks",
    );
  });

  it("reports a remark that shows up late with the same time as a reported one", () => {
    const first = remark("reviewer", "2026-10-02T12:06:00Z");
    const late = { ...remark("bot", "2026-10-02T12:06:00Z"), id: "late" };
    const reported = evaluatePullRequestWatch(watch(), detail(), [first]);
    const again = evaluatePullRequestWatch(reported.next, detail(), [first, late]);
    assert.deepEqual(again.changes, [{ kind: "remarks", remarks: [late] }]);
    assert.deepEqual(again.next.remarkIds, [first.id, "late"]);
  });

  it("ignores edits after the watermark without spending the wake limit", () => {
    const old = remark("greptile[bot]", "2026-10-02T11:00:00Z");
    const watching = watch({
      headSha: "aaaaaaaaaa",
      remarkIds: [old.id],
      wakes: PULL_REQUEST_WATCH_WAKE_LIMIT - 1,
    });
    assert.deepEqual(evaluatePullRequestWatch(watching, detail(), [old]).changes, []);
    const edited = { ...old, editedAt: "2026-10-02T12:06:00Z" };
    const report = evaluatePullRequestWatch(watching, detail(), [edited]);
    assert.deepEqual(report.changes, []);
    assert.equal(report.next.remarksThrough, watching.remarksThrough);
    assert.deepEqual(report.next.remarkIds, [old.id]);
    assert.equal(report.next.wakes, watching.wakes);
    assert.isFalse(report.exhausted);
    assert.deepEqual(evaluatePullRequestWatch(report.next, detail(), [edited]).changes, []);
    const late = { ...remark("reviewer", "2026-10-02T12:06:00Z"), id: "late" };
    assert.deepEqual(evaluatePullRequestWatch(report.next, detail(), [edited, late]).changes, [
      { kind: "remarks", remarks: [late] },
    ]);
  });

  it("ignores repeated edits at the watermark and still reports newly posted remarks", () => {
    const seen = remark("ci-bot", "2026-10-10T19:52:40.000Z");
    const watching = watch({
      headSha: "aaaaaaaaaa",
      remarksThrough: seen.createdAt,
      remarkIds: [seen.id],
      wakes: 2,
    });
    assert.deepEqual(evaluatePullRequestWatch(watching, detail(), [seen]).changes, []);
    const edited = { ...seen, editedAt: "2026-10-10T20:04:50.000Z" };
    const first = evaluatePullRequestWatch(watching, detail(), [edited]);
    assert.deepEqual(first.changes, []);
    assert.strictEqual(first.next.remarksThrough, seen.createdAt);
    assert.deepEqual(evaluatePullRequestWatch(first.next, detail(), [edited]).changes, []);
    const again = { ...seen, editedAt: "2026-10-10T20:05:50.000Z" };
    const second = evaluatePullRequestWatch(first.next, detail(), [again]);
    assert.deepEqual(second.changes, []);
    assert.deepEqual(evaluatePullRequestWatch(second.next, detail(), [again]).changes, []);
    const own = { ...edited, author: { login: "agent-user", name: null, avatarUrl: null } };
    assert.deepEqual(evaluatePullRequestWatch(watching, detail(), [own]).changes, []);
    const posted = remark("reviewer", "2026-10-10T20:05:00.000Z");
    assert.deepEqual(evaluatePullRequestWatch(second.next, detail(), [again, posted]).changes, [
      { kind: "remarks", remarks: [posted] },
    ]);
  });

  it("ignores bot status chatter while retaining human comments and review findings", () => {
    const at = "2026-10-02T12:06:00Z";
    const statusBodies = [
      '<a href="https://app.coderabbit.ai/change-stack/123">View changes</a>',
      "## Codex Review Summary\nThis comment shows the latest Codex review activity.",
      "<details>\n<summary>Action performed</summary>Review requested.</details>",
      "<details><summary>Action not completed</summary>Try again later.</details>",
      "✅ Action performed\nReview requested.",
      "Your [plan](https://docs.coderabbit.ai/plans) has reached its rate limit.",
      "## Greptile Summary\nThis PR updates the sidebar.",
      "## Performance comparison\nResults for the latest commit.",
      "Review skipped: only documentation changed.",
      "[![Revix](https://revix.ai/badge/123)](https://revix.ai/reviews/123)",
      "![Revix](https://revix.ai/badge/123)",
      "**Actionable comments posted: 0**",
      "**Rate limit exceeded**\nTry again later.",
      "LGTM.",
    ] as const;
    const bot = { login: "review-bot", name: null, avatarUrl: null, isBot: true };
    const chatter = [
      ...statusBodies.map((body, index) => ({
        ...remark(bot.login, at, body),
        id: `status-${index}`,
        kind: "issue-comment" as const,
        path: null,
        author: bot,
      })),
      {
        ...remark("coderabbitai[bot]", at, statusBodies[5]),
        id: "suffix-status",
        kind: "issue-comment" as const,
        path: null,
      },
    ];
    const quiet = evaluatePullRequestWatch(
      watch({ headSha: "aaaaaaaaaa", wakes: 2 }),
      detail(),
      chatter,
    );
    assert.deepEqual(quiet.changes, []);
    assert.equal(quiet.next.remarksThrough, at);
    assert.equal(quiet.next.wakes, 2);
    assert.isFalse(quiet.exhausted);
    assert.deepEqual(
      evaluatePullRequestWatch(
        quiet.next,
        detail(),
        chatter.map((comment) => ({ ...comment, editedAt: "2026-10-02T12:07:00Z" })),
      ).changes,
      [],
    );

    const findings = [
      remark("reviewer", at, statusBodies[1]),
      {
        ...remark(bot.login, at, "**Actionable comments posted: 2**\nFix the null check."),
        author: bot,
        kind: "review" as const,
        path: null,
      },
      {
        ...remark(
          "chatgpt-codex-connector[bot]",
          at,
          "### 💡 Codex Review\nHere are some automated review suggestions.",
        ),
        kind: "issue-comment" as const,
        path: null,
      },
      {
        ...remark("reviewer", at, ""),
        id: "human-review",
        kind: "review" as const,
        path: null,
        reviewState: "APPROVED",
      },
      {
        ...remark(bot.login, at, "This dereferences a nullable value."),
        id: "inline-finding",
        author: bot,
      },
      {
        ...remark(
          bot.login,
          at,
          "[![Annotated bug](https://review.example/finding.png)](https://review.example/finding)",
        ),
        id: "image-finding",
        author: bot,
      },
      {
        ...remark(
          bot.login,
          at,
          "**Actionable comments posted: 0**\n<details><summary>Nitpick comments (1)</summary>Guard the null value.</details>",
        ),
        id: "non-inline-finding",
        kind: "review" as const,
        path: null,
        author: bot,
      },
    ];
    const report = evaluatePullRequestWatch(quiet.next, detail(), [...chatter, ...findings]);
    assert.deepEqual(report.changes, [{ kind: "remarks", remarks: findings }]);
    assert.deepEqual(
      evaluatePullRequestWatch(report.next, detail(), [...chatter, ...findings]).changes,
      [],
    );
  });

  it("does not treat a failed check read as a rerun", () => {
    const failed = detail({ checks: [check("lint", "failure")] });
    const reported = evaluatePullRequestWatch(watch(), failed, noRemarks);
    assert.equal(reported.changes.length, 1);
    const unreadable = evaluatePullRequestWatch(reported.next, detail({ checks: [] }), noRemarks);
    assert.deepEqual(evaluatePullRequestWatch(unreadable.next, failed, noRemarks).changes, []);
  });

  it("wakes for the pull request's author when the agent is someone else", () => {
    const contributor = detail({ author: { login: "contributor", name: null, avatarUrl: null } });
    const reply = remark("contributor", "2026-10-02T12:06:00Z");
    assert.deepEqual(evaluatePullRequestWatch(watch(), contributor, [reply]).changes, [
      { kind: "remarks", remarks: [reply] },
    ]);
    const noViewer = detail({ viewer: undefined, author: contributor.author });
    assert.deepEqual(evaluatePullRequestWatch(watch(), noViewer, [reply]).changes, []);
  });

  it("reports remarks from others once and never the agent's own", () => {
    const comments = [
      remark("agent-user", "2026-10-02T12:05:00Z", "Fixed in the latest push."),
      remark("macroscope-app[bot]", "2026-10-02T12:06:00Z"),
      remark("reviewer", "2026-10-02T11:00:00Z", "Older than the watch."),
    ];
    const report = evaluatePullRequestWatch(watch(), detail(), comments);
    assert.deepEqual(report.changes, [{ kind: "remarks", remarks: [comments[1]!] }]);
    assert.equal(report.next.remarksThrough, "2026-10-02T12:06:00Z");
    assert.deepEqual(evaluatePullRequestWatch(report.next, detail(), comments).changes, []);
  });

  it("cuts a long remark in the wake message without splitting an emoji", () => {
    const body = `${"x".repeat(196)}🚀 and more`;
    const report = evaluatePullRequestWatch(watch(), detail(), [
      remark("reviewer", "2026-10-02T12:06:00Z", body),
    ]);
    const { text } = pullRequestWatchMessage({
      host: "github",
      repository: "o/r",
      number: 1,
      url: "https://github.com/o/r/pull/1",
      baseBranch: "main",
      headSha: null,
      report,
    });
    assert.isTrue(text.isWellFormed());
    assert.include(text, `"${"x".repeat(196)}..."`);
  });

  it("reports a conflict once, until the branch is clean again", () => {
    const conflicting = detail({ mergeability: "conflicting" });
    const first = evaluatePullRequestWatch(watch(), conflicting, noRemarks);
    assert.deepEqual(first.changes, [{ kind: "conflicting" }]);
    const { headSha: _unreadHead, ...headUnread } = conflicting;
    const unread = evaluatePullRequestWatch(first.next, headUnread, noRemarks);
    assert.deepEqual(unread.changes, []);
    assert.deepEqual(evaluatePullRequestWatch(unread.next, conflicting, noRemarks).changes, []);
    const recomputing = evaluatePullRequestWatch(
      first.next,
      detail({ mergeability: "unknown" }),
      noRemarks,
    );
    assert.deepEqual(
      evaluatePullRequestWatch(recomputing.next, conflicting, noRemarks).changes,
      [],
    );
    const clean = evaluatePullRequestWatch(first.next, detail(), noRemarks);
    assert.deepEqual(evaluatePullRequestWatch(clean.next, conflicting, noRemarks).changes, [
      { kind: "conflicting" },
    ]);
    const pushed = { headSha: "bbbbbbbbbb" };
    const recomputed = evaluatePullRequestWatch(
      first.next,
      detail({ ...pushed, mergeability: "unknown" }),
      noRemarks,
    );
    assert.deepEqual(
      evaluatePullRequestWatch(
        recomputed.next,
        detail({ ...pushed, mergeability: "conflicting" }),
        noRemarks,
      ).changes,
      [{ kind: "conflicting" }],
    );
  });

  it("does not spend the comment wake limit on check results", () => {
    const tired = watch({ headSha: "aaaaaaaaaa", wakes: PULL_REQUEST_WATCH_WAKE_LIMIT - 1 });
    const result = evaluatePullRequestWatch(
      tired,
      detail({ checks: [check("lint", "failure")] }),
      noRemarks,
    );
    assert.isFalse(result.exhausted);
    assert.equal(result.next.wakes, 0);
  });

  it("stops after the wake limit unless the head moves", () => {
    const comments = [remark("reviewer", "2026-10-02T12:10:00Z")];
    const tired = watch({ headSha: "aaaaaaaaaa", wakes: PULL_REQUEST_WATCH_WAKE_LIMIT - 1 });
    assert.isTrue(evaluatePullRequestWatch(tired, detail(), comments).exhausted);
    const pushed = evaluatePullRequestWatch(tired, detail({ headSha: "cccccccccc" }), comments);
    assert.isFalse(pushed.exhausted);
    assert.equal(pushed.next.wakes, 1);
  });

  const anHourLater = (
    first: ThreadPullRequestWatch,
    read: Detail,
  ): ReadonlyArray<ReadonlyArray<string>> => {
    const kinds: Array<ReadonlyArray<string>> = [];
    let current = first;
    for (let minute = 0; minute <= 60; minute += 10) {
      const { changes, next } = evaluate(current, read, noRemarks, minute * 60_000);
      kinds.push(changes.map((change) => change.kind));
      current = next;
    }
    return kinds;
  };

  it("does not tell a watch saved before the no-checks clock that its seen head has none", () => {
    // Such a watch may have seen this head's checks pending, which records nothing.
    const legacy = watch({ headSha: "aaaaaaaaaa" });
    assert.isTrue(anHourLater(legacy, detail({ checks: [] })).every((kinds) => kinds.length === 0));
    const pushed = anHourLater(legacy, detail({ headSha: "bbbbbbbbbb", checks: [] }));
    assert.deepEqual(pushed.flat(), ["no-checks"]);
    const unknown = detail({
      checks: [{ ...check("Workflow approval status", "action-required"), placeholder: true }],
    });
    assert.deepEqual(anHourLater(watch(), unknown).flat(), []);
    const unread = evaluate(watch(), unknown, noRemarks, 0);
    assert.deepEqual(
      evaluate(unread.next, detail({ checks: [] }), noRemarks, 60 * 60_000).changes,
      [{ kind: "no-checks", minutes: 60 }],
    );
  });

  it("never reports missing checks on a host where an empty list says nothing", () => {
    const silent = detail({ capabilities: capabilities(false), checks: [] });
    assert.isTrue(anHourLater(watch(), silent).every((kinds) => kinds.length === 0));
  });
});

describe("pullRequestWatchMessage", () => {
  it("distinguishes finished CI with outstanding failures from passing CI", () => {
    const report = evaluatePullRequestWatch(
      watch({ headSha: "aaaaaaaaaa", failedChecks: ["lint"] }),
      detail({ checks: [check("lint", "failure"), check("test", "success")] }),
      noRemarks,
    );
    const message = pullRequestWatchMessage({
      host: "github.com",
      repository: "o/r",
      number: 12,
      url: "https://github.com/o/r/pull/12",
      baseBranch: "main",
      headSha: report.next.headSha,
      report,
    });
    assert.include(
      message.text,
      "All 2 checks finished on aaaaaaa; 1 check still needs attention:",
    );
    assert.include(message.text, "lint (failure) https://ci.example/lint");
    assert.equal(message.notification.outcome, "failed");
    assert.equal(message.notification.summary, "#12: checks finished with failures");
  });

  it("tells the agent what changed and marks failures for the timeline", () => {
    const report = evaluatePullRequestWatch(
      watch(),
      detail({ checks: [check("lint", "failure")] }),
      [remark("reviewer", "2026-10-02T12:10:00Z", "<!-- bot -->Needs a test.")],
    );
    const message = pullRequestWatchMessage({
      host: "github.com",
      repository: "o/r",
      number: 12,
      url: "https://github.com/o/r/pull/12",
      baseBranch: "main",
      headSha: report.next.headSha,
      report,
    });
    assert.include(message.text, "- Checks failed on aaaaaaa:\n  - lint https://ci.example/lint");
    assert.include(message.text, '  - reviewer on src/index.ts: "Needs a test."');
    assert.include(message.text, "unwatch_pull_request");
    assert.deepEqual(message.notification, {
      source: {
        kind: "monitor",
        pullRequest: {
          host: "github.com",
          repository: "o/r",
          number: 12,
          headSha: report.next.headSha,
        },
      },
      outcome: "failed",
      summary: "#12: checks failed, new comments",
    });
  });
});

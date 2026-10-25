import type {
  OrchestrationV2Notification,
  OrchestrationV2ConversationMessage,
  PullRequestCheck,
  PullRequestComment,
  PullRequestDetail,
  ThreadPullRequestWatch,
  ThreadPullRequestLink,
  ThreadPullRequestKey,
} from "@t3tools/contracts";
import { threadPullRequestKeysEqual } from "../sourceControl/threadPullRequests.ts";
import * as DateTime from "effect/DateTime";

/** Bounds consecutive comment-only wakes to stop bot reply loops; check, conflict, or push news resets it. */
export const PULL_REQUEST_WATCH_WAKE_LIMIT = 10;
/** How long a head may go without any check before the agent is told none reported. */
const PULL_REQUEST_WATCH_NO_CHECKS_MS = 15 * 60_000;
const LISTED_ITEMS = 10;
const SNIPPET_LENGTH = 200;

export type PullRequestWatchChange =
  | { readonly kind: "checks-failed"; readonly failed: ReadonlyArray<PullRequestCheck> }
  | { readonly kind: "checks-passed"; readonly count: number; readonly required: boolean }
  | {
      readonly kind: "checks-completed";
      readonly count: number;
      readonly failed: ReadonlyArray<PullRequestCheck>;
    }
  | { readonly kind: "remarks"; readonly remarks: ReadonlyArray<PullRequestComment> }
  | { readonly kind: "no-checks"; readonly minutes: number }
  | { readonly kind: "conflicting" };

export interface PullRequestWatchReport {
  /** What the agent has not been told yet. Empty means no wake. */
  readonly changes: ReadonlyArray<PullRequestWatchChange>;
  /** The watch to record, whether or not anything is reported. */
  readonly next: ThreadPullRequestWatch;
  /** This report spends the last wake before the limit, so watching stops after it. */
  readonly exhausted: boolean;
}

// action-required is a finished check needing human input.
const isFailedCheck = (check: PullRequestCheck) =>
  check.status === "failure" || check.status === "cancelled" || check.status === "action-required";

/** Report failures immediately, then required and remaining CI completion separately. Own replies never wake the agent; unread remarks wait for a later pass. */
export function evaluatePullRequestWatch(
  watch: ThreadPullRequestWatch,
  detail: Pick<
    PullRequestDetail,
    "capabilities" | "headSha" | "checks" | "mergeability" | "viewer" | "author"
  >,
  remarks: ReadonlyArray<PullRequestComment> | null,
  now: number,
): PullRequestWatchReport {
  const changes: Array<PullRequestWatchChange> = [];
  const headSha = detail.headSha ?? null;
  const headMoved = headSha !== watch.headSha;

  // Hosts can return no checks on read failure; preserve prior state.
  let failedChecks = headMoved ? [] : watch.failedChecks;
  let passed = headMoved ? false : watch.passed;
  let passedChecks = headMoved ? [] : watch.passedChecks;
  let allPassedChecks = headMoved ? [] : watch.allPassedChecks;
  let completedChecks = headMoved ? [] : watch.completedChecks;
  if (detail.checks.length > 0) {
    const failed = detail.checks.filter(isFailedCheck);
    const newlyFailed = failed.filter((check) => !failedChecks.includes(check.name));
    if (newlyFailed.length > 0) changes.push({ kind: "checks-failed", failed: newlyFailed });
    // A check that runs again leaves the list, so a rerun that fails again is reported.
    failedChecks = failed.map((check) => check.name);

    const required = detail.checks.filter((check) => check.required === true);
    const gate = required.length > 0 ? required : detail.checks;
    const passedNow = gate.every((check) => check.status !== "pending" && !isFailedCheck(check));
    const gateNames = gate.map((check) => check.name).sort();
    const gateChanged = passedChecks.length > 0 && gateNames.join("\n") !== passedChecks.join("\n");
    const reportGate = passedNow && (!passed || gateChanged);
    if (reportGate) {
      changes.push({ kind: "checks-passed", count: gate.length, required: required.length > 0 });
    }
    passed = passedNow;
    passedChecks = passedNow ? gateNames : [];
    const allPassedNow = detail.checks.every(
      (check) => check.status !== "pending" && !isFailedCheck(check),
    );
    const allNames = detail.checks.map((check) => check.name).sort();
    if (allPassedNow && allNames.join("\n") !== (allPassedChecks ?? []).join("\n") && !reportGate) {
      changes.push({ kind: "checks-passed", count: allNames.length, required: false });
    }
    allPassedChecks = allPassedNow ? allNames : [];
    const completed = detail.checks.every((check) => check.status !== "pending");
    // An early failure already woke the agent, but it may be waiting for the other jobs.
    // New failures and an all-pass result already produce their own wake on this pass.
    if (
      completed &&
      failed.length > 0 &&
      newlyFailed.length === 0 &&
      allNames.join("\n") !== (completedChecks ?? []).join("\n")
    ) {
      changes.push({ kind: "checks-completed", count: allNames.length, failed });
    }
    completedChecks = completed ? allNames : [];
  }

  // Only a head never read with checks waits for them: an empty read after checks were seen is
  // the failed read above. A watch saved before this field may have seen pending checks on its
  // head, so its clock starts only at the next push. Where a host's empty list can mean the
  // repository runs no checks at all, nothing waits.
  let checksAwaitedSince = watch.checksAwaitedSince;
  if (detail.capabilities.checksAlwaysReport === true) {
    const awaitedBefore = headMoved
      ? DateTime.formatIso(DateTime.makeUnsafe(now))
      : (watch.checksAwaitedSince ?? null);
    checksAwaitedSince = detail.checks.length > 0 ? null : awaitedBefore;
    const awaitedMs = checksAwaitedSince === null ? 0 : now - Date.parse(checksAwaitedSince);
    if (awaitedMs >= PULL_REQUEST_WATCH_NO_CHECKS_MS) {
      changes.push({ kind: "no-checks", minutes: Math.round(awaitedMs / 60_000) });
      checksAwaitedSince = null;
    }
  }

  const own = (detail.viewer ?? detail.author?.login)?.toLowerCase();
  const through = Date.parse(watch.remarksThrough);
  // An edit counts as new activity, so bots that rewrite one summary comment still wake the agent.
  const activeAt = (remark: PullRequestComment) => remark.editedAt ?? remark.createdAt;
  // Hosts can stamp remarks to the second, so remarks at the boundary time are told apart by ID.
  const fresh = (remarks ?? []).filter((remark) => {
    const at = Date.parse(activeAt(remark));
    return (
      (at > through || (at === through && !watch.remarkIds.includes(remark.id))) &&
      remark.author?.login.toLowerCase() !== own
    );
  });
  if (fresh.length > 0) changes.push({ kind: "remarks", remarks: fresh });
  const latest = Math.max(through, ...fresh.map((remark) => Date.parse(activeAt(remark))));
  const atLatest = fresh.filter((remark) => Date.parse(activeAt(remark)) === latest);
  const remarksThrough = latest === through ? watch.remarksThrough : activeAt(atLatest[0]!);
  const remarkIds = [
    ...(latest === through ? watch.remarkIds : []),
    ...atLatest.map((remark) => remark.id),
  ];

  if (detail.mergeability === "conflicting" && !watch.conflicting) {
    changes.push({ kind: "conflicting" });
  }
  // "unknown" is a host still computing after a push; only a clean answer clears a conflict.
  const conflicting =
    detail.mergeability === "unknown" ? watch.conflicting : detail.mergeability === "conflicting";

  const commentsOnly = changes.length > 0 && changes.every((change) => change.kind === "remarks");
  const progress = headMoved || (changes.length > 0 && !commentsOnly);
  const wakes = (progress ? 0 : watch.wakes) + (commentsOnly ? 1 : 0);
  return {
    changes,
    next: {
      startedAt: watch.startedAt,
      headSha,
      failedChecks,
      passed,
      passedChecks: passedChecks ?? [],
      ...(allPassedChecks === undefined ? {} : { allPassedChecks }),
      ...(completedChecks === undefined ? {} : { completedChecks }),
      remarksThrough,
      remarkIds,
      conflicting,
      wakes,
      checksAwaitedSince,
    },
    exhausted: commentsOnly && wakes >= PULL_REQUEST_WATCH_WAKE_LIMIT,
  };
}

function snippet(body: string): string {
  const text = body
    .replaceAll(/<!--[\s\S]*?-->/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  return text.length <= SNIPPET_LENGTH ? text : `${text.slice(0, SNIPPET_LENGTH - 3)}...`;
}

function listed<T>(items: ReadonlyArray<T>, line: (item: T) => string): Array<string> {
  const lines = items.slice(0, LISTED_ITEMS).map(line);
  if (items.length > LISTED_ITEMS) lines.push(`  - and ${items.length - LISTED_ITEMS} more`);
  return lines;
}

function changeLines(
  change: PullRequestWatchChange,
  context: { readonly baseBranch: string; readonly commit: string },
): Array<string> {
  switch (change.kind) {
    case "checks-failed":
      return [
        `- Checks failed${context.commit}:`,
        ...listed(
          change.failed,
          (check) =>
            `  - ${check.name}${check.status === "failure" ? "" : ` (${check.status})`}${check.url ? ` ${check.url}` : ""}`,
        ),
      ];
    case "checks-passed":
      return [
        `- All ${change.count} ${change.required ? "required " : ""}${change.count === 1 ? "check" : "checks"} passed${context.commit}.`,
      ];
    case "checks-completed":
      return [
        `- All ${change.count} ${change.count === 1 ? "check" : "checks"} finished${context.commit}; ${change.failed.length} ${change.failed.length === 1 ? "check still needs" : "checks still need"} attention:`,
        ...listed(
          change.failed,
          (check) => `  - ${check.name} (${check.status})${check.url ? ` ${check.url}` : ""}`,
        ),
      ];
    case "remarks":
      return [
        `- ${change.remarks.length} new ${change.remarks.length === 1 ? "comment" : "comments"}:`,
        ...listed(change.remarks, (remark) => {
          const where = remark.path === null ? "" : ` on ${remark.path}`;
          const body = snippet(remark.body);
          const said = body.length === 0 ? (remark.reviewState ?? "reviewed") : `"${body}"`;
          return `  - ${remark.author?.login ?? "someone"}${where}: ${said}${remark.url ? ` ${remark.url}` : ""}`;
        }),
      ];
    case "no-checks":
      return [
        `- No checks have reported${context.commit} after ${change.minutes} minutes. None may be configured to run on this change.`,
      ];
    case "conflicting":
      return [`- The branch now conflicts with ${context.baseBranch}.`];
  }
}

const SUMMARY: Record<PullRequestWatchChange["kind"], string> = {
  "checks-failed": "checks failed",
  "checks-passed": "checks passed",
  "checks-completed": "checks finished with failures",
  remarks: "new comments",
  "no-checks": "no checks reported",
  conflicting: "merge conflict",
};

/** The wake the agent reads and the timeline notification the user sees. */
export function pullRequestWatchMessage(
  input: ThreadPullRequestKey & {
    readonly url: string;
    readonly baseBranch: string;
    readonly headSha: string | null;
    readonly report: PullRequestWatchReport;
  },
): { readonly text: string; readonly notification: OrchestrationV2Notification } {
  const { changes, exhausted } = input.report;
  const context = {
    baseBranch: input.baseBranch,
    commit: input.headSha === null ? "" : ` on ${input.headSha.slice(0, 7)}`,
  };
  const text = [
    `Update on pull request #${input.number} (${input.url}), which T3 Code is watching for you:`,
    ...changes.flatMap((change) => changeLines(change, context)),
    "",
    exhausted
      ? `T3 Code stopped watching after ${PULL_REQUEST_WATCH_WAKE_LIMIT} comment-only updates in a row. Call watch_pull_request to watch it again.`
      : "Look into each item and act on it as your task requires. T3 Code keeps watching and wakes you on the next change, so end your turn when you are done. Keep watching while a running review blocks a pending push or review response; ending your turn to wait still needs automatic wakes. When the requested monitoring is complete or the user asks you to stop, call unwatch_pull_request so the thread returns to their inbox.",
  ].join("\n");
  const failed = changes.some(
    (change) =>
      change.kind === "checks-failed" ||
      change.kind === "checks-completed" ||
      change.kind === "conflicting",
  );
  const summary = changes.map((change) => SUMMARY[change.kind]);
  if (exhausted) summary.push("stopped watching");
  return {
    text,
    notification: {
      source: {
        kind: "monitor",
        pullRequest: {
          host: input.host,
          repository: input.repository,
          number: input.number,
          headSha: input.headSha,
        },
      },
      outcome: failed
        ? "failed"
        : changes.every((change) => change.kind === "checks-passed")
          ? "completed"
          : "updated",
      summary: `#${input.number}: ${summary.join(", ")}`,
    },
  };
}

/** Drop stale check news before delivery, retaining any comments bundled with it. */
export function refreshQueuedPullRequestMessage(
  message: OrchestrationV2ConversationMessage,
  link: Pick<ThreadPullRequestLink, "host" | "repository" | "number" | "url">,
  headSha: string | null,
): OrchestrationV2ConversationMessage | null {
  const notification = message.notification;
  if (notification?.source.kind !== "monitor" || headSha === null) return message;
  const observed = notification.source.pullRequest;
  if (observed !== undefined) {
    if (
      !threadPullRequestKeysEqual(observed, link) ||
      observed.headSha === null ||
      observed.headSha === headSha
    )
      return message;
  } else {
    // Released versions stored the PR identity and abbreviated commit only in the wake text.
    if (
      !message.id.startsWith("message:pr-watch:") ||
      !message.text.startsWith(
        `Update on pull request #${link.number} (${link.url}), which T3 Code is watching for you:\n`,
      )
    )
      return message;
    const commit = message.text.match(
      /^- (?:Checks failed|All \d+ (?:required )?checks? passed) on ([\da-f]+)[:.]$/m,
    )?.[1];
    if (commit === undefined || headSha.startsWith(commit)) return message;
  }

  const text = message.text.replace(
    /^- (?:Checks failed[^\n]*|All \d+ (?:required )?checks? (?:passed|finished)[^\n]*|The branch now conflicts[^\n]*)\n?(?:  - [^\n]*\n?)*/gm,
    "",
  );
  if (text === message.text) return message;
  if (!/^- \d+ new comments?:$/m.test(text)) return null;
  return {
    ...message,
    text,
    notification: {
      ...notification,
      outcome: "updated",
      summary: `#${link.number}: new comments${notification.summary.includes("stopped watching") ? ", stopped watching" : ""}`,
    },
  };
}

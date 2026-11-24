import type {
  OrchestrationV2Notification,
  OrchestrationV2ConversationMessage,
  PullRequestCheck,
  PullRequestComment,
  PullRequestDetail,
  PullRequestReaction,
  ThreadPullRequestWatch,
  ThreadPullRequestLink,
  ThreadPullRequestKey,
} from "@t3tools/contracts";
import { threadPullRequestKeysEqual } from "../sourceControl/threadPullRequests.ts";
import * as DateTime from "effect/DateTime";

/** Bounds consecutive comment-only wakes to stop bot reply loops; check, conflict, or push news resets it. */
export const PULL_REQUEST_WATCH_WAKE_LIMIT = 10;
/** How long a head may go without any check before the agent is told none reported. */
export const PULL_REQUEST_WATCH_NO_CHECKS_MS = 15 * 60_000;
const LISTED_ITEMS = 10;
const SNIPPET_LENGTH = 200;
const BOT_STATUS_PREFIXES = [
  '<a href="https://app.coderabbit.ai/change-stack/',
  "<a href='https://app.coderabbit.ai/change-stack/",
  "## codex review summary",
  "## greptile summary",
  "## performance comparison",
  "your [plan](https://docs.coderabbit",
  "**rate limit exceeded",
  "## rate limit exceeded",
];

function isActionableRemark(remark: PullRequestComment) {
  if (!(remark.author?.isBot ?? remark.author?.login.toLowerCase().endsWith("[bot]"))) return true;
  if (
    remark.kind === "review" &&
    (remark.reviewState === "APPROVED" || remark.reviewState === "CHANGES_REQUESTED")
  ) {
    return true;
  }
  const body = remark.body
    .replaceAll(/<!--[\s\S]*?-->/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const findings = body.match(/\*\*actionable comments posted:\s*(\d+)\*\*/);
  if (findings) {
    if (Number(findings[1]) > 0) return true;
    if (body === findings[0]) return false;
  }
  return (
    body.length > 0 &&
    !BOT_STATUS_PREFIXES.some((prefix) => body.startsWith(prefix)) &&
    !/^(?:<details>\s*<summary>\s*)?(?:✅\s*)?actions? (?:performed|not completed)\b/.test(body) &&
    !/^(?:\*\*)?review skipped\b/.test(body) &&
    !(body.includes("revix") && /^(?:\[)?!\[[^\]]*\]\([^)]*\)(?:\]\([^)]*\))?$/.test(body)) &&
    !/^(?:lgtm|looks good(?: to me)?|thanks|thank you)[.!]*$/.test(body)
  );
}

export type PullRequestWatchChange =
  | { readonly kind: "checks-failed"; readonly failed: ReadonlyArray<PullRequestCheck> }
  | { readonly kind: "checks-passed"; readonly count: number; readonly required: boolean }
  | {
      readonly kind: "checks-finished";
      readonly passed: number;
      readonly failing: ReadonlyArray<PullRequestCheck>;
    }
  | { readonly kind: "checks-awaiting-approval"; readonly checks: ReadonlyArray<PullRequestCheck> }
  | { readonly kind: "remarks"; readonly remarks: ReadonlyArray<PullRequestComment> }
  | { readonly kind: "reactions"; readonly reactions: ReadonlyArray<string> }
  | { readonly kind: "reviews-finished"; readonly checks: ReadonlyArray<PullRequestCheck> }
  | { readonly kind: "no-checks"; readonly minutes: number }
  | { readonly kind: "conflicting" }
  | { readonly kind: "needs-rebase" }
  | { readonly kind: "merge-queue-removed"; readonly reason: string | null };

export interface PullRequestWatchReport {
  /** What the agent has not been told yet. Empty means no wake. */
  readonly changes: ReadonlyArray<PullRequestWatchChange>;
  /** The watch to record, whether or not anything is reported. */
  readonly next: ThreadPullRequestWatch;
  /** This report spends the last wake before the limit, so watching stops after it. */
  readonly exhausted: boolean;
}

const isFailedCheck = (check: PullRequestCheck) =>
  check.status === "failure" || check.status === "cancelled";

// A GitHub Actions job's URL extends its workflow run's URL; their names need not match.
const workflowRunOf = (url: string | null) => url?.match(/^.*\/actions\/runs\/\d+/)?.[0] ?? null;
const approvalKey = (check: PullRequestCheck) => workflowRunOf(check.url) ?? check.name;
// Review bots (CodeRabbit, Greptile, cubic) finish a check even when they post no review.
const isFinishedReview = (check: PullRequestCheck) =>
  workflowRunOf(check.url) === null &&
  /review|coderabbit/i.test(check.name) &&
  (check.status === "success" || check.status === "skipped" || check.status === "neutral");
const reviewKey = (check: PullRequestCheck) => `${check.name}:${check.status}`;

/** Report failures immediately, then required and remaining CI completion separately. Own replies never wake the agent; unread remarks wait for a later pass. */
export function evaluatePullRequestWatch(
  watch: ThreadPullRequestWatch,
  detail: Pick<
    PullRequestDetail,
    | "capabilities"
    | "headSha"
    | "checks"
    | "mergeability"
    | "viewer"
    | "author"
    | "rebaseRequired"
    | "mergeQueueRemoval"
  >,
  remarks: ReadonlyArray<PullRequestComment> | null,
  now: number,
  /** Reactions on the description; null when this pass did not read them. */
  reactions: ReadonlyArray<PullRequestReaction> | null = null,
): PullRequestWatchReport {
  const changes: Array<PullRequestWatchChange> = [];
  // A read without a head says nothing about pushes, so it keeps the last known one.
  const headSha = detail.headSha ?? watch.headSha;
  const headMoved = watch.headSha !== null && headSha !== watch.headSha;
  const checksBaseline = watch.awaitingBaseline !== undefined && !headMoved;

  // Hosts can return no checks on read failure; preserve prior state.
  let failedChecks = headMoved ? [] : watch.failedChecks;
  let passed = headMoved ? false : watch.passed;
  let passedChecks = headMoved ? [] : watch.passedChecks;
  let allPassedChecks = headMoved ? [] : watch.allPassedChecks;
  let completedChecks = headMoved ? [] : watch.completedChecks;
  let owedChecks = headMoved ? [] : (watch.owedChecks ?? []);
  let awaitingApproval = headMoved ? [] : (watch.awaitingApproval ?? []);
  let approvalAnnounced = headMoved ? false : (watch.approvalAnnounced ?? false);
  // A watch with no answer (saved before the field, or since a push) waits only while the clock
  // below runs.
  let checksPending = headMoved ? false : (watch.checksPending ?? watch.checksAwaitedSince != null);
  // An unavailable approval read cannot establish success or that no checks exist.
  const checksUnread = detail.checks.some((check) => check.placeholder === true);
  const checks = detail.checks.filter((check) => check.placeholder !== true);
  const failed = checks.filter(isFailedCheck);
  const awaiting = checks.filter((check) => check.status === "action-required");
  const newlyFailed = failed.filter((check) => !failedChecks.includes(check.name));
  if (checks.length > 0) {
    // A run awaiting approval waits on a person, like a review, so only running checks count.
    // An unfinished baseline read keeps the seed below for the next one.
    checksPending =
      checks.some((check) => check.status === "pending") ||
      (checksBaseline && checksUnread && watch.checksPending === true);
    // The baseline hides failures from before the watch, but CI running at the start can fail
    // before the first read.
    if (newlyFailed.length > 0 && (!checksBaseline || watch.checksPending === true)) {
      changes.push({ kind: "checks-failed", failed: newlyFailed });
    }
    if (!approvalAnnounced && awaiting.length > 0) {
      if (!checksBaseline) changes.push({ kind: "checks-awaiting-approval", checks: awaiting });
      approvalAnnounced = true;
    }
    failedChecks = failed.map((check) => check.name);

    // Approval reads can omit gated runs. Keep each hold until its jobs finish.
    const awaitingNow = [...new Set(awaiting.map(approvalKey))];
    const nameUnfinished = (name: string) => {
      const matching = checks.filter((check) => check.name === name);
      return (
        matching.length === 0 ||
        matching.some((check) => check.status === "pending" || check.status === "action-required")
      );
    };
    // GitHub deduplicates jobs across runs, so a visible pending job may hide one in an awaited run.
    // A pending check without a URL could be such a job; one with another host's URL cannot.
    const jobsPending = checks.some(
      (check) =>
        check.status === "pending" && (check.url === null || workflowRunOf(check.url) !== null),
    );
    const finished = new Set(
      jobsPending
        ? []
        : checks
            .filter((check) => check.status !== "action-required" && check.status !== "pending")
            .map((check) => workflowRunOf(check.url)),
    );
    awaitingApproval = [
      ...awaitingNow,
      ...awaitingApproval.filter(
        (key) =>
          !awaitingNow.includes(key) &&
          (workflowRunOf(key) === key ? !finished.has(key) : nameUnfinished(key)),
      ),
    ];
  }
  const required = checks.filter((check) => check.required === true);
  const gate = required.length > 0 ? required : checks;
  const passedNow =
    awaitingApproval.length === 0 &&
    gate.every((check) => check.status !== "pending" && !isFailedCheck(check));
  if (checks.length > 0 && !(checksUnread && passedNow)) {
    const gateNames = gate.map((check) => check.name).sort();
    const gateChanged = passedChecks.length > 0 && gateNames.join("\n") !== passedChecks.join("\n");
    const reportGate = passedNow && (!passed || gateChanged);
    owedChecks =
      reportGate && required.length > 0
        ? checks
            .filter((check) => check.required !== true && check.status === "pending")
            .map((check) => check.name)
        : passedNow && passed
          ? checks
              .filter((check) => check.required !== true && owedChecks.includes(check.name))
              .map((check) => check.name)
          : [];
    const settled =
      failed.length === 0 &&
      awaitingApproval.length === 0 &&
      checks.every((check) => check.status !== "pending");
    // CI running at the start that has since settled green is news. The start rollup can be
    // pending only on optional checks, so a passed gate alone is not.
    if (reportGate && (!checksBaseline || (watch.checksPending === true && settled))) {
      changes.push({ kind: "checks-passed", count: gate.length, required: required.length > 0 });
    }
    passed = passedNow;
    passedChecks = passedNow ? gateNames : [];
    const allPassedNow =
      awaitingApproval.length === 0 &&
      checks.every(
        (check) =>
          check.status !== "pending" && check.status !== "action-required" && !isFailedCheck(check),
      );
    const allNames = checks.map((check) => check.name).sort();
    if (
      !checksBaseline &&
      allPassedNow &&
      allNames.join("\n") !== (allPassedChecks ?? []).join("\n") &&
      !reportGate
    ) {
      changes.push({ kind: "checks-passed", count: allNames.length, required: false });
    }
    allPassedChecks = allPassedNow ? allNames : [];
    if (allPassedNow) owedChecks = [];
    const completed =
      awaitingApproval.length === 0 &&
      checks.every((check) => check.status !== "pending" && check.status !== "action-required");
    // An early failure already woke the agent, but it may be waiting for the other jobs.
    // New failures and an all-pass result already produce their own wake on this pass.
    if (
      !checksBaseline &&
      !checksUnread &&
      completed &&
      failed.length > 0 &&
      newlyFailed.length === 0 &&
      allNames.join("\n") !== (completedChecks ?? []).join("\n")
    ) {
      changes.push({
        kind: "checks-finished",
        passed: checks.filter((check) => check.status === "success").length,
        failing: failed,
      });
    }
    if (!checksUnread || !completed) completedChecks = completed ? allNames : [];
  }

  // Only a head never read with checks waits for them; a legacy watch's clock starts at its next
  // push. CI can register late on any host, so every host waits, but running out of time is news
  // only where a host always reports checks: elsewhere an empty list can mean there are none.
  const awaitedBefore =
    headMoved || watch.awaitingBaseline === "all"
      ? DateTime.formatIso(DateTime.makeUnsafe(now))
      : (watch.checksAwaitedSince ?? null);
  let checksAwaitedSince = checks.length > 0 ? null : awaitedBefore;
  const awaitedMs = checksAwaitedSince === null ? 0 : now - Date.parse(checksAwaitedSince);
  if (!checksUnread && awaitedMs >= PULL_REQUEST_WATCH_NO_CHECKS_MS) {
    if (detail.capabilities.checksAlwaysReport === true) {
      changes.push({ kind: "no-checks", minutes: Math.round(awaitedMs / 60_000) });
    }
    checksAwaitedSince = null;
    checksPending = false;
  } else if (checksAwaitedSince !== null) {
    checksPending = true;
  }

  const own = (detail.viewer ?? detail.author?.login)?.toLowerCase();
  const through = Date.parse(watch.remarksThrough);
  // Hosts can stamp remarks to the second, so remarks at the boundary time are told apart by ID.
  const unread = (remarks ?? []).filter((remark) => {
    const at = Date.parse(remark.createdAt);
    return (
      (at > through || (at === through && !watch.remarkIds.includes(remark.id))) &&
      remark.author?.login.toLowerCase() !== own
    );
  });
  const fresh = unread.filter(isActionableRemark);
  if (fresh.length > 0) changes.push({ kind: "remarks", remarks: fresh });
  const latest = Math.max(through, ...unread.map((remark) => Date.parse(remark.createdAt)));
  const atLatest = unread.filter((remark) => Date.parse(remark.createdAt) === latest);
  const remarksThrough = latest === through ? watch.remarksThrough : atLatest[0]!.createdAt;
  const remarkIds = [
    ...(latest === through ? watch.remarkIds : []),
    ...atLatest.map((remark) => remark.id),
  ];

  // Some review bots (Codex) report a clean review only by reacting to the description. 👀 means
  // a review started, so only the reaction that replaces it is news.
  const reactionKeys = reactions?.flatMap((reaction) =>
    reaction.content === "eyes"
      ? []
      : reaction.actors
          .filter((actor) => actor.toLowerCase() !== own)
          .map((actor) => `${reaction.content}:${actor}`),
  );
  const toldReactions = watch.descriptionReactions;
  const newReactions =
    reactionKeys === undefined || toldReactions === undefined
      ? []
      : reactionKeys.filter((key) => !toldReactions.includes(key));
  if (newReactions.length > 0) changes.push({ kind: "reactions", reactions: newReactions });
  const descriptionReactions = reactionKeys ?? toldReactions;

  // Like a failed check, a conflict or rebase a push did not resolve is news for the new head.
  const toldConflict = !headMoved && watch.conflicting;
  if (watch.awaitingBaseline !== "all" && detail.mergeability === "conflicting" && !toldConflict) {
    changes.push({ kind: "conflicting" });
  }
  const toldRebase = !headMoved && watch.rebaseRequired === true;
  if (watch.awaitingBaseline !== "all" && detail.rebaseRequired === true && !toldRebase) {
    changes.push({ kind: "needs-rebase" });
  }
  const rebaseRequired = detail.rebaseRequired ?? watch.rebaseRequired;
  // "unknown" is a host still computing after a push; only a clean answer clears a conflict.
  const conflicting =
    detail.mergeability === "unknown" ? toldConflict : detail.mergeability === "conflicting";

  // The queue's checks run on a commit of its own, so its head can stay green after the queue
  // drops it. After the first read, IDs avoid comparing the server clock with the host clock.
  // The initial read uses whole seconds to exclude historical removals.
  const removal = detail.mergeQueueRemoval;
  if (
    removal !== undefined &&
    // Merging also records a removal, up to a second before the pull request reads as merged.
    removal.reason !== "merged" &&
    removal.id !== watch.mergeQueueRemovalId &&
    (watch.mergeQueueRemovalId !== undefined ||
      Date.parse(removal.removedAt) >= Math.floor(Date.parse(watch.startedAt) / 1000) * 1000)
  ) {
    changes.push({ kind: "merge-queue-removed", reason: removal.reason });
  }
  // Null records an empty baseline; historical IDs are saved without waking the watch.
  const mergeQueueRemovalId = removal?.id ?? watch.mergeQueueRemovalId ?? null;

  // Held while other checks run, so a review adds no wake of its own before CI is done.
  const reviews = checks.filter(isFinishedReview);
  const toldReviews = headMoved ? [] : (watch.finishedReviews ?? []);
  const newReviews = reviews.filter((check) => !toldReviews.includes(reviewKey(check)));
  const tellReviews =
    newReviews.length > 0 && !checksBaseline && (changes.length > 0 || !checksPending);
  if (tellReviews) changes.push({ kind: "reviews-finished", checks: newReviews });
  const finishedReviews =
    checksBaseline || tellReviews ? [...toldReviews, ...newReviews.map(reviewKey)] : toldReviews;

  const commentsOnly =
    changes.length > 0 &&
    changes.every((change) => change.kind === "remarks" || change.kind === "reactions");
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
      owedChecks,
      awaitingApproval,
      approvalAnnounced,
      ...(allPassedChecks === undefined ? {} : { allPassedChecks }),
      ...(completedChecks === undefined ? {} : { completedChecks }),
      remarksThrough,
      remarkIds,
      conflicting,
      rebaseRequired,
      mergeQueueRemovalId,
      finishedReviews,
      ...(descriptionReactions === undefined ? {} : { descriptionReactions }),
      wakes,
      // Only a read that cannot be trusted to show the checks leaves the baseline to the next one.
      ...(checksBaseline &&
        (checksUnread || (detail.headSha === undefined && checks.length === 0)) && {
          awaitingBaseline: "checks" as const,
        }),
      checksAwaitedSince,
      checksPending,
      ...(watch.until !== undefined && { until: watch.until }),
    },
    exhausted: commentsOnly && wakes >= PULL_REQUEST_WATCH_WAKE_LIMIT,
  };
}

// GitHub renders these, so in a remark's prose they are presentation, not what the reviewer said.
// Lowercase only: `Promise<T>` is a type argument.
const TAG_NAMES =
  "a|abbr|b|blockquote|br|caption|cite|code|dd|del|details|div|dl|dt|em|h[1-6]|hr|i|img|ins|kbd|li|mark|ol|p|picture|pre|q|s|samp|small|source|span|strike|strong|sub|summary|sup|table|tbody|td|tfoot|th|thead|tr|tt|ul|var";
// A code span comes first so its tags stay literal; it cannot cross a blank line. A tag stops at
// the next `<`, which keeps unclosed openers from rescanning the rest of the body.
const PROSE_MARKUP = new RegExp(
  "(?<!`)(?<ticks>`+)(?!`)(?:(?!\\n[ \\t\\r]*\\n)[\\s\\S])*?(?<!`)\\k<ticks>(?!`)" +
    `|<(?<closing>/?)(?<name>${TAG_NAMES})(?=[\\s/>])(?:[^<>"']|"[^"]*"|'[^']*')*>`,
  "g",
);

function withoutTags(prose: string): string {
  // An opener glued to an identifier is a type argument (`Vec<code>`); it and its closer stay.
  const kept = new Map<string, number>();
  let text = "";
  let from = 0;
  for (const match of prose.matchAll(PROSE_MARKUP)) {
    const name = match.groups?.name;
    if (name === undefined) continue;
    const held = kept.get(name) ?? 0;
    if (match.groups?.closing === "/") {
      if (held > 0) {
        kept.set(name, held - 1);
        continue;
      }
    } else if (/\w/.test(prose.charAt(match.index - 1))) {
      kept.set(name, held + 1);
      continue;
    }
    text += `${prose.slice(from, match.index)} `;
    from = match.index + match[0].length;
  }
  return text + prose.slice(from);
}

// Drops HTML tags from Markdown prose. Fenced and indented code blocks pass through untouched.
function withoutMarkup(body: string): string {
  const parts: Array<string> = [];
  let prose: Array<string> = [];
  let fence: string | undefined;
  let afterText = false;
  const code = (line: string) => {
    if (prose.length > 0) parts.push(withoutTags(prose.join("\n")));
    prose = [];
    parts.push(line);
    afterText = false;
  };
  for (const line of body.split("\n")) {
    if (fence !== undefined) {
      const closer = line.trim();
      if (closer.length >= fence.length && closer.replaceAll(fence.charAt(0), "") === "") {
        fence = undefined;
      }
      code(line);
      continue;
    }
    const opener = /^ {0,3}(`{3,}|~{3,})([\s\S]*)$/.exec(line);
    if (opener?.[1] !== undefined && !(opener[1].startsWith("`") && opener[2]?.includes("`"))) {
      fence = opener[1];
      code(line);
    } else if (!afterText && /^(?: {4}| {0,3}\t)\s*\S/.test(line)) {
      // Indented code needs a blank line before it; after text the indent is a continuation.
      code(line);
    } else {
      prose.push(line);
      afterText = line.trim() !== "";
    }
  }
  if (prose.length > 0) parts.push(withoutTags(prose.join("\n")));
  return parts.join("\n");
}

function snippet(body: string): string {
  const text = withoutMarkup(body.replaceAll(/<!--[\s\S]*?-->/g, " "))
    .replaceAll(/\s+/g, " ")
    .trim();
  if (text.length <= SNIPPET_LENGTH) return text;
  // Half an emoji serializes to a lone surrogate escape, which provider JSON parsers reject.
  const last = text.charCodeAt(SNIPPET_LENGTH - 4);
  const end = last >= 0xd800 && last <= 0xdbff ? SNIPPET_LENGTH - 4 : SNIPPET_LENGTH - 3;
  return `${text.slice(0, end)}...`;
}

function listed<T>(items: ReadonlyArray<T>, line: (item: T) => string): Array<string> {
  const lines = items.slice(0, LISTED_ITEMS).map(line);
  if (items.length > LISTED_ITEMS) lines.push(`  - and ${items.length - LISTED_ITEMS} more`);
  return lines;
}

const failedCheckLine = (check: PullRequestCheck) =>
  `  - ${check.name}${check.status === "failure" ? "" : ` (${check.status})`}${check.url ? ` ${check.url}` : ""}`;

function changeLines(
  change: PullRequestWatchChange,
  context: { readonly baseBranch: string; readonly commit: string },
): Array<string> {
  switch (change.kind) {
    case "checks-failed":
      return [`- Checks failed${context.commit}:`, ...listed(change.failed, failedCheckLine)];
    case "checks-finished":
      return [
        `- Every check has finished${context.commit}: ${change.passed} passed, ${change.failing.length} still failing:`,
        ...listed(change.failing, failedCheckLine),
      ];
    case "checks-awaiting-approval":
      return [
        `- Checks are waiting for approval or action from a maintainer${context.commit}:`,
        ...listed(change.checks, (check) => `  - ${check.name}${check.url ? ` ${check.url}` : ""}`),
      ];
    case "checks-passed":
      return [
        `- All ${change.count} ${change.required ? "required " : ""}${change.count === 1 ? "check" : "checks"} passed${context.commit}.`,
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
    case "reactions":
      return [
        `- New ${change.reactions.length === 1 ? "reaction" : "reactions"} on the description. A review bot can finish this way without posting a review or comment:`,
        ...listed(change.reactions, (key) => {
          const at = key.indexOf(":");
          return `  - ${key.slice(at + 1)}: ${key.slice(0, at)}`;
        }),
      ];
    case "reviews-finished":
      return [
        `- Review checks finished${context.commit}. A reviewer with nothing to add can finish without posting a review or comment:`,
        ...listed(
          change.checks,
          (check) =>
            `  - ${check.name} (${check.status})${check.description ? `: ${check.description}` : ""}${check.url ? ` ${check.url}` : ""}`,
        ),
      ];
    case "no-checks":
      return [
        `- No checks have reported${context.commit} after ${change.minutes} minutes. None may be configured to run on this change.`,
      ];
    case "needs-rebase":
      return [`- The branch requires a rebase onto ${context.baseBranch}.`];
    case "conflicting":
      return [`- The branch now conflicts with ${context.baseBranch}.`];
    case "merge-queue-removed":
      return [
        `- It was removed from the merge queue without merging${change.reason === null ? "" : `: ${change.reason}`}.`,
      ];
  }
}

const SUMMARY: Record<PullRequestWatchChange["kind"], string> = {
  "checks-failed": "checks failed",
  "checks-passed": "checks passed",
  "checks-finished": "checks finished",
  "checks-awaiting-approval": "checks await approval",
  remarks: "new comments",
  reactions: "new reactions",
  "reviews-finished": "reviews finished",
  "no-checks": "no checks reported",
  conflicting: "merge conflict",
  "needs-rebase": "rebase required",
  "merge-queue-removed": "removed from merge queue",
};

const WATCHING_CLOSING =
  "Look into each item and act on it as your task requires. This PR stays linked and watched, so do not link, watch, or list it again. Keep watching while a running review blocks a pending push or review response. End your turn when you are done, and T3 Code wakes you on the next change. When you hand the work back to the user, call unwatch_pull_request first so the thread returns to their inbox.";
const WATCHING_CLOSING_PLURAL =
  "Look into each item and act on it as your task requires. Each PR T3 Code still watches stays linked and watched, so do not link, watch, or list them again. Keep watching while a running review blocks a pending push or review response. End your turn when you are done, and T3 Code wakes you on the next change. When you hand the work back to the user, call unwatch_pull_request for each first so the thread returns to their inbox.";

export interface PullRequestWatchWake {
  readonly text: string;
  readonly notification: OrchestrationV2Notification;
}

/** One wake for news on several pull requests, with the closing instructions said once. */
export function combinePullRequestWatchWakes(
  wakes: readonly [PullRequestWatchWake, ...ReadonlyArray<PullRequestWatchWake>],
): PullRequestWatchWake {
  if (wakes.length === 1) return wakes[0];
  const closing = `\n\n${WATCHING_CLOSING}`;
  const watching = wakes.some((wake) => wake.text.endsWith(closing));
  const outcomes = wakes.map((wake) => wake.notification.outcome);
  return {
    text: [
      ...wakes.map((wake) =>
        wake.text.endsWith(closing) ? wake.text.slice(0, -closing.length) : wake.text,
      ),
      ...(watching ? [WATCHING_CLOSING_PLURAL] : []),
    ].join("\n\n"),
    notification: {
      source: { kind: "monitor" },
      outcome: outcomes.includes("failed")
        ? "failed"
        : outcomes.every((outcome) => outcome === "completed")
          ? "completed"
          : "updated",
      summary: wakes.map((wake) => wake.notification.summary).join("; "),
    },
  };
}

export function pullRequestWatchEndMessage(input: {
  readonly number: number;
  readonly url: string;
  readonly detail: Pick<PullRequestDetail, "state" | "baseBranch" | "mergeCommitSha" | "mergedBy">;
}): { readonly text: string; readonly notification: OrchestrationV2Notification } {
  const { detail } = input;
  const merged = detail.state === "merged";
  const how = merged
    ? [
        `was merged into ${detail.baseBranch}`,
        detail.mergedBy ? ` by ${detail.mergedBy.login}` : "",
        detail.mergeCommitSha ? ` as ${detail.mergeCommitSha.slice(0, 7)}` : "",
      ].join("")
    : "was closed without merging";
  return {
    text: [
      `Pull request #${input.number} (${input.url}) ${how}, so T3 Code stopped watching it.`,
      ...(merged ? [] : ["If it is reopened, call watch_pull_request to watch it again."]),
    ].join(" "),
    notification: {
      source: { kind: "monitor" },
      outcome: merged ? "completed" : "updated",
      summary: `#${input.number}: ${merged ? "merged" : "closed"}, stopped watching`,
    },
  };
}

export function pullRequestWatchMessage(
  input: ThreadPullRequestKey & {
    readonly number: number;
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
      : WATCHING_CLOSING,
  ].join("\n");
  const failed = changes.some(
    (change) =>
      change.kind === "checks-failed" ||
      change.kind === "checks-finished" ||
      change.kind === "conflicting" ||
      change.kind === "needs-rebase" ||
      change.kind === "merge-queue-removed",
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
          watchStartedAt: input.report.next.startedAt,
        },
      },
      outcome: failed
        ? "failed"
        : changes.every(
              (change) => change.kind === "checks-passed" || change.kind === "reviews-finished",
            )
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
  if (notification.source.otherPullRequests?.length) {
    const stamps = [notification.source.pullRequest!, ...notification.source.otherPullRequests];
    const refreshed = stamps.flatMap((stamp) => {
      if (stamp.section === undefined) return [stamp];
      const sectionMessage = {
        ...message,
        text: stamp.section.text,
        notification: {
          ...stamp.section,
          source: { kind: "monitor" as const, pullRequest: stamp },
        },
      };
      const section = refreshQueuedPullRequestMessage(sectionMessage, link, headSha);
      if (section === sectionMessage) return [stamp];
      if (section === null) return [];
      return [
        {
          ...stamp,
          headSha: null,
          section: {
            text: section.text,
            outcome: section.notification!.outcome,
            summary: section.notification!.summary,
          },
        },
      ];
    });
    if (
      refreshed.every((stamp, index) => stamp === stamps[index]) &&
      refreshed.length === stamps.length
    )
      return message;
    const [first, ...rest] = refreshed;
    if (first === undefined) return null;
    const wakeOf = (stamp: typeof first): PullRequestWatchWake => ({
      text: stamp.section!.text,
      notification: { ...stamp.section!, source: { kind: "monitor" } },
    });
    const wake = combinePullRequestWatchWakes([wakeOf(first), ...rest.map(wakeOf)]);
    return {
      ...message,
      text: wake.text,
      notification: {
        ...wake.notification,
        source: {
          kind: "monitor",
          pullRequest: first,
          ...(rest.length ? { otherPullRequests: rest } : {}),
        },
      },
    };
  }
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
      /^- (?:Checks failed|All \d+ (?:required )?checks? (?:passed|finished)) on ([\da-f]+)(?:[:.;]|$)/m,
    )?.[1];
    if (commit === undefined || headSha.startsWith(commit)) return message;
  }

  const text = message.text.replace(
    /^- (?:Checks failed[^\n]*|Review checks finished[^\n]*|Every check has finished[^\n]*|All \d+ (?:required )?checks? (?:passed|finished)[^\n]*|The branch now conflicts[^\n]*)\n?(?:  - [^\n]*\n?)*/gm,
    "",
  );
  if (!/^- \d+ new comments?:$/m.test(text)) return text === message.text ? message : null;
  return {
    ...message,
    text,
    notification: {
      ...notification,
      source: {
        ...notification.source,
        ...(observed === undefined ? {} : { pullRequest: { ...observed, headSha: null } }),
      },
      outcome: "updated",
      summary: `#${link.number}: new comments${notification.summary.includes("stopped watching") ? ", stopped watching" : ""}`,
    },
  };
}

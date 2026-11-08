import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import {
  PullRequestActor,
  PullRequestChecksState,
  PullRequestMergeability,
  PullRequestReviewDecision,
  PullRequestState,
} from "./pullRequest.ts";

/**
 * Legacy single-PR link. Still emitted as the thread's derived current pull
 * request (see `@t3tools/shared/threadPullRequests`) so clients from before
 * `pullRequests` keep working independently of their release schedule.
 */
export const ThreadLinkedPullRequest = Schema.Struct({
  projectId: ProjectId,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
  url: TrimmedNonEmptyString,
});
export type ThreadLinkedPullRequest = typeof ThreadLinkedPullRequest.Type;

/** stack-dismissed hides an unlinked native member and prevents sync from re-adding it. */
export const ThreadPullRequestLinkSource = Schema.Literals([
  "manual",
  "created",
  "agent",
  "stack",
  "stack-dismissed",
]);
export type ThreadPullRequestLinkSource = typeof ThreadPullRequestLinkSource.Type;

/**
 * Host state persisted on a link by the sync reactor; null until first sync. The overview
 * fields are optional: a host whose cheap read lacks them leaves them out, and snapshots
 * written before they existed still decode.
 */
export const ThreadPullRequestSnapshot = Schema.Struct({
  state: PullRequestState,
  title: TrimmedNonEmptyString,
  headBranch: TrimmedNonEmptyString,
  baseBranch: TrimmedNonEmptyString,
  isDraft: Schema.Boolean,
  updatedAt: Schema.NullOr(IsoDateTime),
  syncedAt: IsoDateTime,
  closedAt: Schema.optional(Schema.NullOr(Schema.String)),
  mergedAt: Schema.optional(Schema.NullOr(Schema.String)),
  author: Schema.optional(Schema.NullOr(PullRequestActor)),
  additions: Schema.optional(NonNegativeInt),
  deletions: Schema.optional(NonNegativeInt),
  changedFiles: Schema.optional(NonNegativeInt),
  reviewDecision: Schema.optional(Schema.NullOr(PullRequestReviewDecision)),
  checksState: Schema.optional(Schema.NullOr(PullRequestChecksState)),
  mergeability: Schema.optional(PullRequestMergeability),
});
export type ThreadPullRequestSnapshot = typeof ThreadPullRequestSnapshot.Type;

export const ThreadPullRequestStackLayer = Schema.Struct({
  number: PositiveInt,
  headBranch: TrimmedNonEmptyString,
  state: PullRequestState,
});
export type ThreadPullRequestStackLayer = typeof ThreadPullRequestStackLayer.Type;

/** A host-native stack the pull request belongs to. Layers run bottom to top. */
export const ThreadPullRequestStack = Schema.Struct({
  kind: Schema.Literal("native"),
  id: TrimmedNonEmptyString,
  number: PositiveInt,
  url: TrimmedNonEmptyString,
  base: TrimmedNonEmptyString,
  layers: Schema.Array(ThreadPullRequestStackLayer),
});
export type ThreadPullRequestStack = typeof ThreadPullRequestStack.Type;

/** Identity of a pull request as a thread link sees it: host-level, so the
 * same PR linked from two projects (or two environments) compares equal. */
export const ThreadPullRequestKey = Schema.Struct({
  host: TrimmedNonEmptyString,
  repository: TrimmedNonEmptyString,
  number: PositiveInt,
});
export type ThreadPullRequestKey = typeof ThreadPullRequestKey.Type;

/**
 * Present while the server watches the pull request for its thread. The server wakes the
 * thread's agent when checks finish on the head commit, someone else comments, or the branch
 * starts to conflict. The other fields record what the agent was last told, so each change is
 * reported once.
 */
export const ThreadPullRequestWatch = Schema.Struct({
  startedAt: IsoDateTime,
  /** Head commit at the last pass; null where the host does not report one. */
  headSha: Schema.NullOr(TrimmedNonEmptyString),
  /** Failed checks on that commit the agent was told about; a rerun that fails again is news. */
  failedChecks: Schema.Array(TrimmedNonEmptyString),
  /** The agent was told the required checks on that commit passed. */
  passed: Schema.Boolean,
  /**
   * Names in the passing gate on that commit, so a required check that first shows up already
   * passed is news. Empty on watches saved before this field existed.
   */
  passedChecks: Schema.Array(TrimmedNonEmptyString).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  /** All checks that passed, independently of the required gate. Empty while CI is pending. */
  allPassedChecks: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  /** All finished checks, including failures. Empty while any check is pending. */
  completedChecks: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  /** Remarks from others created up to this host time were reported. */
  remarksThrough: IsoDateTime,
  /** Reported remarks at remarksThrough, so late arrivals at that timestamp still count. */
  remarkIds: Schema.Array(TrimmedNonEmptyString),
  conflicting: Schema.Boolean,
  /** Consecutive comment-only wakes; limited to prevent bot loops. */
  wakes: NonNegativeInt,
  /**
   * When the head was first read without any check, until a check shows up or the agent is told
   * none did. Null once either happened; absent on watches saved before it existed.
   */
  checksAwaitedSince: Schema.optional(Schema.NullOr(IsoDateTime)),
});
export type ThreadPullRequestWatch = typeof ThreadPullRequestWatch.Type;

export const ThreadPullRequestLink = Schema.Struct({
  ...ThreadPullRequestKey.fields,
  url: TrimmedNonEmptyString,
  /** An actual browser or clone URL; older agent display URLs may be synthesized. */
  repositoryWebUrl: Schema.optional(TrimmedNonEmptyString),
  source: ThreadPullRequestLinkSource,
  linkedAt: IsoDateTime,
  snapshot: Schema.NullOr(ThreadPullRequestSnapshot),
  stack: Schema.NullOr(ThreadPullRequestStack),
  watch: Schema.optional(ThreadPullRequestWatch),
  /** Resume from the ended watch to avoid duplicate notifications. */
  endedWatch: Schema.optional(ThreadPullRequestWatch),
});
export type ThreadPullRequestLink = typeof ThreadPullRequestLink.Type;

import { CommandId, type ThreadId } from "@t3tools/contracts";
import { randomUuidV4 } from "@t3tools/provider-core/server/randomUuid";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as GitWorkflowService from "../git/GitWorkflowService.ts";
import { forkParked } from "../serverActivation.ts";
import * as VcsStatusBroadcaster from "../vcs/VcsStatusBroadcaster.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";

const make = Effect.gen(function* () {
  const threads = yield* ThreadManagement.ThreadManagementService;
  const git = yield* GitWorkflowService.GitWorkflowService;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const fs = yield* FileSystem.FileSystem;
  const reconcileThreads = Effect.fn("WorktreeBranchSync.reconcileThreads")(function* (
    input: { readonly cwd: string; readonly refName: string | null },
    matchingThreads: ReadonlyMap<ThreadId, string>,
  ) {
    if (input.refName === null || matchingThreads.size === 0) return;
    const snapshot = yield* threads.getShellSnapshot({ threadIds: [...matchingThreads.keys()] });
    const sharing = [...snapshot.threads, ...snapshot.archivedThreads].filter(
      (thread) =>
        thread.worktreePath === matchingThreads.get(thread.id) && thread.branch !== input.refName,
    );
    if (sharing.length === 0) return;
    // Status events may queue behind a generated rename or another checkout.
    if ((yield* git.currentBranch(input.cwd)) !== input.refName) return;
    for (const thread of sharing) {
      yield* threads
        .dispatch({
          type: "thread.metadata.update",
          commandId: CommandId.make(yield* randomUuidV4),
          threadId: thread.id,
          branch: input.refName,
          expectedBranch: thread.branch,
          expectedWorktreePath: thread.worktreePath,
        })
        .pipe(
          Effect.catchTags({
            OrchestratorDispatchError: (cause) =>
              Effect.logWarning("Worktree branch update was rejected", {
                threadId: thread.id,
                cause,
              }),
          }),
        );
    }
  });
  const worktreeGroups = Effect.fn("WorktreeBranchSync.worktreeGroups")(function* () {
    const paths = yield* projections.getThreadWorktreePaths({ includeArchived: true });
    const groups = new Map<string, Map<ThreadId, string>>();
    const canonicalPaths = new Map<string, string | null>();
    for (const thread of paths) {
      let cwd = canonicalPaths.get(thread.worktreePath);
      if (cwd === undefined) {
        cwd = yield* fs.realPath(thread.worktreePath).pipe(Effect.orElseSucceed(() => null));
        canonicalPaths.set(thread.worktreePath, cwd);
      }
      if (cwd === null) continue;
      const group = groups.get(cwd) ?? new Map();
      group.set(thread.threadId, thread.worktreePath);
      groups.set(cwd, group);
    }
    return groups;
  });
  const reconcile = Effect.fn("WorktreeBranchSync.reconcile")(function* (input: {
    readonly cwd: string;
    readonly refName: string | null;
  }) {
    if (input.refName === null) return;
    const groups = yield* worktreeGroups();
    const group = groups.get(input.cwd);
    if (group !== undefined) yield* reconcileThreads(input, group);
  });
  const backfill = Effect.fn("WorktreeBranchSync.backfill")(function* () {
    for (const [cwd, group] of yield* worktreeGroups()) {
      yield* Effect.gen(function* () {
        const refName = yield* git.currentBranch(cwd);
        yield* reconcileThreads({ cwd, refName }, group);
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Failed to reconcile worktree branch", { cwd, cause }),
        ),
      );
    }
  });
  return { reconcile, backfill };
});

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const broadcaster = yield* VcsStatusBroadcaster.VcsStatusBroadcaster;
    const { reconcile, backfill } = yield* make;
    yield* forkParked(
      Effect.all(
        [
          backfill().pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Failed to backfill worktree branches", { cause }),
            ),
          ),
          Stream.runForEach(broadcaster.streamBranchChanges, (input) =>
            reconcile(input).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("Failed to reconcile worktree branch", { cwd: input.cwd, cause }),
              ),
            ),
          ),
        ],
        { concurrency: "unbounded" },
      ),
    );
  }),
);

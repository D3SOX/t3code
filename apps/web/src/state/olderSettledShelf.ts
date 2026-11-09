import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isListedSettledThread,
  settledShelfFrontier,
  sortOlderSettledScopes,
  unloadedOlderSettledCount,
  wantedOlderSettledPages,
  type OlderSettledScope,
} from "@t3tools/client-runtime/state/threads";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { useEffect, useState } from "react";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { environmentCatalog } from "../connection/catalog";
import { olderSettledThreads, threadFamilies } from "./threads";
import { environmentShell } from "./shell";

const NO_PAGES: ReadonlyMap<EnvironmentId, number> = new Map();

export async function withAllOlderSettledThreads<A>(
  scopes: ReadonlyArray<OlderSettledScope>,
  operation: () => Promise<A>,
) {
  using resources = new DisposableStack();
  const pages = Number.MAX_SAFE_INTEGER;
  const readiness = scopes.map((scope) => {
    const atom = olderSettledThreads.pagesAtom(scope, pages);
    resources.defer(appAtomRegistry.mount(atom));
    resources.defer(
      threadFamilies.mountRows(
        appAtomRegistry,
        scope.environmentId,
        olderSettledThreads.rowsKey(scope, pages),
        olderSettledThreads.pageRowsAtom(scope, pages),
      ),
    );
    const ready = Atom.make((get) => {
      const connection = get(environmentCatalog.stateAtom(scope.environmentId));
      const shell = get(environmentShell.stateValueAtom(scope.environmentId));
      if (AsyncResult.isFailure(connection)) return AsyncResult.failure(connection.cause);
      if (!AsyncResult.isSuccess(connection)) return AsyncResult.initial();
      // "available" is also the connection atom's initial placeholder.
      if (connection.value.phase === "available" || connection.value.phase === "connecting") {
        return AsyncResult.initial();
      }
      if (connection.value.phase !== "connected") {
        return AsyncResult.failure(
          Cause.fail(
            new Error("Connect all selected environments before archiving settled threads."),
          ),
        );
      }
      if (Option.isSome(shell.error)) {
        return AsyncResult.failure(
          Cause.fail(new Error("Could not synchronize selected environment data.")),
        );
      }
      if (
        shell.generation === 0 ||
        Option.isNone(shell.snapshot) ||
        (shell.status !== "live" && shell.status !== "synchronizing")
      )
        return AsyncResult.initial();
      const result = get(atom);
      if (result.status === "pending") return AsyncResult.initial();
      if (result.status === "failed") {
        return AsyncResult.failure(Cause.fail(new Error("Could not load all settled threads.")));
      }
      return AsyncResult.success(result);
    });
    resources.defer(appAtomRegistry.mount(ready));
    return ready;
  });
  const allReady = Atom.make((get) => {
    const states = readiness.map((atom) => get(atom));
    for (const state of states) {
      if (AsyncResult.isFailure(state)) return AsyncResult.failure(state.cause);
    }
    return states.every(AsyncResult.isSuccess)
      ? AsyncResult.success(undefined)
      : AsyncResult.initial();
  });
  await Effect.runPromise(AtomRegistry.getResult(appAtomRegistry, allReady));
  return await operation();
}

/**
 * The Settled shelf for one scope when shells leave older settled threads out: which rows it may
 * list, how many threads it holds in all, and the pages read below each environment's cut, whose
 * rows merge into the thread list. `useOlderSettledShelfGrowth` reads the next pages.
 */
export function useOlderSettledShelf(input: {
  readonly scopes: ReadonlyArray<OlderSettledScope>;
  /** A collapsed shelf mounts no pages, so a reconnect reads none; expanding restores them. */
  readonly expanded: boolean;
  /** Rows the shelf shows; pages are read until it lists that many. */
  readonly visibleCount: number;
}) {
  const scopes = sortOlderSettledScopes(input.scopes);
  const scopeKey = JSON.stringify(scopes);
  const [requested, setRequested] = useState({ scopeKey, pages: NO_PAGES });
  const pages = requested.scopeKey === scopeKey && input.expanded ? requested.pages : NO_PAGES;
  const shelfScopes = scopes.map((scope) => ({
    scope,
    pages: pages.get(scope.environmentId) ?? 0,
  }));
  const shelfKey = JSON.stringify(shelfScopes);
  const shelf = useAtomValue(olderSettledThreads.shelfAtom(shelfScopes));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- mounts the requested older settled pages into the thread family registry while shown
  useEffect(() => {
    const releases = (JSON.parse(shelfKey) as typeof shelfScopes).flatMap(({ scope, pages }) =>
      pages === 0
        ? []
        : [
            threadFamilies.mountRows(
              appAtomRegistry,
              scope.environmentId,
              olderSettledThreads.rowsKey(scope, pages),
              olderSettledThreads.pageRowsAtom(scope, pages),
            ),
          ],
    );
    return () => {
      for (const release of releases) release();
    };
  }, [shelfKey]);

  const olderOf = (environmentId: EnvironmentId) => shelf.get(environmentId)?.older ?? null;
  const pagesOf = (environmentId: EnvironmentId) => shelf.get(environmentId)?.pages;
  const frontier = settledShelfFrontier([...shelf.values()]);
  const loaded = shelfScopes.filter(({ pages }) => pages > 0);
  return {
    environments: shelf,
    visibleCount: input.expanded ? input.visibleCount : 0,
    pages,
    grow: (next: ReadonlyMap<EnvironmentId, number>) => setRequested({ scopeKey, pages: next }),
    isListed: (thread: EnvironmentThreadShell) => isListedSettledThread(thread.source, frontier),
    /** Older settled threads in scope that are not local; add it to the local Settled rows. */
    unloadedCount: (threads: ReadonlyArray<EnvironmentThreadShell>) =>
      unloadedOlderSettledCount({ olderSettled: olderOf, scopes, threads }),
    loading: loaded.some(({ scope }) => pagesOf(scope.environmentId)?.status === "pending"),
    failed: loaded.some(({ scope }) => pagesOf(scope.environmentId)?.status === "failed"),
    retry: () => {
      for (const { scope, pages } of loaded) {
        olderSettledThreads.retryPages(appAtomRegistry, scope, pages);
      }
    },
  };
}

/** Reads the next pages while the shelf lists fewer rows than it shows. */
export function useOlderSettledShelfGrowth(
  shelf: ReturnType<typeof useOlderSettledShelf>,
  listedSettledThreads: ReadonlyArray<EnvironmentThreadShell>,
) {
  const wanted = wantedOlderSettledPages({
    requested: shelf.pages,
    environments: shelf.environments,
    listedCount: listedSettledThreads.length,
    visibleCount: shelf.visibleCount,
  });
  const { grow, pages } = shelf;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- requests more older settled pages when the listed threads cannot fill the visible count
  useEffect(() => {
    if (wanted !== pages) grow(wanted);
  }, [wanted, pages, grow]);
}

/**
 * Threads of these projects that this client does not hold (older settled threads), for counts
 * shown outside the shelf, such as a removal confirm.
 */
export function readUnloadedThreadCount(
  members: ReadonlyArray<{ readonly environmentId: EnvironmentId; readonly id: ProjectId }>,
  threads: ReadonlyArray<EnvironmentThreadShell>,
): number {
  return unloadedOlderSettledCount({
    olderSettled: (environmentId) =>
      appAtomRegistry.get(olderSettledThreads.olderSettledAtom(environmentId)),
    scopes: [...new Set(members.map((member) => member.environmentId))].map((environmentId) => ({
      environmentId,
      projectIds: members.flatMap((member) =>
        member.environmentId === environmentId ? [member.id] : [],
      ),
    })),
    threads: threads.filter((thread) =>
      members.some(
        (member) => member.environmentId === thread.environmentId && member.id === thread.projectId,
      ),
    ),
  });
}

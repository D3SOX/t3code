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
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { AtomRegistry } from "effect/reactivity";
import { useEffect, useState } from "react";

import { appAtomRegistry } from "../rpc/atomRegistry";
import { olderSettledThreads, threadFamilies } from "./threads";
import { environmentShell } from "./shell";

const NO_PAGES: ReadonlyMap<EnvironmentId, number> = new Map();

export async function withAllOlderSettledThreads<A>(
  scopes: ReadonlyArray<OlderSettledScope>,
  operation: () => Promise<A>,
) {
  using resources = new DisposableStack();
  const pages = Number.MAX_SAFE_INTEGER;
  for (const scope of scopes) {
    if (
      appAtomRegistry.get(environmentShell.stateValueAtom(scope.environmentId)).status !== "live"
    ) {
      throw new Error("Connect all selected environments before archiving settled threads.");
    }
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
    const result = await Effect.runPromise(
      AtomRegistry.toStream(appAtomRegistry, atom).pipe(
        Stream.filter((value) => value.status !== "pending"),
        Stream.runHead,
        Effect.map(Option.getOrThrow),
      ),
    );
    if (
      result.status === "failed" ||
      appAtomRegistry.get(environmentShell.stateValueAtom(scope.environmentId)).status !== "live"
    )
      throw new Error("Could not load all settled threads.");
  }
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

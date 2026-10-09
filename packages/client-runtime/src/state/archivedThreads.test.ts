import { EnvironmentId, type OrchestrationV2ArchivedShellSnapshot } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { expect, it } from "vite-plus/test";

import {
  createArchivedThreadSearchMatcher,
  createArchivedThreadSnapshotsAtomFamily,
  makeArchivedThreadsEnvironmentKey,
  parseArchivedThreadsEnvironmentKey,
} from "./archivedThreads.ts";

const searchThread = { title: "Fix notifications", branch: "fix/wayland-focus" };
const searchProject = { title: "T3 Code", workspaceRoot: "/home/nico/projects/t3code" };

it.each(["NOTIFICATIONS", "wayland", "T3 Code", "/home/nico", "Laptop"])(
  "finds archived threads by metadata: %s",
  (query) => {
    expect(
      createArchivedThreadSearchMatcher(`  ${query}  `)(searchThread, searchProject, "Laptop"),
    ).toBe(true);
  },
);

it("matches all archived threads for an empty or whitespace-only search", () => {
  for (const query of ["", "  "]) {
    expect(
      createArchivedThreadSearchMatcher(query)(
        { ...searchThread, branch: null },
        searchProject,
        null,
      ),
    ).toBe(true);
  }
});

it("excludes nonmatching threads and accepts missing branch and environment labels", () => {
  const matchesSearch = createArchivedThreadSearchMatcher("wayland");
  expect(matchesSearch({ ...searchThread, branch: null }, searchProject, null)).toBe(false);
  expect(matchesSearch(searchThread, searchProject, null)).toBe(true);
  expect(
    createArchivedThreadSearchMatcher("unrelated")(searchThread, searchProject, "Laptop"),
  ).toBe(false);
});

it("round-trips environment keys in sorted order", () => {
  const envA = EnvironmentId.make("env-a");
  const envB = EnvironmentId.make("env-b");
  const key = makeArchivedThreadsEnvironmentKey([envB, envA]);

  expect(parseArchivedThreadsEnvironmentKey(key)).toEqual([envA, envB]);
});

it("does not expose an archived snapshot failure message", () => {
  const environmentId = EnvironmentId.make("env-sensitive");
  const snapshotsAtom = createArchivedThreadSnapshotsAtomFamily<Error>({
    getSnapshotAtom: () =>
      Atom.make(
        AsyncResult.failure<OrchestrationV2ArchivedShellSnapshot, Error>(
          Cause.fail(new Error("credential=secret-value")),
        ),
      ),
    labelPrefix: "test:archived-thread-snapshots",
  });
  const registry = AtomRegistry.make();

  expect(registry.get(snapshotsAtom(makeArchivedThreadsEnvironmentKey([environmentId])))).toEqual({
    snapshots: [],
    error: "Failed to load archived threads.",
    isLoading: false,
  });

  registry.dispose();
});

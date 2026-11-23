import {
  AVAILABLE_CONNECTION_STATE,
  type SupervisorConnectionState,
} from "@t3tools/client-runtime/connection";
import { EMPTY_SHELL_STATE, type EnvironmentShellState } from "@t3tools/client-runtime/state/shell";
import type { OlderSettledPages } from "@t3tools/client-runtime/state/threads";
import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";

import { environmentCatalog } from "../connection/catalog";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { withAllOlderSettledThreads } from "./olderSettledShelf";
import { environmentShell } from "./shell";
import { olderSettledThreads } from "./threads";

const scope = { environmentId: EnvironmentId.make("archive-test"), projectIds: null };
const snapshot = {
  schemaVersion: 1 as const,
  snapshotSequence: 1,
  projects: [],
  threads: [],
  archivedThreads: [],
};

function setup(status: EnvironmentShellState["status"] = "synchronizing") {
  const resources = new DisposableStack();
  const connection = Atom.make<AsyncResult.AsyncResult<SupervisorConnectionState>>(
    AsyncResult.waiting(
      AsyncResult.success<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        phase: "connected",
        generation: 1,
      }),
    ),
  );
  const shell = Atom.make<EnvironmentShellState>({
    ...EMPTY_SHELL_STATE,
    status,
    generation: 1,
    snapshot: Option.some(snapshot),
  });
  const pages = Atom.make<OlderSettledPages>({ reads: [], frontier: null, status: "ready" });
  resources.use(vi.spyOn(environmentCatalog, "stateAtom").mockReturnValue(connection));
  resources.use(vi.spyOn(environmentShell, "stateValueAtom").mockReturnValue(shell));
  resources.use(vi.spyOn(olderSettledThreads, "pagesAtom").mockReturnValue(pages));
  resources.use(vi.spyOn(olderSettledThreads, "pageRowsAtom").mockReturnValue(Atom.make([])));
  return { connection, shell, pages, [Symbol.dispose]: () => resources.dispose() };
}

describe("withAllOlderSettledThreads", () => {
  it.each(["synchronizing", "live"] as const)(
    "allows a connected environment with an authoritative %s snapshot",
    async (status) => {
      using _state = setup(status);
      await expect(withAllOlderSettledThreads([scope], async () => "confirmed")).resolves.toBe(
        "confirmed",
      );
    },
  );

  it("waits for the first authoritative snapshot instead of using a partial cached list", async () => {
    using state = setup();
    appAtomRegistry.set(state.shell, { ...EMPTY_SHELL_STATE, status: "synchronizing" });
    let confirmed = false;
    const archive = withAllOlderSettledThreads([scope], async () => {
      confirmed = true;
    });
    expect(confirmed).toBe(false);
    appAtomRegistry.set(state.shell, {
      ...EMPTY_SHELL_STATE,
      status: "synchronizing",
      generation: 1,
      snapshot: Option.some(snapshot),
    });
    await archive;
    expect(confirmed).toBe(true);
  });

  it("rejects a disconnected environment even if its snapshot still reads live", async () => {
    using state = setup("live");
    appAtomRegistry.set(
      state.connection,
      AsyncResult.success<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        phase: "offline",
      }),
    );
    await expect(withAllOlderSettledThreads([scope], async () => "confirmed")).rejects.toThrow(
      "Connect all selected environments",
    );
  });

  it("aborts when the connection drops while pages are loading", async () => {
    using state = setup("live");
    appAtomRegistry.set(state.pages, { reads: [], frontier: null, status: "pending" });
    const archive = withAllOlderSettledThreads([scope], async () => "confirmed");
    const assertion = expect(archive).rejects.toThrow("Connect all selected environments");
    appAtomRegistry.set(
      state.connection,
      AsyncResult.success<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        phase: "offline",
      }),
    );
    await assertion;
  });

  it("waits for every page before proceeding to confirmation", async () => {
    using state = setup();
    appAtomRegistry.set(state.pages, { reads: [], frontier: null, status: "pending" });
    let confirmed = false;
    const archive = withAllOlderSettledThreads([scope], async () => {
      confirmed = true;
    });
    expect(confirmed).toBe(false);
    appAtomRegistry.set(state.pages, { reads: [], frontier: null, status: "ready" });
    await archive;
    expect(confirmed).toBe(true);
  });

  it("does not proceed with partial rows after a page fails", async () => {
    using state = setup();
    appAtomRegistry.set(state.pages, { reads: [], frontier: null, status: "failed" });
    await expect(withAllOlderSettledThreads([scope], async () => "confirmed")).rejects.toThrow(
      "Could not load all settled threads.",
    );
  });

  it("rechecks earlier environments while another environment is still loading", async () => {
    using state = setup("live");
    const peer = EnvironmentId.make("archive-peer");
    const connection = Atom.make(
      AsyncResult.success<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        phase: "connected",
      }),
    );
    const pages = Atom.make<OlderSettledPages>({ reads: [], frontier: null, status: "pending" });
    let loadingStarted!: () => void;
    const loading = new Promise<void>((resolve) => {
      loadingStarted = resolve;
    });
    vi.mocked(environmentCatalog.stateAtom).mockImplementation((id) =>
      id === peer ? connection : state.connection,
    );
    vi.mocked(olderSettledThreads.pagesAtom).mockImplementation((current) => {
      if (current.environmentId !== peer) return state.pages;
      loadingStarted();
      return pages;
    });
    const archive = withAllOlderSettledThreads(
      [scope, { environmentId: peer, projectIds: null }],
      async () => "confirmed",
    );
    const assertion = expect(archive).rejects.toThrow("Connect all selected environments");
    await loading;
    appAtomRegistry.set(
      state.connection,
      AsyncResult.success<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        phase: "offline",
      }),
    );
    appAtomRegistry.set(pages, { reads: [], frontier: null, status: "ready" });
    await assertion;
  });
});

import { terminalContextMenuItems } from "./ThreadTerminalDrawer";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  applyTerminalAttachStreamEvent,
  combineTerminalSessionState,
  EMPTY_TERMINAL_BUFFER_STATE,
  INITIAL_TERMINAL_OUTPUT_CURSOR,
  nextTerminalAttachSeedState,
} from "@t3tools/client-runtime/state/terminal";

import {
  shouldClearTerminalSelectionAction,
  shouldHandleTerminalExit,
  synchronizeTerminalOutput,
  terminalPathOpenTarget,
} from "./ThreadTerminalDrawer";

describe("terminal selection menus", () => {
  it("labels the copy action for the link under the pointer", () => {
    expect(
      terminalContextMenuItems({ hasSelection: false, link: "https://t3.codes" }).map(
        ({ id, label }) => [id, label],
      ),
    ).toContainEqual(["copy-link", "Copy link"]);
    expect(
      terminalContextMenuItems({ hasSelection: false, link: "/workspace/project" }).map(
        ({ id, label }) => [id, label],
      ),
    ).toContainEqual(["copy-link", "Copy path"]);
    expect(
      terminalContextMenuItems({ hasSelection: false, link: "https://t3.codes" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["add-to-chat", "copy", "copy-link", "paste", "select-all", "scroll-to-bottom"]);
    expect(
      terminalContextMenuItems({ hasSelection: false, link: null }).map(({ id }) => id),
    ).toEqual(["add-to-chat", "copy", "paste", "select-all", "scroll-to-bottom"]);
  });
});

describe("terminal selection actions", () => {
  it("does not let an old selection popup cancel its replacement right-click menu", () => {
    expect(
      shouldClearTerminalSelectionAction({
        actionPending: false,
        openMenuRequestId: 3,
        currentRequestId: 4,
      }),
    ).toBe(false);
    expect(
      shouldClearTerminalSelectionAction({
        actionPending: false,
        openMenuRequestId: null,
        currentRequestId: 4,
      }),
    ).toBe(false);
  });

  it("handles an exit that lands while the terminal surface is still loading", () => {
    expect(shouldHandleTerminalExit("exited", "running", false, 1)).toBe(true);
    expect(shouldHandleTerminalExit("exited", "exited", false, 1)).toBe(false);
    expect(shouldHandleTerminalExit("closed", "running", true, 1)).toBe(false);
  });
});

describe("terminal path links", () => {
  it.each(["remote-links", "remote-unavailable"] as const)(
    "keeps paths in T3 Code instead of launching an editor on a %s environment",
    (mode) => {
      expect(terminalPathOpenTarget(mode)).toBe("app");
    },
  );

  it("preserves the preferred editor for a local environment", () => {
    expect(terminalPathOpenTarget("local-exec")).toBe("environment-editor");
  });

  it("stays in T3 Code while the environment location is unresolved", () => {
    expect(terminalPathOpenTarget("local-exec", false)).toBe("app");
  });
});

it("retains visible output and selection until a replacement subscription receives its snapshot", () => {
  const terminal = { resetAndWrite: vi.fn(), write: vi.fn(), clearSelection: vi.fn() };
  const snapshot = {
    threadId: "thread",
    terminalId: "term-1",
    cwd: "/repo",
    worktreePath: null,
    status: "running" as const,
    pid: 123,
    history: "host output",
    exitCode: null,
    exitSignal: null,
    label: "Terminal 1",
    updatedAt: "2026-09-05T00:00:00.000Z",
  };
  const attached = applyTerminalAttachStreamEvent(nextTerminalAttachSeedState(), {
    type: "snapshot",
    snapshot,
  });
  const cursor = synchronizeTerminalOutput(terminal, attached, INITIAL_TERMINAL_OUTPUT_CURSOR);
  expect(terminal.resetAndWrite).toHaveBeenLastCalledWith("host output");
  terminal.resetAndWrite.mockClear();
  terminal.clearSelection.mockClear();

  const pending = combineTerminalSessionState(
    { ...snapshot, hasRunningSubprocess: false },
    EMPTY_TERMINAL_BUFFER_STATE,
  );
  expect(pending.status).toBe("running");
  expect(synchronizeTerminalOutput(terminal, pending, cursor)).toBe(cursor);
  expect(terminal.resetAndWrite).not.toHaveBeenCalled();
  expect(terminal.write).not.toHaveBeenCalled();
  expect(terminal.clearSelection).not.toHaveBeenCalled();

  const observed = applyTerminalAttachStreamEvent(nextTerminalAttachSeedState(), {
    type: "snapshot",
    snapshot: { ...snapshot, history: "host output\nobserved output" },
  });
  const observedCursor = synchronizeTerminalOutput(terminal, observed, cursor);
  expect(terminal.resetAndWrite).toHaveBeenLastCalledWith("host output\nobserved output");

  const cleared = applyTerminalAttachStreamEvent(observed, {
    type: "cleared",
    threadId: "thread",
    terminalId: "term-1",
  });
  synchronizeTerminalOutput(terminal, cleared, observedCursor);
  expect(terminal.resetAndWrite).toHaveBeenLastCalledWith("");
});

import type { ClientSettings } from "@t3tools/contracts/settings";
import { WORKING_EXIT_GRACE_MS } from "@t3tools/client-runtime/state/thread-inbox";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { act, fakeTimers, render as renderClient, type Screen } from "../../test/render";
import { describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  mode: "off" as ClientSettings["notificationMode"],
  inApp: true,
  active: { environmentId: "env-1", threadId: "other-thread" },
  focused: true,
  visible: "visible",
  live: true,
  completedAt: null as string | null,
  archivedAt: null as string | null,
  input: false,
  approval: false,
  sessionError: false,
  turnError: false,
  queued: false,
  limited: false,
  usageLimitResetAt: null as string | null,
  startedAt: "2026-09-13T09:00:00.000Z",
  environmentIds: ["env-1"],
  extraThreads: [] as Array<{
    id: string;
    limited: boolean;
    providerInstanceId?: string;
    usageLimitResetAt?: string;
  }>,
  subagent: false,
  prWatch: false,
  completionSilent: false,
  background: [] as Array<{ taskId: string; kind: "command" | "monitor" }>,
  delegatedChild: null as "running" | "approval" | null,
  add: vi.fn(
    (_toast: {
      title: string;
      description: string;
      timeout: number;
      onClose?: () => void;
      actionProps: { onClick: () => void };
    }) => "toast-1",
  ),
  close: vi.fn(),
  navigate: vi.fn(),
  sound: vi.fn(),
  notification: vi.fn(function (_title: string, options: NotificationOptions) {
    return Object.assign(new EventTarget(), { tag: options.tag, close: vi.fn() });
  }),
}));

const SHELL_NOW = DateTime.makeUnsafe("2026-09-13T09:00:00.000Z");

function mockThreadShell() {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Fix the login form",
    providerInstanceId: "codex",
    modelSelection: { instanceId: "codex", model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: {
      rootThreadId: "thread-1",
      parentThreadId: state.subagent ? "parent" : null,
      relationshipToParent: state.subagent ? "subagent" : null,
    },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    latestRunId: "run-1",
    latestRunUserMessageId: state.prWatch ? "message:pr-watch:wake-1" : "message:user-1",
    latestRunCompletionSilent: state.completionSilent,
    activeRunId: null,
    status: state.queued
      ? "queued"
      : state.completedAt
        ? "completed"
        : state.sessionError || state.turnError || state.limited
          ? "failed"
          : "running",
    lastErrorClass: state.limited ? "usage_limit" : null,
    usageLimitResetAt: state.usageLimitResetAt,
    pendingRuntimeRequest: state.input
      ? { id: "request-1", kind: "user_input", createdAt: SHELL_NOW }
      : state.approval
        ? { id: "request-1", kind: "command", createdAt: SHELL_NOW }
        : null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    pendingBackgroundTasks: state.background,
    itemCount: 0,
    visibleItemCount: 0,
    createdAt: SHELL_NOW,
    updatedAt: SHELL_NOW,
    latestRunRequestedAt: SHELL_NOW,
    latestRunStartedAt: DateTime.makeUnsafe(state.startedAt),
    latestRunCompletedAt: state.completedAt ? DateTime.makeUnsafe(state.completedAt) : undefined,
    archivedAt: state.archivedAt ? DateTime.makeUnsafe(state.archivedAt) : null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  };
}

let stableParent: ReturnType<typeof mockThreadShell> | null = null;
function mockThreads() {
  if (state.delegatedChild === null)
    return [
      mockThreadShell(),
      ...state.extraThreads.map((thread) => ({
        ...mockThreadShell(),
        id: thread.id,
        providerInstanceId: thread.providerInstanceId ?? "codex",
        status: thread.limited ? "failed" : "running",
        lastErrorClass: thread.limited ? "usage_limit" : null,
        usageLimitResetAt: thread.usageLimitResetAt ?? state.usageLimitResetAt,
      })),
    ];
  stableParent ??= mockThreadShell();
  const child = {
    ...mockThreadShell(),
    id: "child-1",
    title: "Review the login form",
    creationSource: "mcp",
    lineage: {
      rootThreadId: "thread-1",
      parentThreadId: "thread-1",
      relationshipToParent: "subagent",
    },
    pendingRuntimeRequest:
      state.delegatedChild === "approval"
        ? { id: "request-2", kind: "command", createdAt: SHELL_NOW }
        : null,
  };
  return [stableParent, child];
}

vi.mock(import("@effect/atom-react"), async (original) => ({
  ...(await original()),
  useAtomValue: (() => ({
    status: state.live ? "live" : "disconnected",
    snapshot: Option.some({ threads: mockThreads() }),
  })) as never,
}));
vi.mock(import("@tanstack/react-router"), async (original) => ({
  ...(await original()),
  useNavigate: (() => state.navigate) as never,
  useParams: (() => state.active) as never,
}));
vi.mock(import("../hooks/useSettings"), async (original) => ({
  ...(await original()),
  useClientSettings: ((
    select: (
      settings: Pick<ClientSettings, "notificationMode" | "inAppNotificationsEnabled">,
    ) => unknown,
  ) => select({ notificationMode: state.mode, inAppNotificationsEnabled: state.inApp })) as never,
  getClientSettings: (() => ({ notificationMode: state.mode })) as never,
}));
vi.mock(import("../state/environments"), async (original) => ({
  ...(await original()),
  useEnvironmentIds: (() => [...state.environmentIds]) as never,
}));
vi.mock(import("../threadNotifications"), async (original) => ({
  ...(await original()),
  playNotificationSound: state.sound,
  setNotificationBadge: vi.fn(),
}));
vi.mock(import("./ui/toast"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    toastManager: { ...actual.toastManager, add: state.add as never, close: state.close },
  };
});

import { ThreadNotificationCoordinator } from "./ThreadNotificationCoordinator";

function setup() {
  let screen: Screen | null = null;
  let timers: Disposable | null = null;
  const render = async () => {
    if (screen) {
      await screen.rerender(<ThreadNotificationCoordinator />);
      await act(() => vi.advanceTimersByTimeAsync(WORKING_EXIT_GRACE_MS));
    } else {
      screen = await renderClient(<ThreadNotificationCoordinator />);
      timers = fakeTimers();
    }
  };
  const complete = async () => {
    state.completedAt = "2026-09-13T10:00:00.000Z";
    await render();
  };
  vi.clearAllMocks();
  Object.assign(state, {
    mode: "off",
    inApp: true,
    active: { environmentId: "env-1", threadId: "other-thread" },
    focused: true,
    visible: "visible",
    live: true,
    completedAt: null,
    archivedAt: null,
    input: false,
    approval: false,
    sessionError: false,
    turnError: false,
    queued: false,
    limited: false,
    usageLimitResetAt: null,
    startedAt: "2026-09-13T09:00:00.000Z",
    environmentIds: ["env-1"],
    extraThreads: [],
    subagent: false,
    prWatch: false,
    completionSilent: false,
    background: [],
    delegatedChild: null,
  });
  stableParent = null;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(
    () => state.visible as DocumentVisibilityState,
  );
  vi.spyOn(document, "hasFocus").mockImplementation(() => state.focused);
  vi.stubGlobal("Notification", Object.assign(state.notification, { permission: "granted" }));
  return {
    render,
    complete,
    unmount: async () => screen?.unmount(),
    async [Symbol.asyncDispose]() {
      timers?.[Symbol.dispose]();
      await screen?.[Symbol.asyncDispose]();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

describe("thread notifications", () => {
  it.each([false, true])("alerts only once for the same limit when focused=%s", async (focused) => {
    await using harness = setup();
    const { render, complete } = harness;
    state.mode = "notifications-and-sound";
    state.focused = focused;
    state.usageLimitResetAt = "2026-09-13T14:00:00.000Z";
    state.extraThreads = [{ id: "thread-2", limited: false }];
    await render();

    state.limited = true;
    await render();
    expect(focused ? state.add : state.notification).toHaveBeenCalledTimes(1);
    expect(state.sound).toHaveBeenCalledTimes(1);

    state.extraThreads = [{ id: "thread-2", limited: true }];
    await render();
    expect(focused ? state.add : state.notification).toHaveBeenCalledTimes(1);
    expect(state.sound).toHaveBeenCalledTimes(1);
  });

  it("allows a different reset window but suppresses retries within the same window", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    state.mode = "notifications-and-sound";
    state.focused = false;
    state.usageLimitResetAt = "2026-09-13T14:00:00.000Z";
    await render();
    state.limited = true;
    await render();
    state.limited = false;
    await render();
    state.limited = true;
    await render();
    expect(state.notification).toHaveBeenCalledTimes(1);
    expect(state.sound).toHaveBeenCalledTimes(1);

    state.limited = false;
    await render();
    state.usageLimitResetAt = "2026-09-13T19:00:00.000Z";
    state.limited = true;
    await render();
    expect(state.notification).toHaveBeenCalledTimes(2);
    expect(state.sound).toHaveBeenCalledTimes(2);
  });

  it("keeps separate provider instances and environments eligible for alerts", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    state.mode = "notifications-and-sound";
    state.focused = false;
    state.environmentIds = ["env-1", "env-2"];
    state.usageLimitResetAt = "2026-09-13T14:00:00.000Z";
    state.extraThreads = [{ id: "thread-2", limited: false, providerInstanceId: "other-account" }];
    await render();
    state.limited = true;
    state.extraThreads = [{ id: "thread-2", limited: true, providerInstanceId: "other-account" }];
    await render();
    expect(state.notification).toHaveBeenCalledTimes(4);
    expect(state.sound).toHaveBeenCalledTimes(4);
  });

  it("allows a new limit without a reset time after a later successful turn", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    state.mode = "notifications-and-sound";
    state.focused = false;
    state.extraThreads = [{ id: "thread-2", limited: false }];
    await render();
    state.limited = true;
    await render();
    state.extraThreads = [{ id: "thread-2", limited: true }];
    await render();
    expect(state.notification).toHaveBeenCalledTimes(1);

    state.limited = false;
    state.startedAt = "2026-09-13T09:30:00.000Z";
    await complete();
    state.notification.mockClear();
    state.sound.mockClear();
    state.completedAt = null;
    state.limited = true;
    await render();
    expect(state.notification).toHaveBeenCalledTimes(1);
    expect(state.sound).toHaveBeenCalledTimes(1);
  });

  it("does not consume the shared alert when the first thread cannot notify", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    state.mode = "notifications";
    state.active = { environmentId: "env-1", threadId: "thread-1" };
    state.usageLimitResetAt = "2026-09-13T14:00:00.000Z";
    state.extraThreads = [{ id: "thread-2", limited: false }];
    await render();
    state.limited = true;
    await render();
    expect(state.add).not.toHaveBeenCalled();
    expect(state.notification).not.toHaveBeenCalled();

    state.extraThreads = [{ id: "thread-2", limited: true }];
    await render();
    expect(state.add).toHaveBeenCalledTimes(1);
  });

  it("dismisses the toast when its thread is opened through normal navigation", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    await render();
    await complete();
    expect(state.add).toHaveBeenCalledTimes(1);
    state.active = { environmentId: "env-2", threadId: "thread-1" };
    await render();
    expect(state.close).not.toHaveBeenCalled();
    state.active = { environmentId: "env-1", threadId: "thread-1" };
    await render();
    expect(state.close).toHaveBeenCalledWith("toast-1");
  });

  it("dismisses the viewed thread's toast on focus with system notifications off", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    await render();
    await complete();
    state.focused = false;
    state.active.threadId = "thread-1";
    await render();
    expect(state.close).not.toHaveBeenCalled();
    state.focused = true;
    await act(() => window.dispatchEvent(new Event("focus")));
    expect(state.close).toHaveBeenCalledWith("toast-1");
  });

  it("dismisses the viewed thread's toast when the document becomes visible", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    await render();
    await complete();
    state.visible = "hidden";
    state.active.threadId = "thread-1";
    await render();
    expect(state.close).not.toHaveBeenCalled();
    state.visible = "visible";
    await act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(state.close).toHaveBeenCalledWith("toast-1");
  });

  it("replaces an earlier toast for the same thread and clears the replacement on entry", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    state.add.mockReturnValueOnce("first").mockReturnValueOnce("second");
    await render();
    await complete();
    state.completedAt = null;
    await render();
    state.completedAt = "2026-09-13T11:00:00.000Z";
    await render();
    expect(state.close).toHaveBeenCalledWith("first");
    state.add.mock.calls[0]?.[0].onClose?.();
    state.active.threadId = "thread-1";
    await render();
    expect(state.close).toHaveBeenCalledWith("second");
  });

  it("clears retained toasts when in-app notifications are disabled", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    state.mode = "notifications";
    await render();
    await complete();
    state.inApp = false;
    await render();
    expect(state.close).toHaveBeenCalledWith("toast-1");
  });

  it("clears retained toasts when the environment coordinator unmounts", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    await render();
    await complete();
    await harness.unmount();
    expect(state.close).toHaveBeenCalledWith("toast-1");
  });

  it("waits for queued follow-up turns before notifying completion", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    state.mode = "notifications-and-sound";
    state.focused = false;
    await render();
    state.queued = true;
    await complete();
    expect(state.sound).not.toHaveBeenCalled();
    expect(state.notification).not.toHaveBeenCalled();
    state.queued = false;
    state.completedAt = null;
    await render();
    await complete();
    expect(state.sound).toHaveBeenCalledOnce();
    expect(state.notification).toHaveBeenCalledOnce();
  });

  it.each([true, false])("keeps empty responses silent with focus=%s", async (focused) => {
    await using harness = setup();
    const { render, complete } = harness;
    state.mode = "notifications-and-sound";
    state.focused = focused;
    await render();
    state.completionSilent = true;
    await complete();
    await render();
    expect(state.add).not.toHaveBeenCalled();
    expect(state.sound).not.toHaveBeenCalled();
    expect(state.notification).not.toHaveBeenCalled();

    state.completedAt = null;
    state.completionSilent = false;
    await render();
    state.completedAt = "2026-09-13T11:00:00.000Z";
    await render();
    expect(state.sound).toHaveBeenCalledWith("completion", expect.any(Function));
    expect(focused ? state.add : state.notification).toHaveBeenCalledOnce();
  });

  it("keeps PR-watch completions silent and still notifies the next user turn", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    state.mode = "notifications-and-sound";
    state.focused = false;
    state.prWatch = true;
    await render();
    await complete();
    expect(state.add).not.toHaveBeenCalled();
    expect(state.sound).not.toHaveBeenCalled();
    expect(state.notification).not.toHaveBeenCalled();
    await render();
    expect(state.sound).not.toHaveBeenCalled();

    state.prWatch = false;
    state.completedAt = null;
    await render();
    state.completedAt = "2026-09-13T11:00:00.000Z";
    await render();
    expect(state.notification).toHaveBeenCalledOnce();
    expect(state.sound).toHaveBeenCalledWith("completion", expect.any(Function));
  });

  it.each(["input", "approval", "turnError", "limited"] as const)(
    "still alerts for PR-watch %s",
    async (event) => {
      await using harness = setup();
      const { render } = harness;
      state.mode = "notifications-and-sound";
      state.focused = false;
      state.prWatch = true;
      await render();
      state[event] = true;
      await render();
      expect(state.notification).toHaveBeenCalledOnce();
      expect(state.sound).toHaveBeenCalledWith("input", expect.any(Function));
    },
  );

  it("alerts once with system alerts off and opens the completed thread", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    await render();
    await complete();
    await render();
    expect(state.add).toHaveBeenCalledTimes(1);
    const toast = state.add.mock.calls[0]?.[0];
    expect(toast?.title).toBe("Thread completed");
    expect(toast?.description).toBe("Fix the login form");
    expect(toast?.timeout).toBe(0);
    toast?.actionProps.onClick();
    expect(state.close).toHaveBeenCalledWith("toast-1");
    expect(state.navigate).toHaveBeenCalledWith({
      to: "/$environmentId/$threadId",
      params: { environmentId: "env-1", threadId: "thread-1" },
    });
    expect(state.notification).not.toHaveBeenCalled();
  });

  it.each([
    ["input", "Input needed"],
    ["approval", "Approval needed"],
    ["sessionError", "Thread failed"],
    ["turnError", "Thread failed"],
    ["limited", "Usage limit reached"],
  ] as const)("uses the same %s event for in-app and desktop alerts", async (event, title) => {
    await using harness = setup();
    const { render, complete } = harness;
    state.mode = "notifications-and-sound";
    await render();
    state[event] = true;
    await render();
    await render();
    expect(state.add).toHaveBeenCalledTimes(1);
    expect(state.add).toHaveBeenLastCalledWith(expect.objectContaining({ title, timeout: 0 }));
    expect(state.sound).toHaveBeenCalledWith("input", expect.any(Function));
    expect(state.notification).not.toHaveBeenCalled();

    state[event] = false;
    await render();
    state.focused = false;
    if (event === "limited") state.usageLimitResetAt = "2026-09-13T14:00:00.000Z";
    state[event] = true;
    await render();
    await render();
    expect(state.add).toHaveBeenCalledTimes(1);
    expect(state.notification).toHaveBeenCalledTimes(1);
    expect(state.notification).toHaveBeenCalledWith(title, {
      body: "Fix the login form",
      tag: expect.any(String),
      silent: true,
    });
  });

  it("waits for background work to finish before alerting completion", async () => {
    await using harness = setup();
    const { render, complete } = harness;
    await render();
    state.background = [{ taskId: "watch", kind: "monitor" }];
    await complete();
    expect(state.add).not.toHaveBeenCalled();
    state.background = [{ taskId: "dev", kind: "command" }];
    await render();
    expect(state.add).not.toHaveBeenCalled();
    state.background = [];
    await render();
    expect(state.add).toHaveBeenCalledTimes(1);
    expect(state.add).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Thread completed" }),
    );
  });
});

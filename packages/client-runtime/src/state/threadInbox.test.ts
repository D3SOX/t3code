import { EnvironmentId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  createInboxReturnTracker,
  isThreadWorking,
  sortInboxThreadsByReturn,
  sortWorkingThreadsBySend,
} from "./threadInbox.ts";
import { planPinnedReorder } from "./threadSort.ts";

const environmentId = EnvironmentId.make("environment-1");

function thread(id: string, working: boolean) {
  return {
    id: ThreadId.make(id),
    environmentId,
    createdAt: "2026-06-01T00:00:00.000Z",
    unsettledAt: null,
    latestRun: null,
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "default" as const,
    runtime: working
      ? {
          status: "running" as const,
          activeRunId: null,
          providerInstanceId: ProviderInstanceId.make("codex"),
          providerName: "Codex",
          lastError: null,
          updatedAt: "2026-06-01T00:00:00.000Z",
        }
      : null,
  };
}

describe("background commands", () => {
  const running = thread("tests", true);
  const waitingForTests = {
    ...running,
    runtime: { ...running.runtime!, status: "completed" as const },
    pendingBackgroundTasks: [{ taskId: "gradle-tests", kind: "command" as const }],
  };

  it("keeps a finished turn working until its background command finishes", () => {
    expect(isThreadWorking(waitingForTests)).toBe(true);
    expect(isThreadWorking({ ...waitingForTests, pendingBackgroundTasks: [] })).toBe(false);
    expect(waitingForTests.runtime.status).toBe("completed");
  });

  it("keeps approvals, questions, and failures in the inbox", () => {
    expect(isThreadWorking({ ...waitingForTests, hasPendingApprovals: true })).toBe(false);
    expect(isThreadWorking({ ...waitingForTests, hasPendingUserInput: true })).toBe(false);
    expect(isThreadWorking({ ...waitingForTests, pendingSubagentRequest: "approval" })).toBe(false);
    expect(
      isThreadWorking({
        ...waitingForTests,
        runtime: { ...waitingForTests.runtime, status: "failed" },
      }),
    ).toBe(false);
  });
});

describe("createInboxReturnTracker", () => {
  it("stamps a thread when it stops working, but never on the first observation", () => {
    const tracker = createInboxReturnTracker();
    const first = tracker.observe([thread("a", true), thread("b", false)]);
    expect(first(thread("a", true))).toBeUndefined();
    expect(first(thread("b", false))).toBeUndefined();

    const second = tracker.observe([thread("a", false), thread("b", false)]);
    expect(second(thread("a", false))).toBeDefined();
    expect(second(thread("b", false))).toBeUndefined();
    expect(tracker.returnedAt(thread("a", false))).toBe(second(thread("a", false)));
    // An earlier observation keeps its answer, so lists built from it stay valid.
    expect(first(thread("a", false))).toBeUndefined();
  });
});

describe("sortInboxThreadsByReturn", () => {
  it("keeps a saved manual order while unarranged returns lead the inbox", () => {
    const older = { ...thread("older", false), activeOrderKey: null as string | null };
    const newer = {
      ...thread("newer", false),
      createdAt: "2026-06-01T01:00:00.000Z",
      activeOrderKey: null as string | null,
    };
    const initial = sortInboxThreadsByReturn([older, newer]);
    expect(initial.map((entry) => entry.id)).toEqual(["newer", "older"]);
    const assignments = planPinnedReorder({
      orderedIds: ["older", "newer"],
      keysById: new Map(initial.map((entry) => [entry.id, entry.activeOrderKey])),
      movedId: "older",
    });
    const ordered = initial.map((entry) => ({
      ...entry,
      activeOrderKey: assignments.find(({ id }) => id === entry.id)?.orderKey ?? null,
    }));
    const returned = { ...thread("returned", false), createdAt: "2026-06-01T02:00:00.000Z" };
    expect(sortInboxThreadsByReturn([...ordered, returned]).map((entry) => entry.id)).toEqual([
      "returned",
      "older",
      "newer",
    ]);
  });
});

describe("sortWorkingThreadsBySend", () => {
  it("orders by the last message the user sent, not by later runs", () => {
    const sentFirst = {
      ...thread("sent-first", true),
      latestUserAuthoredMessageAt: "2026-06-01T01:00:00.000Z",
      latestRun: {
        runId: RunId.make("run:wake"),
        status: "running" as const,
        requestedAt: "2026-06-01T04:00:00.000Z",
        startedAt: "2026-06-01T04:00:00.000Z",
        completedAt: null,
        assistantMessageId: null,
      },
    };
    const sentLast = {
      ...thread("sent-last", true),
      latestUserAuthoredMessageAt: "2026-06-01T02:00:00.000Z",
    };
    const launched = { ...thread("launched", true), latestUserAuthoredMessageAt: null };
    expect(
      sortWorkingThreadsBySend([launched, sentFirst, sentLast]).map((thread) => thread.id),
    ).toEqual(["sent-last", "sent-first", "launched"]);
  });
});

import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { createLocalNotificationTracker } from "./localNotifications";

const environmentId = EnvironmentId.make("host");
const threadId = ThreadId.make("thread");
const projectId = ProjectId.make("project");
const now = DateTime.makeUnsafe("2026-10-24T12:00:00Z");
const snapshot = {
  projects: [{ id: projectId, title: "Project" }],
  threads: [
    {
      id: threadId,
      projectId,
      title: "Task",
      status: "running" as const,
      modelSelection: { instanceId: ProviderInstanceId.make("claude"), model: "test" },
      lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
      updatedAt: now,
      latestRunId: RunId.make("run-1"),
      pendingRuntimeRequest: null,
      settledOverride: null,
      archivedAt: null,
      deletedAt: null,
    },
  ],
};

describe("local agent notifications", () => {
  it("notifies for a new completion, suppresses history and renames, then notifies for the next run", () => {
    const track = createLocalNotificationTracker();
    const completed = {
      ...snapshot,
      threads: snapshot.threads.map((t) => ({ ...t, status: "completed" as const })),
    };
    expect(track(environmentId, completed)).toEqual([]);
    const next = {
      ...completed,
      threads: completed.threads.map((t) => ({ ...t, latestRunId: RunId.make("run-2") })),
    };
    expect(track(environmentId, next)).toMatchObject([
      { alert_title: "Agent finished", alert_path: "/threads/host/thread" },
    ]);
    expect(
      track(environmentId, {
        ...next,
        threads: next.threads.map((t) => ({ ...t, title: "Renamed" })),
      }),
    ).toEqual([]);
  });

  it("waits for the queued turn and does not alert for empty or PR-watch completions", () => {
    const track = createLocalNotificationTracker();
    track(environmentId, snapshot);
    for (const overrides of [
      { status: "queued" as const },
      { status: "completed" as const, latestRunCompletionSilent: true },
      { status: "completed" as const, latestRunStopRequested: true },
      {
        status: "completed" as const,
        latestRunUserMessageId: MessageId.make("message:pr-watch:wake"),
      },
    ])
      expect(
        track(environmentId, {
          ...snapshot,
          threads: snapshot.threads.map((t) => ({ ...t, ...overrides })),
        }),
      ).toEqual([]);
    expect(
      track(environmentId, {
        ...snapshot,
        threads: snapshot.threads.map((t) => ({
          ...t,
          status: "completed" as const,
          latestRunId: RunId.make("queued-turn"),
        })),
      }),
    ).toHaveLength(1);
  });

  it("alerts once per input request while the agent continues running", () => {
    const track = createLocalNotificationTracker();
    track(environmentId, snapshot);
    const waiting = {
      ...snapshot,
      threads: snapshot.threads.map((t) => ({
        ...t,
        pendingRuntimeRequest: {
          id: RuntimeRequestId.make("input"),
          kind: "user_input" as const,
          createdAt: now,
          blocking: false,
        },
      })),
    };
    // Nonblocking requests stay working; blocking questions should notify.
    expect(track(environmentId, waiting)).toEqual([]);
    const blocking = {
      ...waiting,
      threads: waiting.threads.map((t) => ({
        ...t,
        pendingRuntimeRequest: { ...t.pendingRuntimeRequest, blocking: true },
      })),
    };
    expect(track(environmentId, blocking)).toMatchObject([{ alert_title: "Waiting for input" }]);
    expect(track(environmentId, blocking)).toEqual([]);
  });
});

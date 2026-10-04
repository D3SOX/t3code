import { RunId, ThreadId, TurnItemId, type OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vitest";
import { capacityRetryLabel, getModelCapacityRetry } from "./modelCapacityRetry";

const runId = RunId.make("run-1");
const retry = { attempt: 1, retryAt: "2026-10-01T10:00:10.000Z" };
function item(
  status: "running" | "completed" = "running",
  id = runId,
  delay: number | null = 10_000,
) {
  return {
    id: TurnItemId.make("retry-item"),
    threadId: ThreadId.make("thread-1"),
    runId: id,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 0,
    status,
    title: null,
    startedAt: null,
    completedAt: null,
    updatedAt: DateTime.makeUnsafe("2026-10-01T10:00:00.000Z"),
    type: "error",
    failure: {
      class: "provider_error",
      message: "Model at capacity",
      code: "serverOverloaded",
      retryable: true,
    },
    retry: { attempt: 1, maxAttempts: null, retryDelayMs: delay },
  } satisfies OrchestrationV2TurnItem;
}

describe("capacity retry presentation", () => {
  it("shows only the active run's latest unresolved retry state", () => {
    expect(getModelCapacityRetry([item()], runId)).toEqual(retry);
    expect(getModelCapacityRetry([item()], null)).toBeNull();
    expect(getModelCapacityRetry([item("running", RunId.make("old-run"))], runId)).toBeNull();
    expect(getModelCapacityRetry([item(), item("completed")], runId)).toBeNull();
    expect(getModelCapacityRetry([item("running", runId, null)], runId)).toEqual({
      ...retry,
      retryAt: null,
    });
    expect(
      getModelCapacityRetry([{ ...item(), failure: { ...item().failure, code: "other" } }], runId),
    ).toBeNull();
  });

  it("counts down from the server deadline, rounding up and never going negative", () => {
    expect(capacityRetryLabel(retry, Date.parse("2026-10-01T10:00:00.000Z"))).toContain("10s");
    expect(capacityRetryLabel(retry, Date.parse("2026-10-01T10:00:09.100Z"))).toContain("1s");
    expect(capacityRetryLabel(retry, Date.parse("2026-10-01T10:00:20.000Z"))).toBe(
      "Retrying model (attempt 1)…",
    );
    expect(capacityRetryLabel({ ...retry, retryAt: null }, 0)).toBe("Retrying model (attempt 1)…");
  });
});

import { EventId, TurnId, type OrchestrationThreadActivity } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";
import { capacityRetryLabel, getModelCapacityRetry } from "./modelCapacityRetry";

const turnId = TurnId.make("turn-1");
const retry = { attempt: 1, retryAt: "2026-10-01T10:00:10.000Z" };
function activity(payload: unknown, id = turnId): OrchestrationThreadActivity {
  return {
    id: EventId.make("retry-event"),
    turnId: id,
    kind: "runtime.warning",
    tone: "info",
    summary: "Model at capacity",
    payload,
    createdAt: "2026-10-01T10:00:00.000Z",
  };
}

describe("capacity retry presentation", () => {
  it("shows only the active turn's latest valid retry state", () => {
    expect(getModelCapacityRetry([activity({ capacityRetry: retry })], turnId)).toEqual(retry);
    expect(getModelCapacityRetry([activity({ capacityRetry: retry })], null)).toBeNull();
    expect(
      getModelCapacityRetry([activity({ capacityRetry: retry }, TurnId.make("old-turn"))], turnId),
    ).toBeNull();
    expect(
      getModelCapacityRetry(
        [activity({ capacityRetry: retry }), activity({ capacityRetry: null })],
        turnId,
      ),
    ).toBeNull();
    expect(
      getModelCapacityRetry(
        [activity({ capacityRetry: { attempt: 0, retryAt: "bad-date" } })],
        turnId,
      ),
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

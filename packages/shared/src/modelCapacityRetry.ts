import {
  ModelCapacityRetry,
  type OrchestrationThreadActivity,
  type TurnId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const isCapacityRetry = Schema.is(
  Schema.Struct({ capacityRetry: Schema.NullOr(ModelCapacityRetry) }),
);

export function getModelCapacityRetry(
  activities: readonly OrchestrationThreadActivity[],
  activeTurnId: TurnId | null | undefined,
) {
  if (!activeTurnId) return null;
  for (let index = activities.length - 1; index >= 0; index--) {
    const activity = activities[index]!;
    if (
      activity.turnId === activeTurnId &&
      activity.kind === "runtime.warning" &&
      isCapacityRetry(activity.payload)
    ) {
      return activity.payload.capacityRetry;
    }
  }
  return null;
}

export function capacityRetryLabel(retry: ModelCapacityRetry, now: number) {
  if (retry.retryAt === null) return `Retrying model (attempt ${retry.attempt})…`;
  const seconds = Math.max(0, Math.ceil((Date.parse(retry.retryAt) - now) / 1_000));
  return seconds === 0
    ? `Retrying model (attempt ${retry.attempt})…`
    : `Model at capacity. Retrying in ${seconds}s (attempt ${retry.attempt}).`;
}

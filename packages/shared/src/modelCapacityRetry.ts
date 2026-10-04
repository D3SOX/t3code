import { ModelCapacityRetry, type OrchestrationV2TurnItem, type RunId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export function getModelCapacityRetry(
  items: readonly OrchestrationV2TurnItem[],
  activeRunId: RunId | null | undefined,
) {
  if (!activeRunId) return null;
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!;
    if (
      item.runId === activeRunId &&
      item.type === "error" &&
      item.failure.code === "serverOverloaded" &&
      item.retry !== undefined
    ) {
      return item.status !== "running"
        ? null
        : {
            attempt: item.retry.attempt,
            retryAt:
              item.retry.retryDelayMs === null
                ? null
                : DateTime.formatIso(
                    DateTime.makeUnsafe(
                      DateTime.toEpochMillis(item.updatedAt) + item.retry.retryDelayMs,
                    ),
                  ),
          };
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

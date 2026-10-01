import type { CodexThreadTurnSnapshot } from "./CodexSessionRuntime.ts";

// The failed native turn retains the prompt. Its promptless retries belong to
// the same T3 turn, including after a restart when only native history remains.
export function groupCodexCapacityRetries(turns: readonly CodexThreadTurnSnapshot[]) {
  const groups: Array<{ turn: CodexThreadTurnSnapshot; nativeCount: number }> = [];
  for (const turn of turns) {
    const prior = groups.at(-1);
    if (
      prior?.turn.capacityFailure &&
      !turn.items.some((item) => item.type === "userMessage" && item.content.length > 0)
    ) {
      prior.nativeCount++;
      prior.turn = { ...turn, id: prior.turn.id, items: [...prior.turn.items, ...turn.items] };
    } else {
      groups.push({ turn, nativeCount: 1 });
    }
  }
  return groups;
}

import type { ScopedThreadRef } from "@t3tools/contracts";

type SettleAndAdvance = (threadRef: ScopedThreadRef) => void;

// The mounted sidebar registers its settle action so other entry points share
// its navigation behavior.
let registeredSettleAndAdvance: SettleAndAdvance | null = null;

/**
 * Called by the thread sidebar while it is mounted. Returns the unregister
 * function, which leaves a newer registration in place.
 */
export function registerSettleAndAdvance(handler: SettleAndAdvance): () => void {
  registeredSettleAndAdvance = handler;
  return () => {
    if (registeredSettleAndAdvance === handler) registeredSettleAndAdvance = null;
  };
}

/** False means no sidebar is mounted; settle in place. */
export function settleAndAdvance(threadRef: ScopedThreadRef): boolean {
  if (!registeredSettleAndAdvance) return false;
  registeredSettleAndAdvance(threadRef);
  return true;
}

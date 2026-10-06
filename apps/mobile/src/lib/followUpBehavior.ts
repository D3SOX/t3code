import type {
  ActiveTurnComposerAction,
  ComposerDispatchMode,
} from "@t3tools/client-runtime/state/composer-dispatch";

/**
 * What the send button does while a turn is already running: `queue` waits for
 * the turn to finish, `next-tool` steers after a tool finishes, and `steer` sends immediately.
 *
 * Web keeps the same choice in its per-client settings. Mobile has no
 * client-settings sync, so it is stored per device alongside the other
 * composer preferences.
 */
export type FollowUpBehavior = Extract<ActiveTurnComposerAction, "queue" | "next-tool" | "steer">;

export const DEFAULT_FOLLOW_UP_BEHAVIOR: FollowUpBehavior = "next-tool";

/** Capture the selected timing before the outbox persists the message. */
export function resolveMobileFollowUpDispatchMode(input: {
  readonly running: boolean;
  readonly canSteer: boolean;
  readonly preference: FollowUpBehavior;
  readonly override?: ActiveTurnComposerAction;
}): ComposerDispatchMode | undefined {
  if (!input.running) return undefined;
  if (!input.canSteer) return "queue";
  const action = input.override ?? input.preference;
  // Auto steers a live turn and safely queues if it ends before delivery.
  return action === "steer" ? "auto" : action;
}

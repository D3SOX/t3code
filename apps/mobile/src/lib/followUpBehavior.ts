import type {
  ActiveTurnComposerAction,
  ComposerDispatchMode,
} from "@t3tools/client-runtime/state/composer-dispatch";

/** Mobile stores follow-up timing per device, separately from web settings. */
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

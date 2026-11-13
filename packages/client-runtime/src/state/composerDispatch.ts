/**
 * How a composer submission is delivered when the thread already has a turn in
 * flight. Shared by web (where the alternate is Mod+Enter) and mobile (where it
 * is a long-press on the send button), so both clients agree on what the user's
 * configured follow-up behavior means.
 */
export type ComposerDispatchMode = "auto" | "queue" | "next-tool" | "steer" | "restart";
export type ActiveTurnComposerAction = Exclude<ComposerDispatchMode, "auto">;

/** The alternate queues after the next tool for Queue, or after the turn otherwise. */
export function resolveComposerDispatchMode(input: {
  /** A turn is in flight, so the follow-up has to queue behind it or steer it. */
  readonly running: boolean;
  readonly alternateModifier: boolean;
  readonly activeTurnDefault?: ActiveTurnComposerAction;
  /** False while the active turn cannot take steering input, such as an explicit /compact. */
  readonly canSteer?: boolean;
}): ComposerDispatchMode {
  if (!input.running) return "auto";
  if (input.canSteer === false) return "queue";
  const defaultAction = input.activeTurnDefault ?? "steer";
  if (input.alternateModifier) return defaultAction === "queue" ? "next-tool" : "queue";
  return defaultAction;
}

// Automatic compaction takes steers only where the provider says a steer leaves it running.
export function compactionBlocksSteering(input: {
  readonly compactCommandIsActive: boolean;
  readonly compactionRunning: boolean;
  readonly steersDuringCompaction: boolean;
  readonly run: { readonly userMessageId: string } | undefined;
  readonly messages:
    | ReadonlyArray<{
        readonly id: string;
        readonly text: string;
        readonly attachments?: ReadonlyArray<unknown>;
      }>
    | undefined;
}): boolean {
  if (input.compactCommandIsActive) return true;
  if (!input.compactionRunning) return false;
  if (!input.steersDuringCompaction) return true;
  if (input.run === undefined) return false;
  const message = input.messages?.find((message) => message.id === input.run?.userMessageId);
  return (
    (message?.attachments?.length ?? 0) === 0 &&
    /^\/compact(?:\s|$)/i.test(message?.text.trim() ?? "")
  );
}

/** What the alternate would do, for labelling the affordance that triggers it. */
export function alternateComposerDispatchAction(
  activeTurnDefault?: ActiveTurnComposerAction,
): ActiveTurnComposerAction {
  return resolveComposerDispatchMode({
    running: true,
    alternateModifier: true,
    ...(activeTurnDefault === undefined ? {} : { activeTurnDefault }),
  }) as ActiveTurnComposerAction;
}

import {
  EventId,
  ProviderDriverKind,
  type ProviderEvent,
  type ProviderRuntimeEvent,
  type TurnId,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as CodexSchema from "effect-codex-app-server/schema";
import { isCodexCapacityError } from "./codexCapacityError.ts";
import type {
  CodexSessionRuntimeSendTurnInput,
  CodexSessionRuntimeShape,
} from "./CodexSessionRuntime.ts";

type RetryTurn = {
  input: CodexSessionRuntimeSendTurnInput;
  logicalId?: TurnId;
  nativeId?: TurnId;
  attempt: number;
  waiting: boolean;
  showingRetry?: boolean;
  fiber?: Fiber.Fiber<void, never>;
};

// Promptless continuation retries the context Codex already accepted, rather
// than inserting a second copy of the user's message into its native history.
export function makeCodexCapacityRetry(
  runtime: CodexSessionRuntimeShape,
  scope: Scope.Scope,
  emit: (event: ProviderRuntimeEvent) => Effect.Effect<unknown>,
) {
  const turns = new Map<TurnId, RetryTurn>();
  const starting: RetryTurn[] = [];
  const decodeError = Schema.decodeUnknownOption(CodexSchema.V2ErrorNotification);
  const decodeCompleted = Schema.decodeUnknownOption(CodexSchema.V2TurnCompletedNotification);

  function forget(turn: RetryTurn) {
    for (const [id, tracked] of turns) if (tracked === turn) turns.delete(id);
    const index = starting.indexOf(turn);
    if (index !== -1) starting.splice(index, 1);
  }

  const start = Effect.fn("codexCapacityRetry.start")(function* (turn: RetryTurn, retry: boolean) {
    starting.push(turn);
    const { input: _input, attachments: _attachments, ...continuation } = turn.input;
    const result = yield* runtime
      .sendTurn(retry ? continuation : turn.input)
      .pipe(Effect.onError(() => Effect.sync(() => forget(turn))));
    turn.logicalId ??= result.turnId;
    turn.nativeId = result.turnId;
    if (result.turnId) turns.set(result.turnId, turn);
    const index = starting.indexOf(turn);
    if (index !== -1) starting.splice(index, 1);
    return { ...result, turnId: turn.logicalId };
  });

  const abort = Effect.fn("codexCapacityRetry.abort")(function* (turn: RetryTurn) {
    forget(turn);
    if (turn.fiber) yield* Fiber.interrupt(turn.fiber);
    yield* emit({
      eventId: EventId.make(`${turn.logicalId}:capacity:cancelled:${turn.attempt}`),
      provider: ProviderDriverKind.make("codex"),
      threadId: (yield* runtime.getSession).threadId,
      createdAt: DateTime.formatIso(yield* DateTime.now),
      ...(turn.logicalId ? { turnId: turn.logicalId } : {}),
      type: "turn.aborted",
      payload: { reason: "Capacity retry cancelled" },
    });
  });

  const cancelTimers = Effect.fn("codexCapacityRetry.cancelTimers")(function* () {
    const active = new Set([...turns.values(), ...starting]);
    turns.clear();
    starting.length = 0;
    for (const tracked of active) if (tracked.fiber) yield* Fiber.interrupt(tracked.fiber);
  });

  const mapEvent = Effect.fn("codexCapacityRetry.mapEvent")(function* (event: ProviderEvent) {
    let turn = event.turnId ? turns.get(event.turnId) : undefined;
    if (!turn && event.method === "turn/started" && event.turnId && starting[0]) {
      turn = starting[0];
      turn.logicalId ??= event.turnId;
      turn.nativeId = event.turnId;
      turns.set(event.turnId, turn);
      starting.shift();
    }
    if (event.method === "session/exited" || event.method === "session/closed") {
      yield* cancelTimers();
    }
    if (!turn) return event;
    if (
      (event.method === "turn/completed" || event.method === "turn/aborted") &&
      event.turnId !== turn.nativeId
    )
      return null;
    // Codex creates a new native turn for each continuation, but T3 must keep
    // one turn for its user message, checkpoints, completion and Stop action.
    const mapped = { ...event, ...(turn.logicalId ? { turnId: turn.logicalId } : {}) };
    if (
      turn.showingRetry &&
      !turn.waiting &&
      event.turnId === turn.nativeId &&
      event.method === "item/started"
    ) {
      turn.showingRetry = false;
      yield* emit({
        eventId: EventId.make(`${event.id}:capacity:resumed`),
        provider: event.provider,
        threadId: event.threadId,
        createdAt: DateTime.formatIso(yield* DateTime.now),
        ...(turn.logicalId ? { turnId: turn.logicalId } : {}),
        type: "runtime.warning",
        payload: { message: "Model available. Resuming work.", capacityRetry: null },
      });
    }
    if (event.method === "error") {
      const payload = decodeError(event.payload);
      if (
        payload._tag === "Some" &&
        !payload.value.willRetry &&
        isCodexCapacityError(payload.value.error)
      )
        return null;
    }
    if (event.method === "turn/completed") {
      const payload = decodeCompleted(event.payload);
      if (
        payload._tag === "Some" &&
        payload.value.turn.status === "failed" &&
        isCodexCapacityError(payload.value.turn.error)
      ) {
        if (turn.waiting || event.turnId !== turn.nativeId) return null;
        turn.waiting = true;
        turn.showingRetry = true;
        const tracked = turn;
        const delay = 10_000 * 2 ** tracked.attempt++;
        const retryAt = DateTime.formatIso(
          DateTime.makeUnsafe((yield* Clock.currentTimeMillis) + delay),
        );
        const warning = Effect.fn("codexCapacityRetry.warning")(function* (retryAt: string | null) {
          return yield* emit({
            eventId: EventId.make(
              `${event.id}:capacity:${retryAt === null ? "starting" : "scheduled"}`,
            ),
            provider: event.provider,
            threadId: event.threadId,
            createdAt: DateTime.formatIso(yield* DateTime.now),
            ...(tracked.logicalId ? { turnId: tracked.logicalId } : {}),
            type: "runtime.warning",
            payload: {
              message: "Selected model is at capacity.",
              capacityRetry: { attempt: tracked.attempt, retryAt },
            },
          });
        });
        yield* warning(retryAt);
        tracked.fiber = yield* Effect.gen(function* () {
          yield* Effect.sleep(delay);
          tracked.waiting = false;
          yield* warning(null);
          yield* start(tracked, true).pipe(
            Effect.catch((error) =>
              Effect.gen(function* () {
                forget(tracked);
                yield* emit({
                  eventId: EventId.make(`${event.id}:capacity:failed`),
                  provider: event.provider,
                  threadId: event.threadId,
                  createdAt: DateTime.formatIso(yield* DateTime.now),
                  ...(tracked.logicalId ? { turnId: tracked.logicalId } : {}),
                  type: "turn.completed",
                  payload: { state: "failed", errorMessage: error.message },
                });
              }),
            ),
          );
        }).pipe(Effect.forkIn(scope));
        return null;
      }
      forget(turn);
    } else if (event.method === "turn/aborted") forget(turn);
    return mapped;
  });

  return {
    cancelTimers,
    mapEvent,
    sendTurn: Effect.fn("codexCapacityRetry.sendTurn")(function* (
      input: CodexSessionRuntimeSendTurnInput,
    ) {
      for (const turn of new Set(turns.values())) if (turn.waiting) yield* abort(turn);
      return yield* start({ input, attempt: 0, waiting: false }, false);
    }),
    interruptTurn: Effect.fn("codexCapacityRetry.interruptTurn")(function* (id?: TurnId) {
      const turn = [...turns.values()].find((turn) => id === undefined || turn.logicalId === id);
      if (turn?.waiting) return yield* abort(turn);
      yield* runtime.interruptTurn(turn?.nativeId ?? id);
    }),
    getSession: runtime.getSession.pipe(
      Effect.map((session) => {
        const turn = [...turns.values()].find(
          (turn) => turn.waiting || turn.nativeId === session.activeTurnId,
        );
        return turn
          ? {
              ...session,
              status: "running" as const,
              activeTurnId: turn.logicalId,
              lastError: undefined,
            }
          : session;
      }),
    ),
  };
}

import {
  AgentSessionRebindError,
  ProviderDriverKind,
  type AgentSessionRebindInput,
  type OrchestrationThreadShell,
  type ProviderSession,
  type ProviderSessionStartInput,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";

import type { ProviderRuntimeBinding } from "../provider/Services/ProviderSessionDirectory.ts";

interface RebindDependencies {
  readonly snapshots: {
    readonly getThreadShellById: (
      threadId: ThreadId,
    ) => Effect.Effect<
      Option.Option<Pick<OrchestrationThreadShell, "session" | "modelSelection" | "runtimeMode">>,
      Error
    >;
  };
  readonly directory: {
    readonly getBinding: (
      threadId: ThreadId,
    ) => Effect.Effect<Option.Option<ProviderRuntimeBinding>, Error>;
  };
  readonly provider: {
    readonly startSession: (
      threadId: ThreadId,
      input: ProviderSessionStartInput,
    ) => Effect.Effect<Pick<ProviderSession, "resumeCursor">, Error>;
  };
}

function codexSessionId(cursor: unknown): string | undefined {
  if (typeof cursor !== "object" || cursor === null || !("threadId" in cursor)) {
    return undefined;
  }
  return typeof cursor.threadId === "string" ? cursor.threadId : undefined;
}

/** Rebind one idle T3 thread without touching its stored conversation or writing SQLite directly. */
export const rebindCodexSession = Effect.fn("rebindCodexSession")(function* (
  input: AgentSessionRebindInput,
  deps: RebindDependencies,
) {
  const thread = Option.getOrUndefined(
    yield* deps.snapshots
      .getThreadShellById(input.threadId)
      .pipe(Effect.mapError(() => new AgentSessionRebindError({ reason: "resume-failed" }))),
  );
  const binding = Option.getOrUndefined(
    yield* deps.directory
      .getBinding(input.threadId)
      .pipe(Effect.mapError(() => new AgentSessionRebindError({ reason: "resume-failed" }))),
  );
  if (
    !thread ||
    thread.session?.status !== "ready" ||
    thread.session.activeTurnId !== null ||
    thread.session.providerName !== "codex" ||
    binding?.provider !== "codex" ||
    binding.providerInstanceId === undefined ||
    binding.providerInstanceId !== thread.session.providerInstanceId ||
    binding.providerInstanceId !== thread.modelSelection.instanceId
  ) {
    return yield* new AgentSessionRebindError({ reason: "thread-not-idle" });
  }
  if (
    codexSessionId(binding.resumeCursor) !== input.expectedCurrentSessionId ||
    input.targetSessionId === input.expectedCurrentSessionId
  ) {
    return yield* new AgentSessionRebindError({ reason: "binding-changed" });
  }

  const start = (sessionId: string) =>
    deps.provider.startSession(input.threadId, {
      threadId: input.threadId,
      provider: ProviderDriverKind.make("codex"),
      providerInstanceId: binding.providerInstanceId,
      modelSelection: thread.modelSelection,
      runtimeMode: thread.runtimeMode,
      resumeCursor: { threadId: sessionId },
    });
  const attempt = yield* Effect.result(start(input.targetSessionId));
  if (
    Result.isSuccess(attempt) &&
    codexSessionId(attempt.success.resumeCursor) === input.targetSessionId
  ) {
    return { sessionId: input.targetSessionId };
  }

  // Codex can silently start a fresh thread when resume says the old one is
  // missing. Restore the expected writer; its persisted cursor is never lost.
  yield* start(input.expectedCurrentSessionId).pipe(Effect.catch(() => Effect.void));
  return yield* new AgentSessionRebindError({ reason: "resume-failed" });
});

import { assert, it, vi } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId, ThreadId, TurnId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { ProviderAdapterRequestError } from "../provider/Errors.ts";
import { rebindCodexSession } from "./AgentSessionRebinder.ts";

const threadId = ThreadId.make("thread-to-rebind");
const instanceId = ProviderInstanceId.make("codex");
const currentSessionId = "recent-native-session";
const targetSessionId = "original-native-session";
const input = { threadId, expectedCurrentSessionId: currentSessionId, targetSessionId };

function fixture(options?: {
  readonly activeTurn?: boolean;
  readonly currentSessionId?: string;
  readonly resumeTargetAs?: string;
  readonly failTarget?: boolean;
}) {
  const starts = vi.fn((_: typeof threadId, start: { readonly resumeCursor?: unknown }) => {
    if (
      options?.failTarget &&
      typeof start.resumeCursor === "object" &&
      start.resumeCursor !== null &&
      "threadId" in start.resumeCursor &&
      start.resumeCursor.threadId === targetSessionId
    ) {
      return Effect.fail(
        new ProviderAdapterRequestError({
          provider: ProviderDriverKind.make("codex"),
          method: "startSession",
          detail: "Codex could not resume the target",
        }),
      );
    }
    return Effect.succeed({
      resumeCursor:
        start.resumeCursor &&
        typeof start.resumeCursor === "object" &&
        "threadId" in start.resumeCursor &&
        start.resumeCursor.threadId === targetSessionId &&
        options?.resumeTargetAs
          ? { threadId: options.resumeTargetAs }
          : start.resumeCursor,
    });
  });
  return {
    starts,
    deps: {
      snapshots: {
        getThreadShellById: () =>
          Effect.succeedSome({
            modelSelection: { instanceId, model: "default" },
            runtimeMode: "full-access" as const,
            session: {
              threadId,
              status: "ready" as const,
              providerName: "codex",
              providerInstanceId: instanceId,
              runtimeMode: "full-access" as const,
              activeTurnId: options?.activeTurn ? TurnId.make("active-turn") : null,
              lastError: null,
              updatedAt: "2026-09-29T00:00:00.000Z",
            },
          }),
      },
      directory: {
        getBinding: () =>
          Effect.succeedSome({
            threadId,
            provider: ProviderDriverKind.make("codex"),
            providerInstanceId: instanceId,
            status: "running" as const,
            resumeCursor: { threadId: options?.currentSessionId ?? currentSessionId },
          }),
      },
      provider: { startSession: starts },
    },
  };
}

it.effect("reattaches the old Codex session to the idle T3 thread", () =>
  Effect.gen(function* () {
    const { deps, starts } = fixture();
    const result = yield* rebindCodexSession(input, deps);
    assert.equal(result.sessionId, targetSessionId);
    assert.deepEqual(starts.mock.calls[0]?.[1].resumeCursor, { threadId: targetSessionId });
  }),
);

it.effect("refuses to overwrite a changed session link", () =>
  Effect.gen(function* () {
    const { deps, starts } = fixture({ currentSessionId: "another-session" });
    const error = yield* Effect.flip(rebindCodexSession(input, deps));
    assert.equal(error.reason, "binding-changed");
    assert.equal(starts.mock.calls.length, 0);
  }),
);

it.effect("refuses to rebind during an active turn", () =>
  Effect.gen(function* () {
    const { deps, starts } = fixture({ activeTurn: true });
    const error = yield* Effect.flip(rebindCodexSession(input, deps));
    assert.equal(error.reason, "thread-not-idle");
    assert.equal(starts.mock.calls.length, 0);
  }),
);

it.effect("restores the newer writer if Codex silently starts a fresh session", () =>
  Effect.gen(function* () {
    const { deps, starts } = fixture({ resumeTargetAs: "unexpected-new-session" });
    const error = yield* Effect.flip(rebindCodexSession(input, deps));
    assert.equal(error.reason, "resume-failed");
    assert.deepEqual(
      starts.mock.calls.map((call) => call[1].resumeCursor),
      [{ threadId: targetSessionId }, { threadId: currentSessionId }],
    );
  }),
);

it.effect("restores the newer writer if Codex rejects the old session", () =>
  Effect.gen(function* () {
    const { deps, starts } = fixture({ failTarget: true });
    const error = yield* Effect.flip(rebindCodexSession(input, deps));
    assert.equal(error.reason, "resume-failed");
    assert.deepEqual(
      starts.mock.calls.map((call) => call[1].resumeCursor),
      [{ threadId: targetSessionId }, { threadId: currentSessionId }],
    );
  }),
);

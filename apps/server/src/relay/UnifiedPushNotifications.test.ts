import { describe, expect, it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import webPush from "web-push";
import {
  AuthOrchestrationReadScope,
  AuthSessionId,
  EnvironmentId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  ThreadId,
  type AuthClientSession,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as SessionStore from "../auth/SessionStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as UnifiedPushNotifications from "./UnifiedPushNotifications.ts";

const threadId = ThreadId.make("push-thread");
const projectId = ProjectId.make("push-project");
const sessionId = AuthSessionId.make("push-session");
const now = DateTime.makeUnsafe("2026-10-24T12:00:00Z");
function shell(overrides: Partial<OrchestrationV2ThreadShell> = {}): OrchestrationV2ThreadShell {
  return {
    id: threadId,
    projectId,
    title: "Finish work",
    providerInstanceId: ProviderInstanceId.make("codex"),
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "test" },
    runtimeMode: "full-access",
    interactionMode: "default",
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "mobile",
    activeRunId: null,
    latestVisibleMessage: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    lastVisitedAt: null,
    deletedAt: null,
    branch: null,
    linkedPullRequest: null,
    status: "completed",
    activityRunStatus: null,
    pendingRuntimeRequest: null,
    pendingBackgroundTasks: [],
    latestRunId: RunId.make("run-1"),
    latestRunRequestedAt: null,
    latestRunStartedAt: now,
    latestRunCompletedAt: now,
    latestUserMessageAt: now,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    snoozedUntil: null,
    snoozedAt: null,
    pinnedAt: null,
    ...overrides,
  };
}
const subscription = {
  deviceId: "device-1",
  endpoint: "https://push.example.test/endpoint",
  publicKey: webPush.generateVAPIDKeys().publicKey,
  auth: Buffer.alloc(16, 1).toString("base64url"),
};
const makeHarness = Effect.fn("UnifiedPushTest.makeHarness")(function* () {
  yield* TestClock.setTime(DateTime.makeUnsafe("2026-10-24T11:00:00Z").epochMilliseconds);
  const secretBytes = new Map<string, Uint8Array>();
  const current = yield* Ref.make(shell());
  const active = yield* Ref.make<readonly AuthClientSession[]>([
    {
      sessionId,
      subject: "mobile",
      scopes: [AuthOrchestrationReadScope],
      method: "bearer-access-token",
      client: { deviceType: "mobile" },
      issuedAt: now,
      expiresAt: DateTime.makeUnsafe("2099-01-01T00:00:00Z"),
      lastConnectedAt: now,
      connected: false,
      current: false,
    },
  ]);
  const requests: { headers: Headers; body: Uint8Array }[] = [];
  const responses = yield* Queue.unbounded<number>();
  let status = 201;
  const fetch = Object.assign(
    (_input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        headers: new Headers(init?.headers),
        body: new Uint8Array(init?.body as ArrayBuffer),
      });
      Queue.offerUnsafe(responses, status);
      return Promise.resolve(new Response(null, { status }));
    },
    { preconnect: () => {} },
  );
  const dependencies = Layer.mergeAll(
    NodeCrypto.layer,
    Layer.succeed(FetchHttpClient.Fetch, fetch),
    Layer.mock(ServerSecretStore.ServerSecretStore)({
      get: (key) => Effect.succeed(Option.fromNullishOr(secretBytes.get(key))),
      set: (key, value) =>
        Effect.sync(() => {
          secretBytes.set(key, value);
        }),
    }),
    Layer.mock(SessionStore.SessionStore)({
      cookieName: "test",
      legacyCookieName: undefined,
      listActive: () => Ref.get(active),
    }),
    Layer.mock(ServerEnvironment.ServerEnvironment)({
      getEnvironmentId: Effect.succeed(EnvironmentId.make("host")),
    }),
    Layer.mock(ThreadManagement.ThreadManagementService)({
      getThreadShell: () => Ref.get(current),
    }),
    Layer.mock(ProjectService.ProjectService)({
      getById: () =>
        Effect.succeedSome({
          id: projectId,
          title: "Project",
          workspaceRoot: "/project",
          defaultModelSelection: null,
          scripts: [],
          createdAt: "2026-10-24T12:00:00Z",
          updatedAt: "2026-10-24T12:00:00Z",
          deletedAt: null,
        }),
    }),
  );
  const context = yield* Layer.build(
    UnifiedPushNotifications.layer.pipe(Layer.provide(dependencies)),
  );
  const service = Context.get(context, UnifiedPushNotifications.UnifiedPushNotifications);
  const publish = service.publishThread(threadId).pipe(Effect.andThen(service.drain));
  return {
    responses,
    service,
    current,
    active,
    requests,
    publish,
    setStatus: (value: number) => {
      status = value;
    },
  };
});

describe("UnifiedPush host delivery", () => {
  it.effect("retries a transient distributor failure without needing another thread event", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      yield* h.service.subscribe(sessionId, subscription);
      h.setStatus(503);
      yield* h.service.publishThread(threadId);
      expect(yield* Queue.take(h.responses)).toBe(503);
      h.setStatus(201);
      yield* TestClock.adjust("2 seconds");
      yield* h.service.drain;
      expect(h.requests).toHaveLength(2);
    }).pipe(Effect.scoped),
  );
  it.effect("encrypts direct delivery, keeps VAPID stable, and sends once per completed run", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const key = yield* h.service.getConfig();
      expect((yield* h.service.getConfig()).publicKey).toBe(key.publicKey);
      yield* h.service.subscribe(sessionId, subscription);
      yield* h.publish;
      yield* Ref.update(h.current, (thread) => ({
        ...thread,
        title: "Renamed",
        updatedAt: DateTime.makeUnsafe("2026-10-24T12:01:00Z"),
      }));
      yield* h.publish;
      expect(h.requests).toHaveLength(1);
      expect(h.requests[0]?.headers.get("content-encoding")).toBe("aes128gcm");
      expect(h.requests[0]?.headers.get("authorization")).toContain("vapid ");
      expect(h.requests[0]?.body.length).toBeGreaterThan(100);
      expect(new TextDecoder().decode(h.requests[0]?.body)).not.toContain("Finish work");
      yield* Ref.update(h.current, (thread) => ({ ...thread, latestRunId: RunId.make("run-2") }));
      yield* h.publish;
      expect(h.requests).toHaveLength(2);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "does not notify for silent completions, stopped work, old runs, or revoked sessions",
    () =>
      Effect.gen(function* () {
        const h = yield* makeHarness();
        yield* h.service.subscribe(sessionId, subscription);
        for (const override of [
          { latestRunCompletionSilent: true },
          { latestRunStopRequested: true },
          { latestRunUserMessageId: MessageId.make("message:pr-watch:wake") },
          { latestRunCompletedAt: DateTime.makeUnsafe("1969-01-01T00:00:00Z") },
          { status: "queued" as const },
        ]) {
          yield* Ref.set(h.current, shell(override));
          yield* h.publish;
        }
        yield* Ref.set(h.current, shell());
        yield* Ref.set(h.active, []);
        yield* h.publish;
        expect(h.requests).toHaveLength(0);
      }).pipe(Effect.scoped),
  );

  it.effect("removes expired endpoints and limits unsubscribe to the owning session", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      yield* h.service.subscribe(sessionId, subscription);
      yield* h.service.unsubscribe(AuthSessionId.make("another-session"), subscription.deviceId);
      h.setStatus(410);
      yield* h.publish;
      expect(h.requests).toHaveLength(1);
      yield* Ref.set(h.current, shell({ latestRunId: RunId.make("run-2") }));
      yield* h.publish;
      expect(h.requests).toHaveLength(1);
    }).pipe(Effect.scoped),
  );
});

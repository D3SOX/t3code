import webPush from "web-push";
import {
  AuthOrchestrationReadScope,
  AuthSessionId,
  PushNotificationError,
  PushSubscriptionInput,
  type ThreadId,
} from "@t3tools/contracts";
import { projectThreadAwarenessV2 } from "@t3tools/shared/agentAwareness";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Schedule from "effect/Schedule";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as SessionStore from "../auth/SessionStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { forkParked } from "../serverActivation.ts";
import {
  makeAgentAwarenessPublishWorker,
  shouldPublishAgentAwarenessEvent,
} from "./AgentAwarenessRelay.ts";

const StoredSubscription = Schema.Struct({
  ...PushSubscriptionInput.fields,
  sessionId: AuthSessionId,
});
const StoredConfig = Schema.Struct({
  publicKey: Schema.String,
  privateKey: Schema.String,
  subscriptions: Schema.Array(StoredSubscription),
});
const ConfigJson = Schema.fromJsonString(StoredConfig);
const decodeConfig = Schema.decodeUnknownEffect(ConfigJson);
const encodeConfig = Schema.encodeEffect(ConfigJson);
const SECRET = "unified-push";
const encodeData = Schema.encodeSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)),
);
const failure = () =>
  new PushNotificationError({ message: "Could not update push notification registration." });

export class UnifiedPushNotifications extends Context.Service<
  UnifiedPushNotifications,
  {
    readonly getConfig: () => Effect.Effect<{ publicKey: string }, PushNotificationError>;
    readonly subscribe: (
      sessionId: AuthSessionId,
      input: PushSubscriptionInput,
    ) => Effect.Effect<void, PushNotificationError>;
    readonly unsubscribe: (
      sessionId: AuthSessionId,
      deviceId: string,
    ) => Effect.Effect<void, PushNotificationError>;
    readonly publishThread: (threadId: ThreadId) => Effect.Effect<void>;
    readonly drain: Effect.Effect<void>;
    readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  }
>()("t3/relay/UnifiedPushNotifications") {}

const make = Effect.gen(function* () {
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const sessions = yield* SessionStore.SessionStore;
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const projects = yield* ProjectService.ProjectService;
  const http = yield* HttpClient.HttpClient;
  const crypto = yield* Crypto.Crypto;
  const mutex = yield* Semaphore.make(1);
  let config: typeof StoredConfig.Type | undefined;
  const read = Effect.fn("UnifiedPushNotifications.read")(function* () {
    if (config) return config;
    const bytes = yield* secrets.get(SECRET);
    if (Option.isSome(bytes)) {
      config = yield* decodeConfig(new TextDecoder().decode(bytes.value));
    } else {
      const generated = { ...webPush.generateVAPIDKeys(), subscriptions: [] };
      yield* secrets.set(SECRET, new TextEncoder().encode(yield* encodeConfig(generated)));
      config = generated;
    }
    return config;
  });
  const write = Effect.fn("UnifiedPushNotifications.write")(function* (
    next: typeof StoredConfig.Type,
  ) {
    yield* secrets.set(SECRET, new TextEncoder().encode(yield* encodeConfig(next)));
    config = next;
  });
  const getConfig = Effect.fn("UnifiedPushNotifications.getConfig")(
    function* () {
      const stored = yield* read();
      return { publicKey: stored.publicKey };
    },
    mutex.withPermit,
    Effect.mapError(failure),
  );
  const subscribe = Effect.fn("UnifiedPushNotifications.subscribe")(
    function* (sessionId: AuthSessionId, input: PushSubscriptionInput) {
      const stored = yield* read();
      // A refreshed pairing replaces this device's old session without duplicating alerts.
      yield* write({
        ...stored,
        subscriptions: [
          ...stored.subscriptions.filter((s) => s.deviceId !== input.deviceId),
          { ...input, sessionId },
        ],
      });
    },
    mutex.withPermit,
    Effect.mapError(failure),
  );
  const unsubscribe = Effect.fn("UnifiedPushNotifications.unsubscribe")(
    function* (sessionId: AuthSessionId, deviceId: string) {
      const stored = yield* read();
      yield* write({
        ...stored,
        subscriptions: stored.subscriptions.filter(
          (s) => s.sessionId !== sessionId || s.deviceId !== deviceId,
        ),
      });
    },
    mutex.withPermit,
    Effect.mapError(failure),
  );

  const seen = new Map<ThreadId, string>();
  const startedAt = (yield* DateTime.now).epochMilliseconds;
  const publish = Effect.fn("UnifiedPushNotifications.publish")(function* (threadId: ThreadId) {
    const stored = yield* mutex.withPermit(read());
    if (stored.subscriptions.length === 0) return;
    const thread = yield* threads.getThreadShell(threadId);
    if (!thread || thread.archivedAt !== null || thread.deletedAt !== null) return;
    const project = yield* projects.getById(thread.projectId);
    if (Option.isNone(project)) return;
    const state = projectThreadAwarenessV2({
      environmentId: yield* environment.getEnvironmentId,
      project: project.value,
      thread,
    });
    if (
      !state ||
      !["completed", "failed", "waiting_for_input", "waiting_for_approval"].includes(state.phase)
    )
      return;
    const identity = `${state.phase}:${thread.latestRunId ?? ""}:${thread.pendingRuntimeRequest?.id ?? ""}`;
    if (seen.get(threadId) === identity) return;
    if (
      (state.phase === "completed" || state.phase === "failed") &&
      (thread.latestRunCompletedAt == null ||
        thread.latestRunCompletedAt.epochMilliseconds <= startedAt)
    )
      return;
    if (
      state.phase.startsWith("waiting_") &&
      thread.pendingRuntimeRequest &&
      thread.pendingRuntimeRequest.createdAt.epochMilliseconds <= startedAt &&
      !seen.has(threadId)
    )
      return;
    const now = yield* DateTime.now;
    const active = yield* sessions.listActive();
    const permitted = new Set(
      active
        .filter(
          (s) =>
            s.scopes.includes(AuthOrchestrationReadScope) &&
            s.expiresAt.epochMilliseconds > now.epochMilliseconds,
        )
        .map((s) => s.sessionId),
    );
    const alertId = Buffer.from(
      yield* crypto.digest("SHA-256", new TextEncoder().encode(`${threadId}:${identity}`)),
    ).toString("hex");
    const topic = Buffer.from(yield* crypto.digest("SHA-256", new TextEncoder().encode(threadId)))
      .toString("base64url")
      .slice(0, 32);
    for (const subscription of stored.subscriptions) {
      if (!permitted.has(subscription.sessionId)) continue;
      const payload = encodeData({
        t3_kind: "agent_activity",
        device_id: subscription.deviceId,
        user_id: "unifiedpush",
        updated_at: String(now.epochMilliseconds),
        alert_id: alertId,
        alert_title: state.headline,
        alert_body: `${state.threadTitle.slice(0, 180)} · ${state.projectTitle.slice(0, 80)}`,
        alert_path: state.deepLink,
        alert_group: state.environmentId,
      });
      const details = yield* Effect.try(() =>
        webPush.generateRequestDetails(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.publicKey, auth: subscription.auth },
          },
          payload,
          {
            TTL: 600,
            urgency: "high",
            topic,
            vapidDetails: {
              subject: "https://d3sox.me/t3code/",
              publicKey: stored.publicKey,
              privateKey: stored.privateKey,
            },
          },
        ),
      );
      const response = yield* http
        .execute(
          HttpClientRequest.post(details.endpoint).pipe(
            HttpClientRequest.setHeaders(details.headers),
            HttpClientRequest.bodyUint8Array(details.body ?? new Uint8Array()),
          ),
        )
        .pipe(Effect.timeout("10 seconds"));
      if (response.status === 404 || response.status === 410) {
        yield* mutex.withPermit(
          Effect.gen(function* () {
            const latest = yield* read();
            yield* write({
              ...latest,
              subscriptions: latest.subscriptions.filter(
                (s) =>
                  s.deviceId !== subscription.deviceId ||
                  s.endpoint !== subscription.endpoint ||
                  s.sessionId !== subscription.sessionId,
              ),
            });
          }),
        );
      } else if (response.status < 200 || response.status >= 300) {
        return yield* new PushNotificationError({
          message: `Push distributor returned HTTP ${response.status}.`,
        });
      }
    }
    seen.set(threadId, identity);
  });
  const worker = yield* makeAgentAwarenessPublishWorker((threadId) =>
    publish(threadId).pipe(
      Effect.retry({ schedule: Schedule.exponential("2 seconds"), times: 2 }),
      Effect.catch(() =>
        Effect.logWarning("UnifiedPush delivery failed; check distributor connectivity."),
      ),
    ),
  );
  const start = Effect.fn("UnifiedPushNotifications.start")(function* () {
    // Subscribe before activation so completions during startup cannot be missed.
    yield* forkParked(
      threads.streamDomainEvents.pipe(
        Stream.filter(shouldPublishAgentAwarenessEvent),
        Stream.runForEach((event) => worker.enqueue(event.threadId)),
      ),
    );
  });
  return UnifiedPushNotifications.of({
    getConfig,
    subscribe,
    unsubscribe,
    publishThread: worker.enqueue,
    drain: worker.drain,
    start,
  });
});

export const layer = Layer.effect(UnifiedPushNotifications, make).pipe(
  Layer.provide(FetchHttpClient.layer),
);

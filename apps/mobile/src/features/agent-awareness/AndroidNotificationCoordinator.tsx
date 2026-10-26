import { useAtomValue } from "@effect/atom-react";
import { AuthOrchestrationReadScope, type EnvironmentId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { AsyncResult, Atom } from "effect/reactivity";
import * as Option from "effect/Option";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentShell } from "../../state/shell";
import { serverEnvironment } from "../../state/server";
import { readEnvironmentScope } from "../../state/session";
import {
  useRemoteEnvironmentRuntime,
  useSavedRemoteConnections,
} from "../../state/use-remote-environment-registry";
import { loadOrCreateAgentAwarenessDeviceId } from "../../persistence/imperative";
import {
  getAndroidPushState,
  notifyAndroidLocal,
  registerAndroidUnifiedPush,
  resumeAndroidLocalNotifications,
  subscribeAndroidPushState,
} from "./androidNotifications";
import { createLocalNotificationTracker, localAgentActivity } from "./localNotifications";
import type { SavedRemoteConnection } from "../../lib/connection";
import { forgetAndroidUnifiedPushHost } from "./androidNotifications";

export function useAndroidPushState() {
  const [state, setState] = useState(getAndroidPushState);
  const [foregroundRefresh, setForegroundRefresh] = useState(0);
  // oxlint-disable-next-line t3code/react-effect-budget -- Subscribe to native notification and app lifecycle events.
  useEffect(() => {
    const refresh = () => setState(getAndroidPushState());
    const unsubscribe = subscribeAndroidPushState(refresh);
    const appState = AppState.addEventListener("change", (value) => {
      if (value === "active") {
        refresh();
        setForegroundRefresh((value) => value + 1);
      }
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, []);
  return { ...state, foregroundRefresh };
}

const statuses = new Map<EnvironmentId, string>();
const listeners = new Set<() => void>();
export function getUnifiedPushHostStatus(environmentId: EnvironmentId): string {
  return statuses.get(environmentId) ?? "Waiting for host connection";
}
export function subscribeUnifiedPushHostStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function setStatus(environmentId: EnvironmentId, status: string) {
  if (statuses.get(environmentId) === status) return;
  statuses.set(environmentId, status);
  for (const listener of listeners) listener();
}
function registrationError(result: Parameters<typeof squashAtomCommandFailure>[0]): string {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "Host registration failed";
}

function HostNotifications({ connection }: { connection: SavedRemoteConnection }) {
  const { environmentId } = connection;
  const credential = connection.bearerToken ?? connection.dpopAccessToken;
  const state = useAndroidPushState();
  const host = useRemoteEnvironmentRuntime(environmentId);
  const endpoint = state.subscriptions[environmentId];
  const connectionState = host?.connectionState;
  const supported = host?.serverConfig?.environment.capabilities.unifiedPush === true;
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // oxlint-disable-next-line t3code/react-effect-budget -- Load the persisted native device identity for this host.
  useEffect(() => {
    void loadOrCreateAgentAwarenessDeviceId()
      .then(setDeviceId)
      .catch(() => setStatus(environmentId, "Could not load this device's identity"));
  }, [environmentId]);
  // oxlint-disable-next-line t3code/react-effect-budget -- Register the host key with the external UnifiedPush distributor when connected.
  useEffect(() => {
    if (state.transport !== "unifiedpush" || !state.enabled || connectionState !== "connected")
      return;
    if (!supported) {
      setStatus(environmentId, "Update this host to enable UnifiedPush");
      return;
    }
    let cancelled = false;
    void serverEnvironment.pushConfig
      .run(appAtomRegistry, { environmentId, input: {} })
      .then((result) => {
        if (cancelled) return;
        if (AsyncResult.isSuccess(result)) {
          setStatus(environmentId, "Registering with distributor");
          registerAndroidUnifiedPush(environmentId, result.value.publicKey);
        } else setStatus(environmentId, registrationError(result));
      });
    return () => {
      cancelled = true;
    };
  }, [
    environmentId,
    state.transport,
    state.enabled,
    connectionState,
    supported,
    // Retry registration after background network failures even if credentials did not change.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    state.foregroundRefresh,
  ]);
  // oxlint-disable-next-line t3code/react-effect-budget -- Synchronize the distributor endpoint with the connected host.
  useEffect(() => {
    if (
      !state.enabled ||
      state.transport !== "unifiedpush" ||
      connectionState !== "connected" ||
      !supported ||
      !deviceId
    )
      return;
    if (!endpoint?.endpoint || !endpoint.publicKey || !endpoint.auth) return;
    let cancelled = false;
    void serverEnvironment.subscribePush
      .run(appAtomRegistry, {
        environmentId,
        input: {
          deviceId,
          endpoint: endpoint.endpoint,
          publicKey: endpoint.publicKey,
          auth: endpoint.auth,
        },
      })
      .then((result) => {
        if (!cancelled)
          setStatus(
            environmentId,
            AsyncResult.isSuccess(result) ? "Registered" : registrationError(result),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [
    environmentId,
    state.transport,
    state.enabled,
    connectionState,
    supported,
    deviceId,
    endpoint?.endpoint,
    endpoint?.publicKey,
    endpoint?.auth,
    // Rebind after pairing renewal and retry saved endpoints when the app returns.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
    credential,
    state.foregroundRefresh,
  ]);
  return null;
}

function LocalNotifications({ connections }: { connections: readonly SavedRemoteConnection[] }) {
  const state = useAndroidPushState();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const trackers = useRef(
    new Map<EnvironmentId, ReturnType<typeof createLocalNotificationTracker>>(),
  );
  const lastActivity = useRef<string | null>(null);
  const snapshotsAtom = useMemo(
    () =>
      Atom.make((get) =>
        connections.flatMap(({ environmentId }) => {
          const shell = get(environmentShell.stateValueAtom(environmentId));
          return shell.status === "live" &&
            Option.isSome(shell.snapshot) &&
            readEnvironmentScope(environmentId, AuthOrchestrationReadScope)
            ? [{ environmentId, snapshot: shell.snapshot.value }]
            : [];
        }),
      ),
    [connections],
  );
  const snapshots = useAtomValue(snapshotsAtom);
  // oxlint-disable-next-line t3code/react-effect-budget -- Load the persisted native identity before sending local notifications.
  useEffect(() => {
    void loadOrCreateAgentAwarenessDeviceId()
      .then(setDeviceId)
      .catch(() => {});
  }, []);
  // oxlint-disable-next-line t3code/react-effect-budget -- Resume native local alerts when the app returns to the foreground.
  useEffect(() => {
    if (state.transport !== "local" || !state.localEnabled || !deviceId) return;
    const resume = () => {
      if (AppState.currentState === "active") resumeAndroidLocalNotifications(deviceId);
    };
    resume();
    const listener = AppState.addEventListener("change", resume);
    return () => listener.remove();
  }, [state.transport, state.localEnabled, deviceId]);
  // oxlint-disable-next-line t3code/react-effect-budget -- Publish shell transitions and activity to Android notification APIs.
  useEffect(() => {
    const now = Date.now();
    const activity = localAgentActivity(snapshots, now);
    const alerts = snapshots.flatMap(({ environmentId, snapshot }) => {
      let track = trackers.current.get(environmentId);
      if (!track) {
        track = createLocalNotificationTracker();
        trackers.current.set(environmentId, track);
      }
      return track(environmentId, snapshot);
    });
    for (const environmentId of trackers.current.keys()) {
      if (!connections.some((c) => c.environmentId === environmentId))
        trackers.current.delete(environmentId);
    }
    if (state.transport !== "local" || !state.localEnabled || !deviceId) {
      lastActivity.current = null;
      return;
    }
    const data = { ...activity, device_id: deviceId, user_id: "local", updated_at: String(now) };
    const signature = JSON.stringify({
      ...activity,
      activity_expires_at: "",
      enabled: state.localActivityEnabled,
      foregroundRefresh: state.foregroundRefresh,
      deviceId,
    });
    if (!alerts.length && signature !== lastActivity.current) notifyAndroidLocal(data);
    lastActivity.current = signature;
    for (const alert of alerts) notifyAndroidLocal({ ...data, ...alert });
  }, [
    snapshots,
    connections,
    state.transport,
    state.localEnabled,
    state.localActivityEnabled,
    state.foregroundRefresh,
    deviceId,
  ]);
  return null;
}

function ConnectedAndroidNotifications() {
  const { savedConnectionsById, isLoadingSavedConnection } = useSavedRemoteConnections();
  const state = useAndroidPushState();
  // oxlint-disable-next-line t3code/react-effect-budget -- Remove native distributor subscriptions for deleted connections.
  useEffect(() => {
    if (Platform.OS !== "android" || isLoadingSavedConnection) return;
    for (const environmentId of Object.keys(state.subscriptions)) {
      if (!(environmentId in savedConnectionsById)) forgetAndroidUnifiedPushHost(environmentId);
    }
  }, [savedConnectionsById, isLoadingSavedConnection, state.subscriptions]);
  const connections = useMemo(() => Object.values(savedConnectionsById), [savedConnectionsById]);
  return (
    <>
      <LocalNotifications connections={connections} />
      {connections.map((connection) => (
        <HostNotifications key={connection.environmentId} connection={connection} />
      ))}
    </>
  );
}

export function AndroidNotificationCoordinator() {
  return Platform.OS === "android" ? <ConnectedAndroidNotifications /> : null;
}

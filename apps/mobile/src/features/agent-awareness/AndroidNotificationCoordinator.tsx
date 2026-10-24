import { useAtomValue } from "@effect/atom-react";
import { AuthOrchestrationReadScope, type EnvironmentId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";
import { useEffect, useRef, useState } from "react";
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
  subscribeAndroidPushState,
} from "./androidNotifications";
import { createLocalNotificationTracker } from "./localNotifications";
import type { SavedRemoteConnection } from "../../lib/connection";
import { forgetAndroidUnifiedPushHost } from "./androidNotifications";

export function useAndroidPushState() {
  const [state, setState] = useState(getAndroidPushState);
  const [foregroundRefresh, setForegroundRefresh] = useState(0);
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
  const shell = useAtomValue(environmentShell.stateValueAtom(environmentId));
  const tracker = useRef(createLocalNotificationTracker());
  const endpoint = state.subscriptions[environmentId];
  const connectionState = host?.connectionState;
  const supported = host?.serverConfig?.environment.capabilities.unifiedPush === true;
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    void loadOrCreateAgentAwarenessDeviceId()
      .then(setDeviceId)
      .catch(() => setStatus(environmentId, "Could not load this device's identity"));
  }, [environmentId]);
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
  useEffect(() => {
    if (Option.isNone(shell.snapshot)) return;
    const alerts = tracker.current(environmentId, shell.snapshot.value);
    if (
      state.transport !== "local" ||
      !state.localEnabled ||
      !deviceId ||
      !readEnvironmentScope(environmentId, AuthOrchestrationReadScope)
    )
      return;
    for (const alert of alerts)
      notifyAndroidLocal({
        ...alert,
        device_id: deviceId,
        user_id: "local",
        updated_at: String(Date.now()),
      });
  }, [environmentId, shell.snapshot, state.transport, state.localEnabled, deviceId]);
  return null;
}

function ConnectedAndroidNotifications() {
  const { savedConnectionsById, isLoadingSavedConnection } = useSavedRemoteConnections();
  const state = useAndroidPushState();
  useEffect(() => {
    if (Platform.OS !== "android" || isLoadingSavedConnection) return;
    for (const environmentId of Object.keys(state.subscriptions)) {
      if (!(environmentId in savedConnectionsById)) forgetAndroidUnifiedPushHost(environmentId);
    }
  }, [savedConnectionsById, isLoadingSavedConnection, state.subscriptions]);
  return Object.values(savedConnectionsById).map((connection) => (
    <HostNotifications key={connection.environmentId} connection={connection} />
  ));
}

export function AndroidNotificationCoordinator() {
  return Platform.OS === "android" ? <ConnectedAndroidNotifications /> : null;
}

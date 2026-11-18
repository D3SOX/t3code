import { useAtomValue } from "@effect/atom-react";
import { T, useGT } from "gt-react-native";
import type { ReactNode } from "react";
import { useState, useSyncExternalStore } from "react";
import { Linking } from "react-native";
import * as Notifications from "expo-notifications";
import type { EnvironmentId } from "@t3tools/contracts";
import { AppText as Text } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { loadOrCreateAgentAwarenessDeviceId } from "../../persistence/imperative";
import { appAtomRegistry } from "../../state/atom-registry";
import { serverEnvironment } from "../../state/server";
import {
  useSavedRemoteConnections,
  useRemoteConnectionStatus,
} from "../../state/use-remote-environment-registry";
import { environmentServerConfigsAtom } from "../../state/server";
import {
  disableAndroidLocalNotifications,
  disableAndroidUnifiedPush,
  enableAndroidLocalNotifications,
  enableAndroidUnifiedPush,
  setAndroidPushTransport,
  setAndroidLocalBackgroundEnabled,
  setAndroidLocalActivityEnabled,
  type AndroidPushTransport,
} from "../agent-awareness/androidNotifications";
import {
  getUnifiedPushHostStatus,
  subscribeUnifiedPushHostStatus,
  useAndroidPushState,
} from "../agent-awareness/AndroidNotificationCoordinator";
import { SettingsRow } from "./components/SettingsRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { SettingsScreen } from "./components/SettingsScreen";
import { AsyncResult } from "effect/reactivity";

function HostStatus({
  environmentId,
  label,
  error,
}: {
  environmentId: EnvironmentId;
  label: string;
  error?: string;
}) {
  const status = useSyncExternalStore(subscribeUnifiedPushHostStatus, () =>
    getUnifiedPushHostStatus(environmentId),
  );
  const gt = useGT();
  const permission = useAtomValue(serverEnvironment.subscribePush.permissionAtom(environmentId));
  return (
    <SettingsRow
      icon="desktopcomputer"
      label={label}
      value={permission ? (error ?? status) : gt("This connection cannot read threads")}
    />
  );
}

export function AndroidNotificationsSettings({
  fcmSettings,
}: {
  fcmSettings: (header: ReactNode) => ReactNode;
}) {
  const gt = useGT();
  const state = useAndroidPushState();
  const { savedConnectionsById } = useSavedRemoteConnections();
  const { connectedEnvironments } = useRemoteConnectionStatus();
  const configs = useAtomValue(environmentServerConfigsAtom);
  const [busy, setBusy] = useState(false);
  const connections = Object.values(savedConnectionsById);
  async function disable() {
    disableAndroidUnifiedPush();
    disableAndroidLocalNotifications();
    const deviceId = await loadOrCreateAgentAwarenessDeviceId();
    await Promise.all(
      connections
        .filter(
          ({ environmentId }) =>
            configs.get(environmentId)?.environment.capabilities.unifiedPush === true &&
            connectedEnvironments.some(
              (host) =>
                host.environmentId === environmentId && host.connectionState === "connected",
            ) &&
            appAtomRegistry.get(serverEnvironment.unsubscribePush.permissionAtom(environmentId)),
        )
        .map(async ({ environmentId }) => {
          const result = await serverEnvironment.unsubscribePush.run(appAtomRegistry, {
            environmentId,
            input: { deviceId },
          });
          if (AsyncResult.isFailure(result))
            console.warn(
              "Could not remove host push subscription; the local receiver is disabled.",
            );
        }),
    );
  }
  function run(action: () => Promise<void>) {
    setBusy(true);
    void action()
      .catch((error: unknown) =>
        Dialog.alert(
          gt("Notifications unavailable"),
          error instanceof Error ? error.message : gt("Could not change notification settings."),
        ),
      )
      .finally(() => setBusy(false));
  }
  function chooseTransport() {
    Dialog.alert(
      gt("Notification delivery"),
      gt(
        "Local notifications use the app's connection. UnifiedPush uses an installed distributor. FCM requires a build with Firebase configured.",
      ),
      [
        ...(
          [
            [gt("Local", { $context: "notification delivery method" }), "local"],
            ["UnifiedPush", "unifiedpush"],
            ["FCM / microG", "fcm"],
          ] as const
        ).map(([text, transport]) => ({
          text,
          onPress: () =>
            run(async () => {
              await disable();
              setAndroidPushTransport(transport);
            }),
        })),
        { text: gt("Cancel"), style: "cancel" },
      ],
    );
  }
  const names: Record<AndroidPushTransport, string> = {
    local: gt("Local", { $context: "notification delivery method" }),
    unifiedpush: "UnifiedPush",
    fcm: "FCM / microG",
  };
  const header = (
    <SettingsSection title={gt("Delivery")}>
      <SettingsRow
        icon="bell.badge"
        label={gt("Notification delivery")}
        value={names[state.transport]}
        disabled={busy}
        onPress={chooseTransport}
      />
    </SettingsSection>
  );
  if (state.transport === "fcm") return fcmSettings(header);
  async function enable(distributor?: string) {
    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      await Linking.openSettings();
      return;
    }
    const deviceId = await loadOrCreateAgentAwarenessDeviceId();
    if (distributor) enableAndroidUnifiedPush(distributor, deviceId);
    else enableAndroidLocalNotifications(deviceId);
  }
  function pickDistributor() {
    if (!state.distributors.length) {
      Dialog.alert(
        gt("Install a UnifiedPush distributor"),
        gt(
          "Install and open a distributor such as ntfy, then return here to enable notifications.",
        ),
        [
          { text: gt("Cancel"), style: "cancel" },
          {
            text: gt("Setup guide"),
            onPress: () => {
              void Linking.openURL("https://unifiedpush.org/users/distributors/");
            },
          },
        ],
      );
      return;
    }
    Dialog.alert(
      gt("UnifiedPush distributor"),
      gt("Choose the app that will deliver T3 notifications."),
      [
        ...state.distributors.map((distributor) => ({
          text: distributor.label,
          onPress: () => run(() => enable(distributor.id)),
        })),
        { text: gt("Cancel"), style: "cancel" },
      ],
    );
  }
  return (
    <SettingsScreen title={gt("Notifications")}>
      <ScreenScrollView contentContainerClassName="gap-6 px-5 py-4">
        {header}
        <SettingsSection title={gt("Agent notifications")}>
          <SettingsSwitchRow
            icon="bell.badge"
            label={gt("Device notifications")}
            disabled={busy}
            value={state.transport === "unifiedpush" ? state.enabled : state.localEnabled}
            subtitle={
              state.transport === "unifiedpush"
                ? gt(
                    "Encrypted delivery through your distributor. No Google services or T3 Connect account required.",
                  )
                : gt(
                    "Alerts through the app's connection. Enable Background connection to keep receiving them after switching apps.",
                  )
            }
            onValueChange={(enabled) => {
              if (!enabled) run(disable);
              else if (state.transport === "unifiedpush") pickDistributor();
              else run(() => enable());
            }}
          />
          {state.transport === "local" ? (
            <>
              <SettingsSwitchRow
                icon="arrow.clockwise"
                label={gt("Background connection")}
                value={state.backgroundEnabled}
                disabled={busy || !state.localEnabled}
                subtitle={gt(
                  "Keep receiving updates after switching apps. Shows an ongoing notification and stops when you remove T3 from recents.",
                )}
                onValueChange={setAndroidLocalBackgroundEnabled}
              />
              <SettingsSwitchRow
                icon="bell.badge"
                label={gt("Live agent progress")}
                value={state.localActivityEnabled}
                disabled={busy || !state.localEnabled}
                subtitle={gt("Show working agents and input requests in an ongoing activity card.")}
                onValueChange={setAndroidLocalActivityEnabled}
              />
            </>
          ) : null}
          {state.transport === "unifiedpush" ? (
            <SettingsRow
              icon="bell.badge"
              label={gt("Distributor")}
              value={
                state.distributors.find((d) => d.id === state.distributor)?.label ??
                gt("None selected")
              }
              disabled={busy}
              onPress={pickDistributor}
            />
          ) : null}
        </SettingsSection>
        {state.transport === "unifiedpush" && state.enabled ? (
          <SettingsSection title={gt("Hosts")}>
            {connections.map((connection) => (
              <HostStatus
                key={connection.environmentId}
                environmentId={connection.environmentId}
                label={connection.environmentLabel}
                error={state.subscriptions[connection.environmentId]?.error}
              />
            ))}
            {connections.length === 0 ? (
              <Text className="text-foreground-muted">
                <T>Connect a host to register for notifications.</T>
              </Text>
            ) : null}
          </SettingsSection>
        ) : null}
      </ScreenScrollView>
    </SettingsScreen>
  );
}

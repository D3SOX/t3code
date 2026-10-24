import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import { Linking, Platform } from "react-native";

interface AndroidAgentNotifications {
  getUnifiedPushState?(): AndroidPushState;
  setPushTransport?(transport: AndroidPushTransport): void;
  enableUnifiedPush?(distributor: string, deviceId: string, scheme: string): void;
  disableUnifiedPush?(): void;
  registerUnifiedPush?(environmentId: string, vapid: string): void;
  forgetUnifiedPushHost?(environmentId: string): void;
  enableLocalNotifications?(deviceId: string, scheme: string): void;
  disableLocalNotifications?(): void;
  notifyLocal?(data: Record<string, string>): void;
  addListener?(event: "unifiedPushChanged", listener: () => void): { remove(): void };
  configure(deviceId: string, userId: string, scheme: string, ongoingEnabled: boolean): void;
  clear(): void;
  setThreadOnScreen?(path: string | null): void;
  openLiveUpdateSettings?(): boolean;
  showShowcaseActivity?(scheme: string, data: Record<string, string>): void;
}

export type AndroidPushTransport = "local" | "unifiedpush" | "fcm";
interface AndroidPushState {
  transport: AndroidPushTransport;
  enabled: boolean;
  localEnabled: boolean;
  distributor: string | null;
  distributors: readonly { id: string; label: string }[];
  subscriptions: Record<
    string,
    { vapid: string; endpoint?: string; publicKey?: string; auth?: string; error?: string }
  >;
}
export function getAndroidPushState(): AndroidPushState {
  return (
    native?.getUnifiedPushState?.() ?? {
      transport: "fcm",
      enabled: false,
      localEnabled: false,
      distributor: null,
      distributors: [],
      subscriptions: {},
    }
  );
}
export function subscribeAndroidPushState(listener: () => void): () => void {
  const subscription = native?.addListener?.("unifiedPushChanged", listener);
  return () => subscription?.remove();
}
export function setAndroidPushTransport(transport: AndroidPushTransport): void {
  native?.setPushTransport?.(transport);
}
export function enableAndroidUnifiedPush(distributor: string, deviceId: string): void {
  native?.enableUnifiedPush?.(distributor, deviceId, appScheme());
}
export function disableAndroidUnifiedPush(): void {
  native?.disableUnifiedPush?.();
}
export function registerAndroidUnifiedPush(environmentId: string, vapid: string): void {
  native?.registerUnifiedPush?.(environmentId, vapid);
}
export function forgetAndroidUnifiedPushHost(environmentId: string): void {
  native?.forgetUnifiedPushHost?.(environmentId);
}
export function enableAndroidLocalNotifications(deviceId: string): void {
  native?.enableLocalNotifications?.(deviceId, appScheme());
}
export function disableAndroidLocalNotifications(): void {
  native?.disableLocalNotifications?.();
}
export function notifyAndroidLocal(data: Record<string, string>): void {
  native?.notifyLocal?.(data);
}

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<AndroidAgentNotifications>("T3AgentNotifications")
    : null;

export function supportsAndroidAgentNotifications(): boolean {
  return typeof native?.configure === "function" && typeof native?.clear === "function";
}

function appScheme(): string {
  const scheme = Constants.expoConfig?.scheme;
  return (Array.isArray(scheme) ? scheme[0] : scheme) ?? "t3code";
}

export function configureAndroidAgentNotifications(
  deviceId: string,
  userId: string,
  ongoingEnabled: boolean,
): void {
  native?.configure?.(deviceId, userId, appScheme(), ongoingEnabled);
}

export function showAndroidShowcaseAgentActivity(data: Record<string, string>): boolean {
  if (!native?.showShowcaseActivity) return false;
  native.showShowcaseActivity(appScheme(), data);
  return true;
}

export function clearAndroidAgentNotifications(): void {
  native?.clear?.();
}

export function setAndroidThreadOnScreen(path: string | null): void {
  native?.setThreadOnScreen?.(path);
}

export function supportsAndroidLiveUpdateSettings(): boolean {
  return Platform.OS === "android" && Number(Platform.Version) >= 36;
}

export async function openAndroidLiveUpdateSettings(): Promise<void> {
  if (!native?.openLiveUpdateSettings?.()) {
    await Linking.openSettings();
  }
}

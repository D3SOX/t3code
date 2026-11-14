import { requireOptionalNativeModule } from "expo";
import type { SubscriptionUsageSnapshot } from "./subscriptionUsageSnapshot";

export async function publishSubscriptionUsage(snapshot: SubscriptionUsageSnapshot) {
  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  const { default: widget } = await import("./SubscriptionUsage");
  widget.updateSnapshot(snapshot);
  // Android lacks timelines; alarms re-render snapshots at expiry to mark readings stale.
  requireOptionalNativeModule<{ schedule: (name: string, deadlines: number[]) => void }>(
    "T3WidgetExpiry",
  )?.schedule(
    "SubscriptionUsage",
    snapshot.providers.map((provider) => provider.expiresAt).filter((at) => at > 0),
  );
}

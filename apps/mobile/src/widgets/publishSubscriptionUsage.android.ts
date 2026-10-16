import { requireOptionalNativeModule } from "expo";
import type { SubscriptionUsageSnapshot } from "./subscriptionUsageSnapshot";

export async function publishSubscriptionUsage(snapshot: SubscriptionUsageSnapshot) {
  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  const { default: widget } = await import("./SubscriptionUsage");
  widget.updateSnapshot(snapshot);
  // Android has no timeline; an alarm re-renders the stored snapshot at each
  // deadline so stale readings flip to "Open T3 to refresh" unattended.
  requireOptionalNativeModule<{ schedule: (name: string, deadlines: number[]) => void }>(
    "T3WidgetExpiry",
  )?.schedule(
    "SubscriptionUsage",
    snapshot.providers.map((provider) => provider.expiresAt).filter((at) => at > 0),
  );
}

import type {
  EnvironmentId,
  ModelCapacityRetry,
  OrchestrationThreadShell,
} from "@t3tools/contracts";
import { capacityRetryLabel, getModelCapacityRetry } from "@t3tools/shared/modelCapacityRetry";
import * as Option from "effect/Option";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/AppText";
import { useThreadDetail } from "../../state/use-thread-detail";

export function ModelCapacityRetryNotice({
  environmentId,
  thread,
  onCancel,
}: {
  environmentId: EnvironmentId;
  thread: OrchestrationThreadShell;
  onCancel: () => void;
}) {
  const detail = Option.getOrNull(useThreadDetail({ environmentId, threadId: thread.id }).data);
  const retry = useMemo(
    () => getModelCapacityRetry(detail?.activities ?? [], thread.session?.activeTurnId),
    [detail?.activities, thread.session?.activeTurnId],
  );
  if (!retry) return null;
  return (
    <CapacityRetryNotice key={retry.retryAt ?? "retrying"} retry={retry} onCancel={onCancel} />
  );
}

function CapacityRetryNotice({
  retry,
  onCancel,
}: {
  retry: ModelCapacityRetry;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!retry.retryAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [retry.retryAt]);
  return (
    <View className="mx-3 mb-2 gap-2 rounded-xl border border-border-subtle bg-composer-panel p-3">
      <Text className="text-sm text-foreground">{capacityRetryLabel(retry, now)}</Text>
      <Pressable
        accessibilityRole="button"
        className="min-h-12 self-start justify-center rounded-lg bg-primary px-3"
        onPress={onCancel}
      >
        <Text className="text-sm font-t3-medium text-primary-foreground">Cancel retry</Text>
      </Pressable>
    </View>
  );
}

import * as Option from "effect/Option";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  capacityRetryLabel,
  getModelCapacityRetry,
  type ModelCapacityRetry,
} from "@t3tools/shared/modelCapacityRetry";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { useEnvironmentThread } from "../../state/threads";

export function ModelCapacityRetryNotice({
  threadRef,
  thread,
  onCancel,
}: {
  threadRef: ScopedThreadRef | null;
  thread: EnvironmentThreadShell;
  onCancel: () => void;
}) {
  const detail = Option.getOrNull(
    useEnvironmentThread(threadRef?.environmentId ?? null, threadRef?.threadId ?? null).data,
  );
  const retry = useMemo(
    () => getModelCapacityRetry(detail?.turnItems ?? [], thread.runtime?.activeRunId),
    [detail?.turnItems, thread.runtime?.activeRunId],
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
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Subscribe to the wall clock while a retry countdown is visible.
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

import type { ModelCapacityRetry } from "@t3tools/contracts";
import { capacityRetryLabel } from "@t3tools/shared/modelCapacityRetry";
import { useEffect, useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";

export function ModelCapacityRetryBanner({
  retry,
  onCancel,
}: {
  retry: ModelCapacityRetry | null;
  onCancel: () => void;
}) {
  if (!retry) return null;
  return (
    <CapacityRetryBanner key={retry.retryAt ?? "retrying"} retry={retry} onCancel={onCancel} />
  );
}

function CapacityRetryBanner({
  retry,
  onCancel,
}: {
  retry: ModelCapacityRetry;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!retry.retryAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [retry.retryAt]);
  return (
    <div className="pointer-events-auto mx-auto w-fit max-w-[min(48rem,calc(100%-2rem))] pt-3">
      <Alert variant="warning" surface="glass" controlAlignment="first-line">
        <CircleAlertIcon aria-hidden="true" />
        <AlertDescription aria-live="off">{capacityRetryLabel(retry, now)}</AlertDescription>
        <AlertAction>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel retry
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}

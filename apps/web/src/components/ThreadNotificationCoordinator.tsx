import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { EnvironmentId, OrchestrationV2ThreadShell, ThreadId } from "@t3tools/contracts";
import { isThreadCompletionSilent } from "@t3tools/shared/agentAwareness";
import * as Option from "effect/Option";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useRef } from "react";

import { getClientSettings, useClientSettings } from "../hooks/useSettings";
import { useEnvironmentIds } from "../state/environments";
import { environmentShell } from "../state/shell";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  playNotificationSound,
  setNotificationBadge,
  unlockNotificationAudio,
} from "../threadNotifications";
import { resolveSidebarThreadStatus } from "./Sidebar.logic";
import { toastManager } from "./ui/toast";

export function ThreadNotificationCoordinator() {
  const environmentIds = useEnvironmentIds();
  const { environmentId: activeEnvironmentId, threadId: activeThreadId } = useParams({
    strict: false,
  });
  const mode = useClientSettings((settings) => settings.notificationMode);
  const inAppNotificationsEnabled = useClientSettings(
    (settings) => settings.inAppNotificationsEnabled,
  );
  const pending = useRef(
    new Map<string, { environmentId: EnvironmentId; notification: Notification }>(),
  );
  const unread = useRef(new Set<string>());
  const dismissViewedThread = useEffectEvent(() => {
    if (
      !document.hasFocus() ||
      document.visibilityState !== "visible" ||
      !activeEnvironmentId ||
      !activeThreadId
    )
      return;
    const tag = `${activeEnvironmentId}:${activeThreadId}`;
    const entry = pending.current.get(tag);
    if (!entry) return;
    entry.notification.close();
    pending.current.delete(tag);
    unread.current.delete(tag);
    setNotificationBadge(unread.current.size);
  });

  const onNotification = useCallback((environmentId: EnvironmentId, notification: Notification) => {
    pending.current.get(notification.tag)?.notification.close();
    pending.current.set(notification.tag, { environmentId, notification });
    unread.current.add(notification.tag);
    setNotificationBadge(unread.current.size);
  }, []);

  useEffect(() => {
    const activeIds = new Set(environmentIds);
    const count = pending.current.size;
    for (const [tag, { environmentId, notification }] of pending.current) {
      if (activeIds.has(environmentId)) continue;
      notification.close();
      pending.current.delete(tag);
      unread.current.delete(tag);
    }
    if (count !== pending.current.size) setNotificationBadge(unread.current.size);
  }, [environmentIds]);

  useEffect(() => {
    const clearAll = () => {
      for (const { notification } of pending.current.values()) notification.close();
      pending.current.clear();
      unread.current.clear();
      setNotificationBadge(0);
    };
    const clearBadge = () => {
      // Returning to the app clears its badge, not other threads' OS history.
      unread.current.clear();
      setNotificationBadge(0);
      dismissViewedThread();
    };
    clearAll();
    if (!hasDesktopNotifications(mode)) return;
    const unsubscribe = window.desktopBridge?.onNotificationBadgeClear?.(clearBadge);
    window.addEventListener("focus", clearBadge);
    return () => {
      unsubscribe?.();
      window.removeEventListener("focus", clearBadge);
      clearAll();
    };
  }, [mode]);

  useEffect(() => {
    if (activeEnvironmentId && activeThreadId) dismissViewedThread();
  }, [activeEnvironmentId, activeThreadId]);

  useEffect(() => {
    if (!hasNotificationSound(mode)) return;
    document.addEventListener("pointerdown", unlockNotificationAudio);
    document.addEventListener("keydown", unlockNotificationAudio);
    return () => {
      document.removeEventListener("pointerdown", unlockNotificationAudio);
      document.removeEventListener("keydown", unlockNotificationAudio);
    };
  }, [mode]);

  if (mode === "off" && !inAppNotificationsEnabled) return null;

  return environmentIds.map((environmentId) => (
    <EnvironmentNotifications
      key={environmentId}
      environmentId={environmentId}
      onNotification={onNotification}
    />
  ));
}

interface NotificationState {
  readonly raw: OrchestrationV2ThreadShell;
  readonly attention: string | null;
  readonly completion: number | null;
}

function EnvironmentNotifications({
  environmentId,
  onNotification,
}: {
  environmentId: EnvironmentId;
  onNotification: (environmentId: EnvironmentId, notification: Notification) => void;
}) {
  const shell = useAtomValue(environmentShell.stateValueAtom(environmentId));
  // The shell reducer keeps the thread list and unchanged thread objects
  // stable, so this only rescans when a thread actually changed.
  const threads =
    shell.status === "live" && Option.isSome(shell.snapshot) ? shell.snapshot.value.threads : null;
  const mode = useClientSettings((settings) => settings.notificationMode);
  const inAppNotificationsEnabled = useClientSettings(
    (settings) => settings.inAppNotificationsEnabled,
  );
  const navigate = useNavigate();
  const { environmentId: activeEnvironmentId, threadId: activeThreadId } = useParams({
    strict: false,
  });
  const previous = useRef(new Map<ThreadId, NotificationState>());
  const pendingToasts = useRef(new Map<ThreadId, ReturnType<typeof toastManager.add>>());
  const dismissViewedToast = useEffectEvent(() => {
    if (
      activeEnvironmentId !== environmentId ||
      !activeThreadId ||
      !document.hasFocus() ||
      document.visibilityState !== "visible"
    )
      return;
    const threadId = activeThreadId as ThreadId;
    const toastId = pendingToasts.current.get(threadId);
    if (!toastId) return;
    pendingToasts.current.delete(threadId);
    toastManager.close(toastId);
  });

  useEffect(() => {
    if (inAppNotificationsEnabled) {
      if (activeEnvironmentId && activeThreadId) dismissViewedToast();
    } else {
      for (const toastId of pendingToasts.current.values()) toastManager.close(toastId);
      pendingToasts.current.clear();
    }
  }, [activeEnvironmentId, activeThreadId, inAppNotificationsEnabled]);

  useEffect(() => {
    const dismiss = () => dismissViewedToast();
    const toasts = pendingToasts.current;
    window.addEventListener("focus", dismiss);
    document.addEventListener("visibilitychange", dismiss);
    return () => {
      window.removeEventListener("focus", dismiss);
      document.removeEventListener("visibilitychange", dismiss);
      for (const toastId of toasts.values()) toastManager.close(toastId);
      toasts.clear();
    };
  }, []);

  useEffect(() => {
    if (threads === null) {
      previous.current.clear();
      return;
    }
    const next = new Map<ThreadId, NotificationState>();
    for (const rawThread of threads) {
      if (rawThread.lineage.relationshipToParent === "subagent") continue;
      const prior = previous.current.get(rawThread.id);
      // The same object cannot produce a new notification.
      if (prior?.raw === rawThread) {
        next.set(rawThread.id, prior);
        continue;
      }
      const thread = presentThreadShell(environmentId, rawThread);
      let status = resolveSidebarThreadStatus(thread);
      if (status === "ready" && thread.latestRun?.status === "failed") status = "failed";
      const attention =
        status === "input" || status === "approval" || status === "failed" || status === "limited"
          ? `${thread.latestRun?.runId ?? ""}:${status}`
          : null;
      const completedAt = Date.parse(thread.latestRun?.completedAt ?? "");
      // Commands left running (a dev server) read as ready; subagents and monitors wait.
      const completion =
        status === "ready" &&
        thread.latestRun?.status === "completed" &&
        Number.isFinite(completedAt)
          ? completedAt
          : (prior?.completion ?? null);
      next.set(thread.id, { raw: rawThread, attention, completion });
      if (!prior || thread.archivedAt !== null) continue;
      const kind =
        attention && attention !== prior.attention
          ? "input"
          : !isThreadCompletionSilent(rawThread) &&
              completion !== null &&
              (prior.completion === null || completion > prior.completion)
            ? "completion"
            : null;
      if (!kind) continue;
      const title =
        kind === "completion"
          ? "Thread completed"
          : status === "approval"
            ? "Approval needed"
            : status === "limited"
              ? "Usage limit reached"
              : status === "failed"
                ? "Thread failed"
                : "Input needed";
      if (hasNotificationSound(mode)) {
        void playNotificationSound(kind, () =>
          hasNotificationSound(getClientSettings().notificationMode),
        );
      }
      if (
        inAppNotificationsEnabled &&
        document.visibilityState === "visible" &&
        document.hasFocus() &&
        (activeEnvironmentId !== environmentId || activeThreadId !== thread.id)
      ) {
        const previousToastId = pendingToasts.current.get(thread.id);
        if (previousToastId) toastManager.close(previousToastId);
        const toastId = toastManager.add({
          timeout: 0,
          type: kind === "completion" ? "success" : status === "failed" ? "error" : "warning",
          title,
          description: thread.title,
          onClose: () => {
            if (pendingToasts.current.get(thread.id) === toastId) {
              pendingToasts.current.delete(thread.id);
            }
          },
          data: {
            hideCopyButton: true,
            leadingIcon:
              kind === "completion" ? (
                <CircleCheckIcon aria-hidden className="size-4 text-success-foreground" />
              ) : status === "approval" ? (
                <ShieldQuestionIcon aria-hidden className="size-4 text-warning-foreground" />
              ) : status === "failed" ? (
                <CircleAlertIcon aria-hidden className="size-4 text-destructive-foreground" />
              ) : (
                <MessageCircleQuestionIcon aria-hidden className="size-4 text-info-foreground" />
              ),
          },
          actionProps: {
            children: "Open thread",
            onClick: () => {
              toastManager.close(toastId);
              void navigate({
                to: "/$environmentId/$threadId",
                params: { environmentId, threadId: thread.id },
              });
            },
          },
        });
        pendingToasts.current.set(thread.id, toastId);
        continue;
      }
      if (
        !hasDesktopNotifications(mode) ||
        (document.visibilityState === "visible" && document.hasFocus()) ||
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      )
        continue;
      try {
        const notification = new Notification(title, {
          body: thread.title,
          tag: `${environmentId}:${thread.id}`,
          silent: true,
        });
        onNotification(environmentId, notification);
        notification.addEventListener("click", () => {
          notification.close();
          window.focus();
          void navigate({
            to: "/$environmentId/$threadId",
            params: { environmentId, threadId: thread.id },
          });
        });
      } catch {
        // Some browsers expose Notification but reject desktop presentation.
      }
    }
    previous.current = next;
  }, [
    activeEnvironmentId,
    activeThreadId,
    environmentId,
    inAppNotificationsEnabled,
    mode,
    navigate,
    onNotification,
    threads,
  ]);

  return null;
}

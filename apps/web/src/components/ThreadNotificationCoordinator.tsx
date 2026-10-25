import {
  type EnvironmentThreadShell,
  type PendingSubagentRequest,
  presentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { pendingSubagentRequestsByThread } from "@t3tools/client-runtime/state/threads";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { EnvironmentId, type OrchestrationV2ThreadShell, ThreadId } from "@t3tools/contracts";
import { isThreadCompletionSilent } from "@t3tools/shared/agentAwareness";
import * as Option from "effect/Option";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";

import { getClientSettings, useClientSettings } from "../hooks/useSettings";
import { useEnvironmentIds } from "../state/environments";
import { environmentShell } from "../state/shell";
import {
  hasDesktopNotifications,
  hasNotificationSound,
  playNotificationSound,
  setNotificationBadge,
  threadNotificationTag,
  unlockNotificationAudio,
} from "../threadNotifications";
import { resolveSidebarThreadStatus, type SidebarThreadStatus } from "./Sidebar.logic";
import {
  createThreadNotificationGate,
  type ThreadNotificationKind,
  type ThreadNotificationObservation,
} from "./ThreadNotificationCoordinator.logic";
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
    new Map<
      string,
      {
        environmentId: EnvironmentId;
        notification: Notification;
      }
    >(),
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
    const tag = threadNotificationTag(
      EnvironmentId.make(activeEnvironmentId),
      ThreadId.make(activeThreadId),
    );
    const entry = pending.current.get(tag);
    if (!entry) return;
    entry.notification.close();
    pending.current.delete(tag);
    unread.current.delete(tag);
    setNotificationBadge(unread.current.size);
  });
  const onNotification = (environmentId: EnvironmentId, notification: Notification) => {
    pending.current.get(notification.tag)?.notification.close();
    pending.current.set(notification.tag, {
      environmentId,
      notification,
    });
    unread.current.add(notification.tag);
    setNotificationBadge(unread.current.size);
  };
  useEffect(() => {
    const activeIds = new Set(environmentIds);
    const count = pending.current.size;
    for (const [tag, entry] of pending.current) {
      if (activeIds.has(entry.environmentId)) continue;
      entry.notification.close();
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

interface NotificationState extends ThreadNotificationObservation {
  readonly raw: OrchestrationV2ThreadShell;
  readonly subagentRequest: PendingSubagentRequest | null;
  readonly thread: EnvironmentThreadShell;
  readonly status: SidebarThreadStatus;
}
function EnvironmentNotifications({
  environmentId,
  onNotification,
}: {
  environmentId: EnvironmentId;
  onNotification: (environmentId: EnvironmentId, notification: Notification) => void;
}) {
  const shell = useAtomValue(environmentShell.stateValueAtom(environmentId));
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
  const notifiedUsageLimits = useRef(
    new Map<string, { providerInstanceId: string; resetAt: string | null; notifiedAt: number }>(),
  );
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

  const present = useEffectEvent((threadId: ThreadId, kind: ThreadNotificationKind) => {
    const entry = previous.current.get(threadId);
    if (!entry) return;
    const { thread, status, raw: rawThread } = entry;
    const foreground = document.visibilityState === "visible" && document.hasFocus();
    const showToast =
      inAppNotificationsEnabled &&
      foreground &&
      (activeEnvironmentId !== environmentId || activeThreadId !== thread.id);
    const showNotification =
      hasDesktopNotifications(mode) &&
      !foreground &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted";
    if (!hasNotificationSound(mode) && !showToast && !showNotification) return;
    if (status === "limited") {
      const resetAt = rawThread.usageLimitResetAt ?? null;
      const key = JSON.stringify([
        rawThread.providerInstanceId,
        resetAt === null ? (rawThread.lastError?.trim() ?? null) : Date.parse(resetAt),
      ]);
      if (notifiedUsageLimits.current.has(key)) return;
      notifiedUsageLimits.current.set(key, {
        providerInstanceId: rawThread.providerInstanceId,
        resetAt,
        notifiedAt: rawThread.updatedAt.epochMilliseconds,
      });
      if (notifiedUsageLimits.current.size > 128) {
        notifiedUsageLimits.current.delete(notifiedUsageLimits.current.keys().next().value!);
      }
    }
    const title =
      kind === "completion"
        ? "Thread completed"
        : status === "approval"
          ? "Approval needed"
          : status === "limited"
            ? "Usage limit reached"
            : status === "failed"
              ? "Thread failed"
              : status === "request"
                ? "Guest request"
                : "Input needed";
    if (hasNotificationSound(mode)) {
      void playNotificationSound(kind, () =>
        hasNotificationSound(getClientSettings().notificationMode),
      );
    }
    if (showToast) {
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
              params: {
                environmentId,
                threadId: thread.id,
              },
            });
          },
        },
      });
      pendingToasts.current.set(thread.id, toastId);
      return;
    }
    if (!showNotification) return;
    try {
      const notification = new Notification(title, {
        body: thread.title,
        tag: threadNotificationTag(environmentId, thread.id),
        silent: true,
      });
      onNotification(environmentId, notification);
      notification.addEventListener("click", () => {
        notification.close();
        if (window.desktopBridge?.focusWindow) {
          void window.desktopBridge.focusWindow().catch(() => window.focus());
        } else {
          window.focus();
          void window.desktopBridge?.revealWindow?.().catch(() => undefined);
        }
        void navigate({
          to: "/$environmentId/$threadId",
          params: {
            environmentId,
            threadId: thread.id,
          },
        });
      });
    } catch {
      // Some browsers expose Notification but reject desktop presentation.
    }
  });
  const gate = useRef<ReturnType<typeof createThreadNotificationGate<ThreadId>>>(null);
  useEffect(() => {
    const created = createThreadNotificationGate<ThreadId>((threadId, kind) =>
      present(threadId, kind),
    );
    gate.current = created;
    return () => {
      created.clear();
      gate.current = null;
      // A new gate has no pending completions, so forget the states they compared against.
      previous.current.clear();
    };
  }, []);

  useEffect(() => {
    const pendingCompletions = gate.current;
    if (!pendingCompletions) return;
    if (threads === null) {
      pendingCompletions.clear();
      previous.current.clear();
      return;
    }
    const next = new Map<ThreadId, NotificationState>();
    const subagentRequests = pendingSubagentRequestsByThread(threads);
    const changed: Array<[NotificationState | undefined, NotificationState]> = [];
    for (const rawThread of threads) {
      if (rawThread.lineage.relationshipToParent === "subagent") continue;
      const prior = previous.current.get(rawThread.id);
      const subagentRequest = subagentRequests.get(rawThread.id) ?? null;
      if (prior?.raw === rawThread && prior.subagentRequest === subagentRequest) {
        next.set(rawThread.id, prior);
        continue;
      }
      // Without a reset time, a successful turn started after the alert is
      // evidence that this provider can work again.
      if (rawThread.status === "completed" && rawThread.latestRunStartedAt) {
        for (const [key, limit] of notifiedUsageLimits.current) {
          if (
            limit.resetAt === null &&
            limit.providerInstanceId === rawThread.providerInstanceId &&
            rawThread.latestRunStartedAt.epochMilliseconds > limit.notifiedAt
          ) {
            notifiedUsageLimits.current.delete(key);
          }
        }
      }
      const thread = presentThreadShell(environmentId, rawThread, subagentRequest);
      let status = resolveSidebarThreadStatus(thread);
      if (status === "ready" && thread.latestRun?.status === "failed") status = "failed";
      const attention =
        status === "input" ||
        status === "request" ||
        status === "approval" ||
        status === "failed" ||
        status === "limited"
          ? `${thread.latestRun?.runId ?? ""}:${status}`
          : null;
      const completedAt = Date.parse(thread.latestRun?.completedAt ?? "");
      const settled = status === "ready" && thread.latestRun?.status === "completed";
      const state = {
        raw: rawThread,
        subagentRequest,
        thread,
        status,
        attention,
        settled,
        completedAt: settled && Number.isFinite(completedAt) ? completedAt : null,
      };
      next.set(thread.id, state);
      changed.push([prior, state]);
    }
    previous.current = next;
    pendingCompletions.retain(new Set(next.keys()));
    for (const [prior, state] of changed) {
      pendingCompletions.observe(state.thread.id, prior, state, {
        archived: state.thread.archivedAt !== null,
        quiet:
          isThreadCompletionSilent(state.raw) ||
          state.raw.latestRunStopRequested === true ||
          state.raw.latestRunSilent === true,
      });
    }
  }, [environmentId, threads]);
  return null;
}

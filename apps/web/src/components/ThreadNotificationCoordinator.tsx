import {
  type EnvironmentThreadShell,
  type PendingSubagentRequest,
  presentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { isShownUnderParent } from "@t3tools/client-runtime/state/threads";
import type { AnyRouter } from "@tanstack/react-router";
import type { EnvironmentId, OrchestrationV2ThreadShell, ThreadId } from "@t3tools/contracts";
import type { ClientSettings } from "@t3tools/contracts/settings";
import { isThreadCompletionSilent } from "@t3tools/shared/agentAwareness";
import * as Option from "effect/Option";
import type { AtomRegistry } from "effect/reactivity";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from "lucide-react";

import { getClientSettings, subscribeClientSettings } from "../hooks/useSettings";
import { isWindowsPlatform } from "../lib/utils";
import { environmentSummaries } from "../state/presentation";
import { environmentShell } from "../state/shell";
import { environmentThreadShells } from "../state/threads";
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

interface NotificationState extends ThreadNotificationObservation {
  readonly raw: OrchestrationV2ThreadShell;
  readonly subagentRequest: PendingSubagentRequest | null;
  readonly thread: EnvironmentThreadShell;
  readonly status: SidebarThreadStatus;
}

interface WatchedEnvironment {
  unsubscribe: () => void;
  previous: Map<ThreadId, NotificationState>;
  readonly gate: ReturnType<typeof createThreadNotificationGate<ThreadId>>;
}

/**
 * Turns thread status transitions in every connected environment into sounds, in-app toasts,
 * and desktop notifications, and keeps the dock badge in step with the unread ones.
 */
export function startThreadNotifications(
  registry: AtomRegistry.AtomRegistry,
  router: AnyRouter,
): () => void {
  const pending = new Map<string, { environmentId: EnvironmentId; notification: Notification }>();
  const watched = new Map<EnvironmentId, WatchedEnvironment>();
  const unread = new Set<string>();
  const notifiedUsageLimits = new Map<
    string,
    {
      environmentId: EnvironmentId;
      providerInstanceId: string;
      resetAt: string | null;
      notifiedAt: number;
    }
  >();
  const pendingToasts = new Map<string, ReturnType<typeof toastManager.add>>();
  const activeTag = () => {
    const params = router.state.matches.at(-1)?.params as
      | { environmentId?: EnvironmentId; threadId?: ThreadId }
      | undefined;
    return params?.environmentId && params.threadId
      ? threadNotificationTag(params.environmentId, params.threadId)
      : null;
  };
  const dismissViewed = () => {
    if (!document.hasFocus() || document.visibilityState !== "visible") return;
    const tag = activeTag();
    if (tag === null) return;
    pending.get(tag)?.notification.close();
    pending.delete(tag);
    unread.delete(tag);
    setNotificationBadge(unread.size);
    const toast = pendingToasts.get(tag);
    if (toast) toastManager.close(toast);
    pendingToasts.delete(tag);
  };
  const clearBadge = () => {
    unread.clear();
    setNotificationBadge(0);
    dismissViewed();
  };

  const trackNotification = (environmentId: EnvironmentId, notification: Notification) => {
    pending.get(notification.tag)?.notification.close();
    pending.set(notification.tag, { environmentId, notification });
    unread.add(notification.tag);
    setNotificationBadge(unread.size);
  };
  const clearPending = () => {
    for (const { notification } of pending.values()) notification.close();
    pending.clear();
    unread.clear();
    setNotificationBadge(0);
  };

  // Completions fire from a timer, so read settings, focus and route when presenting.
  const present = (
    environmentId: EnvironmentId,
    state: NotificationState,
    kind: ThreadNotificationKind,
  ) => {
    const { thread, status, raw: rawThread } = state;
    const { notificationMode: mode, inAppNotificationsEnabled } = getClientSettings();
    const active = (router.state.matches.at(-1)?.params ?? {}) as {
      environmentId?: string;
      threadId?: string;
    };
    const foreground = document.visibilityState === "visible" && document.hasFocus();
    const showToast =
      inAppNotificationsEnabled &&
      foreground &&
      (active.environmentId !== environmentId || active.threadId !== thread.id);
    const showNotification =
      hasDesktopNotifications(mode) &&
      !foreground &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted";
    if (!hasNotificationSound(mode) && !showToast && !showNotification) return;
    if (status === "limited") {
      const resetAt = rawThread.usageLimitResetAt ?? null;
      const key = JSON.stringify([
        environmentId,
        rawThread.providerInstanceId,
        resetAt === null ? (rawThread.lastError?.trim() ?? null) : Date.parse(resetAt),
      ]);
      if (notifiedUsageLimits.has(key)) return;
      notifiedUsageLimits.set(key, {
        environmentId,
        providerInstanceId: rawThread.providerInstanceId,
        resetAt,
        notifiedAt: rawThread.updatedAt.epochMilliseconds,
      });
      if (notifiedUsageLimits.size > 128) {
        notifiedUsageLimits.delete(notifiedUsageLimits.keys().next().value!);
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
      const previousToastId = pendingToasts.get(threadNotificationTag(environmentId, thread.id));
      if (previousToastId) toastManager.close(previousToastId);
      const toastId = toastManager.add({
        timeout: 0,
        type: kind === "completion" ? "success" : status === "failed" ? "error" : "warning",
        title,
        description: thread.title,
        onClose: () => {
          if (pendingToasts.get(threadNotificationTag(environmentId, thread.id)) === toastId) {
            pendingToasts.delete(threadNotificationTag(environmentId, thread.id));
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
            void router.navigate({
              to: "/$environmentId/$threadId",
              params: {
                environmentId,
                threadId: thread.id,
              },
            });
          },
        },
      });
      pendingToasts.set(threadNotificationTag(environmentId, thread.id), toastId);
      return;
    }
    if (!showNotification) return;
    try {
      const notification = new Notification(title, {
        body: thread.title,
        tag: threadNotificationTag(environmentId, thread.id),
        silent: true,
        // Windows drops clicks after a toast moves into Notification Center.
        requireInteraction: kind === "completion" && isWindowsPlatform(navigator.platform),
      });
      trackNotification(environmentId, notification);
      notification.addEventListener("click", () => {
        notification.close();
        if (window.desktopBridge?.focusWindow) {
          void window.desktopBridge.focusWindow().catch(() => window.focus());
        } else {
          window.focus();
          void window.desktopBridge?.revealWindow?.().catch(() => undefined);
        }
        void router.navigate({
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
  };

  const observeThreads = (
    environmentId: EnvironmentId,
    entry: WatchedEnvironment,
    threads: ReadonlyArray<OrchestrationV2ThreadShell>,
  ) => {
    const previous = entry.previous;
    const next = new Map<ThreadId, NotificationState>();
    // A parent here also hears of what its tasks on linked environments ask.
    const subagentRequests = registry.get(
      environmentThreadShells.pendingSubagentRequestsAtom(environmentId),
    );
    const delegatedUnderParent = registry.get(environmentThreadShells.delegatedUnderParentAtom);
    const changed: Array<[NotificationState | undefined, NotificationState]> = [];
    for (const rawThread of threads) {
      if (
        isShownUnderParent(
          { environmentId, threadId: rawThread.id },
          rawThread.lineage,
          delegatedUnderParent,
        )
      ) {
        continue;
      }
      const prior = previous.get(rawThread.id);
      const subagentRequest = subagentRequests.get(rawThread.id) ?? null;
      if (prior?.raw === rawThread && prior.subagentRequest === subagentRequest) {
        next.set(rawThread.id, prior);
        continue;
      }
      // Without a reset time, a successful turn started after the alert is
      // evidence that this provider can work again.
      if (rawThread.status === "completed" && rawThread.latestRunStartedAt) {
        for (const [key, limit] of notifiedUsageLimits) {
          if (
            limit.environmentId === environmentId &&
            limit.resetAt === null &&
            limit.providerInstanceId === rawThread.providerInstanceId &&
            rawThread.latestRunStartedAt.epochMilliseconds > limit.notifiedAt
          ) {
            notifiedUsageLimits.delete(key);
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
    entry.previous = next;
    entry.gate.retain(new Set(next.keys()));
    for (const [prior, state] of changed) {
      entry.gate.observe(state.thread.id, prior, state, {
        archived: state.thread.archivedAt !== null,
        quiet: isThreadCompletionSilent(state.raw) || state.raw.latestRunStopRequested === true,
      });
    }
  };

  const watchEnvironment = (environmentId: EnvironmentId): WatchedEnvironment => {
    const entry: WatchedEnvironment = {
      previous: new Map(),
      unsubscribe: () => {},
      gate: createThreadNotificationGate<ThreadId>((threadId, kind) => {
        const state = entry.previous.get(threadId);
        if (state) present(environmentId, state, kind);
      }),
    };
    let threads: ReadonlyArray<OrchestrationV2ThreadShell> | null = null;
    const unsubscribeShell = registry.subscribe(
      environmentShell.stateValueAtom(environmentId),
      (shell) => {
        threads =
          shell.status === "live" && Option.isSome(shell.snapshot)
            ? shell.snapshot.value.threads
            : null;
        if (threads !== null) {
          observeThreads(environmentId, entry, threads);
          return;
        }
        entry.gate.clear();
        entry.previous = new Map();
      },
      { immediate: true },
    );
    const reobserve = () => {
      if (threads !== null) observeThreads(environmentId, entry, threads);
    };
    const unsubscribeRequests = registry.subscribe(
      environmentThreadShells.pendingSubagentRequestsAtom(environmentId),
      reobserve,
    );
    const unsubscribeDelegated = registry.subscribe(
      environmentThreadShells.delegatedUnderParentAtom,
      reobserve,
    );
    entry.unsubscribe = () => {
      unsubscribeShell();
      unsubscribeRequests();
      unsubscribeDelegated();
      entry.gate.clear();
    };
    return entry;
  };

  const syncEnvironments = () => {
    const { notificationMode, inAppNotificationsEnabled } = getClientSettings();
    const enabled = notificationMode !== "off" || inAppNotificationsEnabled;
    const environmentIds = enabled ? registry.get(environmentSummaries.environmentIdsAtom) : [];
    const activeIds = new Set(environmentIds);
    for (const [environmentId, entry] of watched) {
      if (activeIds.has(environmentId)) continue;
      entry.unsubscribe();
      watched.delete(environmentId);
    }
    for (const environmentId of environmentIds) {
      if (!watched.has(environmentId)) watched.set(environmentId, watchEnvironment(environmentId));
    }
  };

  const pruneRemovedEnvironments = () => {
    const activeIds = new Set(registry.get(environmentSummaries.environmentIdsAtom));
    const count = pending.size;
    for (const [tag, entry] of pending) {
      if (activeIds.has(entry.environmentId)) continue;
      entry.notification.close();
      pending.delete(tag);
      unread.delete(tag);
    }
    if (count !== pending.size) setNotificationBadge(unread.size);
  };

  // Listeners that only exist for some notification modes, rebuilt when the mode changes.
  let appliedMode: ClientSettings["notificationMode"] | null = null;
  let stopModeListeners = () => {};
  const applyMode = () => {
    const nextMode = getClientSettings().notificationMode;
    if (nextMode === appliedMode) return;
    appliedMode = nextMode;
    stopModeListeners();
    clearPending();
    const stops: Array<() => void> = [];
    if (hasDesktopNotifications(nextMode)) {
      const unsubscribeBadgeClear = window.desktopBridge?.onNotificationBadgeClear?.(clearBadge);
      window.addEventListener("focus", clearBadge);
      stops.push(() => {
        unsubscribeBadgeClear?.();
        window.removeEventListener("focus", clearBadge);
        clearPending();
      });
    }
    if (hasNotificationSound(nextMode)) {
      document.addEventListener("pointerdown", unlockNotificationAudio);
      document.addEventListener("keydown", unlockNotificationAudio);
      stops.push(() => {
        document.removeEventListener("pointerdown", unlockNotificationAudio);
        document.removeEventListener("keydown", unlockNotificationAudio);
      });
    }
    stopModeListeners = () => {
      for (const stop of stops) stop();
    };
  };

  const clearToasts = () => {
    for (const toast of pendingToasts.values()) toastManager.close(toast);
    pendingToasts.clear();
  };
  const onSettings = () => {
    if (!getClientSettings().inAppNotificationsEnabled) clearToasts();
    applyMode();
    syncEnvironments();
  };
  const unsubscribeSettings = subscribeClientSettings(onSettings);
  const unsubscribeEnvironmentIds = registry.subscribe(
    environmentSummaries.environmentIdsAtom,
    () => {
      pruneRemovedEnvironments();
      syncEnvironments();
    },
  );
  window.addEventListener("focus", dismissViewed);
  document.addEventListener("visibilitychange", dismissViewed);
  const unsubscribeRoute = router.subscribe?.("onResolved", dismissViewed);
  onSettings();

  return () => {
    unsubscribeRoute?.();
    window.removeEventListener("focus", dismissViewed);
    document.removeEventListener("visibilitychange", dismissViewed);
    clearToasts();
    unsubscribeSettings();
    unsubscribeEnvironmentIds();
    for (const entry of watched.values()) entry.unsubscribe();
    watched.clear();
    stopModeListeners();
  };
}

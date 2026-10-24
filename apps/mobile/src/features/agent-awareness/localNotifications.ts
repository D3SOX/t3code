import type {
  EnvironmentId,
  OrchestrationProjectShell,
  OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import {
  projectThreadAwarenessV2,
  type ProjectThreadAwarenessV2Input,
} from "@t3tools/shared/agentAwareness";

interface NotificationSnapshot {
  readonly projects: readonly Pick<OrchestrationProjectShell, "id" | "title">[];
  readonly threads: readonly (ProjectThreadAwarenessV2Input["thread"] &
    Pick<OrchestrationV2ThreadShell, "projectId" | "latestRunId" | "archivedAt" | "deletedAt">)[];
}

export function createLocalNotificationTracker() {
  const seen = new Map<string, string>();
  let initialized = false;
  return (environmentId: EnvironmentId, snapshot: NotificationSnapshot) => {
    const alerts: Record<string, string>[] = [];
    const projects = new Map(snapshot.projects.map((project) => [project.id, project]));
    for (const thread of snapshot.threads) {
      const project = projects.get(thread.projectId);
      if (!project || thread.archivedAt !== null || thread.deletedAt !== null) continue;
      const state = projectThreadAwarenessV2({ environmentId, project, thread });
      if (
        !state ||
        !["completed", "failed", "waiting_for_approval", "waiting_for_input"].includes(state.phase)
      )
        continue;
      const identity = `${state.phase}:${thread.latestRunId ?? ""}:${thread.pendingRuntimeRequest?.id ?? ""}`;
      if (initialized && seen.get(thread.id) !== identity) {
        alerts.push({
          alert_id: `local:${environmentId}:${thread.id}:${identity}`,
          alert_group: environmentId,
          alert_title: state.headline,
          alert_body: `${state.threadTitle} · ${state.projectTitle}`,
          alert_path: state.deepLink,
        });
      }
      seen.set(thread.id, identity);
    }
    initialized = true;
    return alerts;
  };
}

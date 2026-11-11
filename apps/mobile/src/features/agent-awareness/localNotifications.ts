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

export function localAgentActivity(
  snapshots: readonly { environmentId: EnvironmentId; snapshot: NotificationSnapshot }[],
  now: number,
): Record<string, string> {
  const rows = snapshots.flatMap(({ environmentId, snapshot }) => {
    const projects = new Map(snapshot.projects.map((project) => [project.id, project]));
    return snapshot.threads.flatMap((thread) => {
      const project = projects.get(thread.projectId);
      if (!project || thread.archivedAt !== null || thread.deletedAt !== null) return [];
      const state = projectThreadAwarenessV2({ environmentId, project, thread });
      return state && state.phase !== "completed" && state.phase !== "failed" ? [state] : [];
    });
  });
  const attention = (phase: string) =>
    phase === "waiting_for_input" || phase === "waiting_for_approval";
  rows.sort((a, b) => Number(attention(b.phase)) - Number(attention(a.phase)));
  const status = {
    starting: "Connecting",
    running: "Working",
    waiting_for_approval: "Approval",
    waiting_for_input: "Input",
    stale: "Waiting",
    completed: "Done",
    failed: "Failed",
  };
  const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    active: String(rows.length > 0),
    activity_phase: rows[0]?.phase ?? "",
    activity_active_count: String(rows.length),
    activity_attention_count: String(rows.filter((row) => attention(row.phase)).length),
    activity_path: rows[0]?.deepLink ?? "/",
    activity_expires_at: String(rows.length ? now + 2 * 60 * 60_000 : 0),
    ...Object.fromEntries(
      rows
        .slice(0, 5)
        .map((row, index) => [
          `activity_line_${index}`,
          [status[row.phase], clean(row.threadTitle), clean(row.projectTitle)].join("\t"),
        ]),
    ),
  };
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

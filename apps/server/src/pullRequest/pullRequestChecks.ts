import type { PullRequestCheck } from "@t3tools/contracts";

/** ISO-8601 timestamps in UTC compare correctly as plain text, which is all the ordering needs. */
function isAtLeastAsNew(candidate: string | null, kept: string | null): boolean {
  if (candidate === null) return kept === null;
  return kept === null || candidate >= kept;
}

/**
 * The newest result per check, plus an overlapping run that is still active.
 *
 * A host's rollup is a list of runs, not a list of checks: while a workflow is being re-run — or
 * while a second run of it is already live — the same check arrives twice, and both copies reach
 * the reader as what looks like a duplicate. Nothing in a check carries an id, so the name is what
 * identifies it, qualified by the workflow it belongs to since two workflows are free to name a
 * job the same thing.
 *
 * Within a group the newest run is the one worth showing: a re-run is the answer that replaces the
 * one before it, and a run that never said when it happened loses to one that did. A tie goes to
 * whichever came last, because a host lists a re-run after the run it repeats.
 * A host that reports distinct check runs marks live ones with `active`; an older active run
 * must stay visible until it finishes, even when the newest result has already passed or failed.
 * Status histories do not set `active`, since a newer status replaces the older entry.
 *
 * The order is the host's own, held at the place each check first appeared, so a re-run landing
 * mid-read replaces a row where it stands instead of reshuffling the list under the reader.
 *
 * Checks from different workflows under the same name are shown as `workflow / name`.
 * A survivor whose workflow the host did not name keeps its bare name rather than being qualified
 * with nothing.
 */
export function dedupeChecks(
  entries: ReadonlyArray<{
    readonly check: PullRequestCheck;
    readonly workflowName: string | null;
    readonly at: string | null;
    readonly active?: boolean;
  }>,
): ReadonlyArray<PullRequestCheck> {
  const newestByCheck = new Map<string, (typeof entries)[number]>();
  const activeByCheck = new Map<string, (typeof entries)[number]>();
  for (const entry of entries) {
    const key = `${entry.workflowName ?? ""} ${entry.check.name}`;
    const kept = newestByCheck.get(key);
    // Re-setting a key a Map already holds keeps its first position, which is the order wanted.
    if (kept === undefined || isAtLeastAsNew(entry.at, kept.at)) newestByCheck.set(key, entry);
    if (entry.active) {
      const active = activeByCheck.get(key);
      if (active === undefined || isAtLeastAsNew(entry.at, active.at))
        activeByCheck.set(key, entry);
    }
  }
  const survivors = [...newestByCheck].flatMap(([key, newest]) => {
    const active = activeByCheck.get(key);
    return active === undefined || newest.active ? [newest] : [newest, active];
  });
  const countsByName = new Map<string, number>();
  for (const entry of newestByCheck.values()) {
    countsByName.set(entry.check.name, (countsByName.get(entry.check.name) ?? 0) + 1);
  }
  return survivors.map((entry) => {
    const workflowName = entry.workflowName ?? "";
    return workflowName.length > 0 && (countsByName.get(entry.check.name) ?? 0) > 1
      ? { ...entry.check, name: `${workflowName} / ${entry.check.name}` }
      : entry.check;
  });
}

import type { EnvironmentId, VcsRef as ContractVcsRef } from "@t3tools/contracts";

export interface VcsRefTarget {
  readonly environmentId: EnvironmentId | null;
  readonly cwd: string | null;
  readonly query?: string | null;
}

export type VcsRef = ContractVcsRef;

/** The branch a new worktree starts from: the chosen one, else the repository's default. */
export function resolveWorktreeBaseRef(chosen: string, refs: ReadonlyArray<VcsRef>): string {
  const trimmed = chosen.trim();
  if (trimmed) return trimmed;
  const defaultRef =
    refs.find((ref) => ref.isDefault && !ref.isRemote) ?? refs.find((ref) => ref.isDefault);
  return defaultRef?.name ?? "";
}

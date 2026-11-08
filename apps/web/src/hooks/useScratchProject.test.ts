import type { EnvironmentId } from "@t3tools/contracts";
import { AtomRegistry } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import { createScratchProjectActions } from "./useScratchProject";

const local = "local" as EnvironmentId;
const remote = "remote" as EnvironmentId;
const other = "other" as EnvironmentId;

function scratchEnvironment(
  environmentId: EnvironmentId,
  scratchWorkspaceRoot: string | null,
  phase = "connected",
) {
  return {
    environmentId,
    connection: { phase },
    serverConfig: { scratchWorkspaceRoot },
  } as never;
}

function actions(
  primary: EnvironmentId | null,
  localRoot: string | null,
  remoteRoot: string | null = "/remote/scratch",
  preferred: EnvironmentId | null = null,
  remotePhase = "connected",
) {
  const environments = [
    scratchEnvironment(local, localRoot),
    scratchEnvironment(remote, remoteRoot, remotePhase),
    scratchEnvironment(other, "/other/scratch"),
  ];
  return createScratchProjectActions({
    environments: () => environments,
    primaryEnvironmentId: () => primary,
    preferredEnvironmentId: () => preferred,
    registry: AtomRegistry.make(),
    handleNewThread: async () => null,
  });
}

describe("scratchEnvironmentId", () => {
  it("honors the preferred machine and keeps the primary machine as the automatic default", () => {
    expect(actions(local, "/local/scratch").scratchEnvironmentId(remote)).toBe(local);
    expect(actions(local, "/local/scratch").scratchEnvironmentId(null)).toBe(local);
    expect(
      actions(local, "/local/scratch", "/remote/scratch", remote).scratchEnvironmentId(local),
    ).toBe(remote);
    expect(
      actions(local, "/local/scratch", "/remote/scratch", other).scratchEnvironmentId(remote),
    ).toBe(other);
  });

  it("falls back only in automatic mode and never substitutes for an unavailable preference", () => {
    expect(actions(local, null).scratchEnvironmentId(remote)).toBe(remote);
    expect(actions(null, null).scratchEnvironmentId(remote)).toBe(remote);
    expect(actions(null, null, null).scratchEnvironmentId(remote)).toBe(other);
    expect(actions(local, null).scratchEnvironmentId(null)).toBeNull();
    expect(actions(local, "/local/scratch", null, remote).scratchEnvironmentId(local)).toBeNull();
    expect(
      actions(
        local,
        "/local/scratch",
        "/remote/scratch",
        "removed" as EnvironmentId,
      ).scratchEnvironmentId(local),
    ).toBeNull();
    expect(
      actions(
        local,
        "/local/scratch",
        "/remote/scratch",
        remote,
        "disconnected",
      ).scratchEnvironmentId(local),
    ).toBeNull();
  });
});

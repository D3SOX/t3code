import type { RemoteT3RunnerOptions } from "@t3tools/ssh/tunnel";
import * as Option from "effect/Option";

export function resolveDesktopSshCliRunner(input: {
  readonly appVersion: string;
  readonly archiveVersionOverride: string | undefined;
  readonly devRemoteT3ServerEntryPath: Option.Option<string>;
  readonly isDevelopment: boolean;
  readonly nodeEngineRange: string;
}): RemoteT3RunnerOptions {
  const devRemoteEntryPath = Option.getOrUndefined(input.devRemoteT3ServerEntryPath);
  if (input.isDevelopment && devRemoteEntryPath !== undefined) {
    return {
      nodeScriptPath: devRemoteEntryPath,
      nodeEngineRange: input.nodeEngineRange,
    };
  }

  return {
    archiveVersion: input.archiveVersionOverride?.trim() || input.appVersion,
  };
}

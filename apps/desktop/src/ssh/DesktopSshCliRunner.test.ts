import { assert, describe, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { resolveDesktopSshCliRunner } from "./DesktopSshCliRunner.ts";

describe("resolveDesktopSshCliRunner", () => {
  it("uses a packager-provided archive version without changing the desktop version", () => {
    assert.deepStrictEqual(
      resolveDesktopSshCliRunner({
        appVersion: "0.0.40.r4007.ge88d750",
        archiveVersionOverride: " 0.0.41-nightly.20260915.1752 ",
        devRemoteT3ServerEntryPath: Option.none(),
        isDevelopment: false,
        nodeEngineRange: ">=22",
      }),
      { archiveVersion: "0.0.41-nightly.20260915.1752" },
    );
  });

  it("falls back to the desktop version for normal release builds", () => {
    assert.deepStrictEqual(
      resolveDesktopSshCliRunner({
        appVersion: "0.0.41",
        archiveVersionOverride: undefined,
        devRemoteT3ServerEntryPath: Option.none(),
        isDevelopment: false,
        nodeEngineRange: ">=22",
      }),
      { archiveVersion: "0.0.41" },
    );
  });

  it("keeps source-checkout development on its local server entry", () => {
    assert.deepStrictEqual(
      resolveDesktopSshCliRunner({
        appVersion: "0.0.41",
        archiveVersionOverride: "0.0.40",
        devRemoteT3ServerEntryPath: Option.some("/repo/apps/server/src/bin.ts"),
        isDevelopment: true,
        nodeEngineRange: ">=22",
      }),
      {
        nodeScriptPath: "/repo/apps/server/src/bin.ts",
        nodeEngineRange: ">=22",
      },
    );
  });
});

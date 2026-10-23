import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("expo-secure-store", () => ({}));

import { sanitizePreferences } from "./mobile-preferences";

describe("environment identification preferences", () => {
  it.each(["system", "app"] as const)("retains the %s PR link destination", (target) => {
    const preferences = JSON.parse(JSON.stringify({ pullRequestLinkTarget: target }));
    expect(sanitizePreferences(preferences)).toEqual(preferences);
  });

  it("drops an invalid PR link destination without losing other preferences", () => {
    expect(
      sanitizePreferences(JSON.parse('{"pullRequestLinkTarget":"invalid","baseFontSize":17}')),
    ).toEqual({ baseFontSize: 17 });
  });

  it("retains the last project selected for a new thread", () => {
    const preferences = JSON.parse(
      '{"lastNewThreadProjectRef":{"environmentId":"environment","projectId":"project"}}',
    );
    expect(sanitizePreferences(preferences)).toEqual(preferences);
  });
  it.each([
    null,
    {},
    { environmentId: "", projectId: "project" },
    { environmentId: "environment", projectId: 123 },
  ])("drops an invalid remembered project %j", (lastNewThreadProjectRef) => {
    expect(sanitizePreferences(JSON.parse(JSON.stringify({ lastNewThreadProjectRef })))).toEqual(
      {},
    );
  });
  it.each([true, false])("retains thread branch visibility %s", (sidebarShowThreadBranches) => {
    expect(sanitizePreferences({ sidebarShowThreadBranches })).toEqual({
      sidebarShowThreadBranches,
    });
  });

  it.each(["queue", "next-tool", "steer"] as const)(
    "retains the saved %s follow-up timing",
    (followUpBehavior) => {
      expect(sanitizePreferences({ followUpBehavior })).toEqual({ followUpBehavior });
    },
  );
  it.each(["artwork", "pill", "none"] as const)("retains the saved %s choice", (mode) => {
    expect(sanitizePreferences({ environmentIdentificationMode: mode, baseFontSize: 17 })).toEqual({
      environmentIdentificationMode: mode,
      baseFontSize: 17,
    });
  });

  it("drops an invalid stored choice without losing other preferences", () => {
    expect(
      sanitizePreferences(
        JSON.parse('{"environmentIdentificationMode":"invalid","baseFontSize":17}'),
      ),
    ).toEqual({ baseFontSize: 17 });
  });

  it("leaves older preferences without a choice to use the default", () => {
    expect(sanitizePreferences({ themeMode: "dark" })).toEqual({ themeMode: "dark" });
  });
});

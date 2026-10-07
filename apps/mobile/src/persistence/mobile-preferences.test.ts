import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("expo-secure-store", () => ({}));

import { sanitizePreferences } from "./mobile-preferences";

describe("environment identification preferences", () => {
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

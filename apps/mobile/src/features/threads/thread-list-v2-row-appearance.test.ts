import { describe, expect, it } from "vite-plus/test";
import { MOBILE_THEME_IDS } from "@t3tools/shared/themePalettes";

import {
  flattenThemeColor,
  getMobileThemeVariables,
  themeColorWithAlpha,
} from "../../lib/mobileTheme";
import { getThreadListV2RowAppearance as iosAppearance } from "./thread-list-v2-row-appearance";
import { getThreadListV2RowAppearance as androidAppearance } from "./thread-list-v2-row-appearance.android";

describe.each([
  ["ios", iosAppearance],
  ["android", androidAppearance],
] as const)("%s thread row colors", (_platform, appearanceFor) => {
  it.each([false, true])(
    "paints the draft tint on the actual row surface (sidebar: %s)",
    (sidebar) => {
      const theme = getMobileThemeVariables("t3-code", "dark");
      const surface = theme[sidebar ? "--color-drawer" : "--color-screen"];
      const draft = appearanceFor(theme, sidebar, false, true);
      const selected = appearanceFor(theme, sidebar, true, true);
      const expected = flattenThemeColor(
        themeColorWithAlpha(theme["--color-warning-foreground"], 0.08),
        surface,
      );
      expect(draft.style?.backgroundColor).toBe(expected);
      expect(draft.cardStyle?.backgroundColor).toBe(expected);
      expect(draft.providerIconSurfaceColor).toBe(expected);
      expect(expected).not.toBe(surface);
      expect(selected.style).toEqual(appearanceFor(theme, sidebar, true).style);
    },
  );
});

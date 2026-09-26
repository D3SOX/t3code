import { describe, expect, it } from "vite-plus/test";

import { pullRequestLinkContextMenuItems } from "./pullRequestLinkContextMenu";

describe("pull request link context menu", () => {
  it("always offers explicit in-app and browser destinations", () => {
    expect(pullRequestLinkContextMenuItems()).toEqual([
      { id: "open-app", label: "Open in T3 Code" },
      { id: "open-external", label: "Open in system browser" },
      { id: "copy-link", label: "Copy link", icon: "copy" },
    ]);
  });
});

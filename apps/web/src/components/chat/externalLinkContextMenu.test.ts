import { vi } from "vite-plus/test";
function createHarness(
  selection:
    | "open-in-preview"
    | "open-external"
    | "copy-link"
    | "link-to-thread"
    | "unlink-from-thread"
    | null,
) {
  const showContextMenu = vi.fn().mockResolvedValue(selection);
  const openInPreview = vi.fn().mockResolvedValue(undefined);
  const openExternal = vi.fn().mockResolvedValue(undefined);
  const copyLink = vi.fn().mockResolvedValue(undefined);
  const updateThreadLink = vi.fn().mockResolvedValue(undefined);
  const reportFailure = vi.fn();

  return {
    showContextMenu,
    openInPreview,
    openExternal,
    copyLink,
    updateThreadLink,
    reportFailure,
  };
}
import { showExternalLinkContextMenu } from "./externalLinkContextMenu";
import { describe, expect, it } from "vite-plus/test";

import { resolveExternalWebLinkHref } from "./externalLinkContextMenu";

describe("external chat link context menu", () => {
  it("can name the in-app pull request destination explicitly", async () => {
    const harness = createHarness(null);

    await showExternalLinkContextMenu({
      href: "https://github.com/pingdotgg/t3code/pull/42",
      inAppLabel: "Open in T3 Code",
      position: { x: 4, y: 8 },
      ...harness,
    });

    expect(harness.showContextMenu).toHaveBeenCalledWith(
      expect.arrayContaining([{ id: "open-in-preview", label: "Open in T3 Code" }]),
      { x: 4, y: 8 },
    );
  });

  it.each([
    [
      "https://example.com/docs?topic=security#links",
      "https://example.com/docs?topic=security#links",
    ],
    ["HTTP://EXAMPLE.COM", "http://example.com/"],
    ["//example.com/path", "https://example.com/path"],
  ])("resolves the safe external web-link href for %s as %s", (href, expected) => {
    expect(resolveExternalWebLinkHref(href)).toBe(expected);
  });

  it.each([
    "javascript:alert(document.domain)",
    " \nJaVaScRiPt:alert(document.domain)",
    "data:text/html,<script>alert(document.domain)</script>",
    "file:///tmp/example.txt",
    "mailto:hello@example.com",
    "/relative/path",
    "not a URL",
    "",
  ])("rejects unsafe external web-link href %s", (href) => {
    expect(resolveExternalWebLinkHref(href)).toBeNull();
  });
});

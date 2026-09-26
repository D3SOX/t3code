import type { ContextMenuItem } from "@t3tools/contracts";

import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { readLocalApi } from "~/localApi";

import { toastManager } from "../ui/toast";

export type PullRequestLinkContextMenuAction = "copy-link" | "open-app" | "open-external";

/** Named for the host rather than "externally": the point is where you will land. */
const OPEN_ON_HOST_LABELS: Partial<Record<string, string>> = {
  github: "Open on GitHub",
  gitlab: "Open on GitLab",
  forgejo: "Open on Forgejo",
  bitbucket: "Open on Bitbucket",
  "azure-devops": "Open on Azure DevOps",
};

export const openOnHostLabel = (provider: string): string =>
  OPEN_ON_HOST_LABELS[provider] ?? "Open on host";

/** Keep both explicit destinations available regardless of the saved click preference. */
export function pullRequestLinkContextMenuItems(): readonly ContextMenuItem<PullRequestLinkContextMenuAction>[] {
  return [
    { id: "open-app", label: "Open in T3 Code" },
    { id: "open-external", label: "Open in system browser" },
    { id: "copy-link", label: "Copy link", icon: "copy" },
  ];
}

/**
 * The right-click on a change request's number. Everywhere else that number is written it is a
 * link, and the gesture that copies a link is the one hand reaches for — so without this the
 * platform's own edit menu opens over a control that has nothing to cut, paste or select.
 *
 * The URL still comes from the host contract, while the in-app callback lets each surface select
 * the same pull request without making this menu aware of page and panel navigation.
 */
export async function showPullRequestLinkContextMenu({
  url,
  openInApp,
  position,
}: {
  readonly url: string;
  readonly openInApp: () => void | Promise<void>;
  readonly position: { readonly x: number; readonly y: number };
}): Promise<void> {
  const api = readLocalApi();
  if (!api) return;
  let action: PullRequestLinkContextMenuAction | null = null;
  try {
    action = await api.contextMenu.show(pullRequestLinkContextMenuItems(), position);
  } catch {
    // A menu that could not be shown has already cost the reader their right-click; there is
    // nothing to say about it that a second popup would not make worse.
    return;
  }
  try {
    if (action === "open-app") await openInApp();
    else if (action === "copy-link") await writeTextToClipboard(url, "link");
    else if (action === "open-external") await api.shell.openExternal(url);
  } catch {
    toastManager.add({
      type: "error",
      title: action === "copy-link" ? "Could not copy the link" : "Could not open the link",
    });
  }
}

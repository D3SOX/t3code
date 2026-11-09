import type { ContextMenuItem } from "@t3tools/contracts";
import {
  type SourceControlDefinition,
  UNKNOWN_SOURCE_CONTROL_CLIENT,
} from "@t3tools/client-runtime/source-control-clients";

import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { readLocalApi } from "~/localApi";

import { toastManager } from "../ui/toast";

export type PullRequestLinkContextMenuAction = "copy-link" | "open-app" | "open-external";

export const openOnHostLabel = (host: SourceControlDefinition): string =>
  host === UNKNOWN_SOURCE_CONTROL_CLIENT ? "Open on host" : `Open on ${host.label}`;

/** Keep both explicit destinations available regardless of the saved click preference. */
export function pullRequestLinkContextMenuItems(
  openLabel = "Open in system browser",
): readonly ContextMenuItem<PullRequestLinkContextMenuAction>[] {
  return [
    { id: "open-app", label: "Open in T3 Code" },
    { id: "open-external", label: openLabel },
    { id: "copy-link", label: "Copy link", icon: "copy" },
  ];
}

/** Own the context menu on change-request numbers so native edit menus do not cover link actions. */
export async function showPullRequestLinkContextMenu({
  url,
  openInApp,
  openLabel,
  position,
}: {
  readonly url: string;
  readonly openInApp: () => void | Promise<void>;
  readonly openLabel?: string;
  readonly position: { readonly x: number; readonly y: number };
}): Promise<void> {
  const api = readLocalApi();
  if (!api) return;
  let action: PullRequestLinkContextMenuAction | null = null;
  try {
    action = await api.contextMenu.show(pullRequestLinkContextMenuItems(openLabel), position);
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

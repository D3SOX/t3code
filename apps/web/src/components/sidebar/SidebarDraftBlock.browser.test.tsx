import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, MessageId, ProjectId, ThreadId } from "@t3tools/contracts";
import { Profiler } from "react";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { formatAssistantCitationForComposer } from "../../composer-logic";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { SidebarDraftBlock, useSidebarDrafts } from "./SidebarDraftBlock";

function DraftBlock({ onNavigateToDraft }: { onNavigateToDraft: (draftId: DraftId) => void }) {
  const { draftIds, routeDraftComposer } = useSidebarDrafts(null, null);
  return (
    <SidebarDraftBlock
      draftIds={draftIds}
      routeDraftComposer={routeDraftComposer}
      jumpLabelByDraftId={null}
      projectByKey={new Map()}
      projectDisplayNameByKey={new Map()}
      routeDraftId={null}
      onNavigateToDraft={onNavigateToDraft}
      onDraftContextMenu={vi.fn()}
    />
  );
}

it("keeps draft previews current through edits, promotion and removal", async () => {
  const expandedKey = "t3code:sidebar:drafts-expanded";
  const storedExpanded = localStorage.getItem(expandedKey);
  using _storage = {
    [Symbol.dispose]: () => {
      if (storedExpanded === null) localStorage.removeItem(expandedKey);
      else localStorage.setItem(expandedKey, storedExpanded);
    },
  };
  localStorage.removeItem(expandedKey);
  const initial = useComposerDraftStore.getState();
  using _store = {
    [Symbol.dispose]: () => useComposerDraftStore.setState(initial, true),
  };
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  const environmentId = EnvironmentId.make("draft-preview-environment");
  const projectRef = scopeProjectRef(environmentId, ProjectId.make("draft-preview-project"));
  const draftId = DraftId.make("draft-preview");
  const threadId = ThreadId.make("draft-preview-thread");
  const onRender = vi.fn();
  const onNavigateToDraft = vi.fn();
  await using screen = await render(
    <Profiler id="draft-block" onRender={onRender}>
      <ul>
        <DraftBlock onNavigateToDraft={onNavigateToDraft} />
      </ul>
    </Profiler>,
  );
  const row = screen.getByTestId("sidebar-draft-row");
  const toggle = screen.getByRole("button", { name: /^Drafts/ });
  await expect.element(row).not.toBeInTheDocument();
  await expect.element(toggle).not.toBeInTheDocument();

  await act(() => {
    initial.setProjectDraftThreadId(projectRef, draftId, { threadId });
    initial.setPrompt(draftId, "First draft preview");
  });
  await expect.element(row).toHaveAccessibleName("First draft preview, Unsent draft");

  const rendersBeforeOtherComposer = onRender.mock.calls.length;
  await act(() =>
    initial.setPrompt(scopeThreadRef(environmentId, ThreadId.make("other")), "Other composer"),
  );
  expect(onRender).toHaveBeenCalledTimes(rendersBeforeOtherComposer);
  await act(() => initial.setPrompt(draftId, "Updated draft preview"));
  await expect.element(row).toHaveAccessibleName("Updated draft preview, Unsent draft");

  const quote = "Cache the parsed config per worktree.";
  const citation = formatAssistantCitationForComposer({
    version: 1,
    environmentId,
    threadId: ThreadId.make("source-thread"),
    messageId: MessageId.make("source-message"),
    text: quote,
    start: 0,
    end: quote.length,
    prefix: "",
    suffix: "",
  });
  await act(() => initial.setPrompt(draftId, `${citation}Why per worktree?`));
  await expect.element(row).toHaveAccessibleName(`${quote} Why per worktree?, Unsent draft`);

  await act(() => initial.markDraftThreadPromoting(draftId));
  await expect.element(row).not.toBeInTheDocument();
  await act(() => initial.clearDraftThread(draftId));

  const nextDraftId = DraftId.make("next-draft-preview");
  await act(() => {
    initial.setProjectDraftThreadId(projectRef, nextDraftId, { threadId: ThreadId.make("next") });
    initial.setPrompt(nextDraftId, "Next draft preview");
  });
  await expect.element(row).toHaveAccessibleName("Next draft preview, Unsent draft");
  await expect.element(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
  await expect.element(row).not.toBeInTheDocument();
  await act(() => initial.setPrompt(nextDraftId, "Edited while collapsed"));
  await screen.rerender(
    <ul>
      <DraftBlock onNavigateToDraft={onNavigateToDraft} />
    </ul>,
  );
  await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
  await expect.element(row).not.toBeInTheDocument();
  await toggle.click();
  await expect.element(row).toHaveAccessibleName("Edited while collapsed, Unsent draft");
  await row.click();
  expect(onNavigateToDraft).toHaveBeenCalledWith(nextDraftId);
  await act(() => initial.clearDraftThread(nextDraftId));
  await expect.element(row).not.toBeInTheDocument();
  await expect.element(toggle).not.toBeInTheDocument();
});

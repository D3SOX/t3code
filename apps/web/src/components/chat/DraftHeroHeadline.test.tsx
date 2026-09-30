// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  onProjectChange: (_value: string) => {},
  setDraftProject: vi.fn(),
}));

vi.mock("~/composerDraftStore", () => ({
  useComposerDraftStore: (select: (store: Record<string, unknown>) => unknown) =>
    select({
      setLogicalProjectDraftThreadId: state.setDraftProject,
      getComposerDraft: () => null,
      applyStickyState: vi.fn(),
      setModelSelection: vi.fn(),
    }),
}));
vi.mock("~/hooks/useSettings", () => ({
  useClientSettings: (select: (settings: Record<string, unknown>) => unknown) =>
    select({ sidebarProjectSortOrder: "manual" }),
}));
vi.mock("~/logicalProject", () => ({ selectProjectGroupingSettings: () => ({}) }));
vi.mock("~/lib/chatThreadActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/chatThreadActions")>()),
  hasExplicitComposerModelSelection: () => false,
}));
vi.mock("~/state/entities", () => ({ useProjects: () => [], useThreadShells: () => [] }));
vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({ environments: [] }),
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("~/sidebarProjectGrouping", () => ({
  buildSidebarProjectSnapshots: () => [
    {
      projectKey: "project-a",
      displayName: "Repo A",
      environmentId: "environment-1",
      id: "project-a",
      groupedProjectCount: 1,
      memberProjects: [{ environmentId: "environment-1", id: "project-a" }],
      memberProjectRefs: [{ environmentId: "environment-1", projectId: "project-a" }],
    },
    {
      projectKey: "project-b",
      displayName: "Repo B",
      environmentId: "environment-1",
      id: "project-b",
      groupedProjectCount: 1,
      memberProjects: [{ environmentId: "environment-1", id: "project-b" }],
      memberProjectRefs: [{ environmentId: "environment-1", projectId: "project-b" }],
    },
  ],
  projectGroupsSpanEnvironments: () => false,
  buildSidebarProjectPickerEntries: ({ groups }: { groups: Array<Record<string, unknown>> }) =>
    groups.map((group) => ({ group, targetProject: (group.memberProjects as Array<unknown>)[0] })),
}));
vi.mock("../Sidebar.logic", () => ({ sortLogicalProjectsForSidebar: (groups: unknown) => groups }));
vi.mock("../ProjectFavicon", () => ({ ProjectFavicon: () => null }));
vi.mock("../ProjectEnvironmentBadge", () => ({ ProjectEnvironmentBadge: () => null }));
vi.mock("../ui/menu", async () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    Menu: Wrapper,
    MenuItem: Wrapper,
    MenuPopup: Wrapper,
    MenuRadioGroup: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange: (value: string) => void;
    }) => {
      state.onProjectChange = onValueChange;
      return <>{children}</>;
    },
    MenuRadioItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
      <button type="button" onClick={() => state.onProjectChange(value)}>
        {children}
      </button>
    ),
    MenuSeparator: () => null,
    MenuTrigger: Wrapper,
  };
});
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipPopup: () => null,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../ui/button", () => ({ InlineButton: () => <button type="button" /> }));

import { resolveThreadActionProjectRef } from "~/lib/chatThreadActions";
import { useUiStateStore } from "~/uiStateStore";
import { DraftHeroHeadline } from "./DraftHeroHeadline";

afterEach(() => {
  useUiStateStore.setState({ lastNewThreadProjectRef: null });
  state.setDraftProject.mockClear();
  vi.unstubAllGlobals();
});

describe("new-thread project selection", () => {
  it("uses the project selected in the composer for the next New thread click", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    useUiStateStore.setState({
      lastNewThreadProjectRef: { environmentId: "environment-1", projectId: "project-b" } as never,
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(() =>
      root.render(
        <DraftHeroHeadline
          draftId={"draft-1" as never}
          activeProjectRef={{ environmentId: "environment-1", projectId: "project-b" } as never}
          activeProjectTitle="Repo B"
        />,
      ),
    );

    const repoA = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Repo A"),
    );
    expect(repoA).toBeDefined();
    await act(() => repoA!.click());

    expect(state.setDraftProject).toHaveBeenCalledWith(
      "project-a",
      { environmentId: "environment-1", projectId: "project-a" },
      "draft-1",
    );
    const preferredProjectRef = useUiStateStore.getState().lastNewThreadProjectRef;
    expect(
      resolveThreadActionProjectRef({
        activeDraftThread: null,
        activeThread: { environmentId: "environment-1", projectId: "project-a" } as never,
        preferredProjectRef,
        defaultProjectRef: null,
        handleNewThread: async () => {},
      }),
    ).toEqual({ environmentId: "environment-1", projectId: "project-a" });

    await act(() => root.unmount());
    container.remove();
  });
});

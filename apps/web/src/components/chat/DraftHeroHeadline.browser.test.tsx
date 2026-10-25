import { render } from "../../../test/render";
import { describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  onProjectChange: (_value: string) => {},
  items: [] as Array<{ value: string; label: string }>,
  setDraftProject: vi.fn(),
}));

vi.mock("~/composerDraftStore", () => ({
  composerDraftHasUserContent: () => true,
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
vi.mock("~/hooks/useScratchProject", () => ({
  useScratchProject: () => ({
    scratchEnvironmentId: () => null,
    scratchWorkspaceRootFor: () => null,
    openScratchProject: vi.fn(),
  }),
}));
vi.mock("~/hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => vi.fn() }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null }));
vi.mock("~/state/server", () => ({ primaryServerKeybindingsAtom: {} }));
vi.mock("~/keybindings", () => ({ shortcutLabelForCommand: () => null }));
vi.mock("~/logicalProject", () => ({
  selectProjectGroupingSettings: () => ({}),
  deriveLogicalProjectKeyFromSettings: () => "project-a",
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
vi.mock("../ui/combobox", () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    Combobox: ({
      children,
      items,
      onValueChange,
    }: {
      children: React.ReactNode;
      items: Array<{ value: string; label: string }>;
      onValueChange: (item: { value: string; label: string }) => void;
    }) => {
      state.items = items;
      state.onProjectChange = (value) => onValueChange(items.find((item) => item.value === value)!);
      return <>{children}</>;
    },
    ComboboxList: ({
      children,
    }: {
      children: (item: { value: string; label: string }) => React.ReactNode;
    }) => <>{state.items.map(children)}</>,
    ComboboxItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: { value: string };
    }) => (
      <button type="button" onClick={() => state.onProjectChange(value.value)}>
        {children}
      </button>
    ),
    ComboboxPopup: Wrapper,
    ComboboxTrigger: Wrapper,
    ComboboxSearchInput: () => null,
    ComboboxEmpty: () => null,
    useComboboxFilter: () => ({ contains: () => true }),
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

describe("new-thread project selection", () => {
  it("uses the project selected in the composer for the next New thread click", async () => {
    state.setDraftProject.mockClear();
    state.onProjectChange = () => {};
    using _state = {
      [Symbol.dispose]: () => useUiStateStore.setState({ lastNewThreadProjectRef: null }),
    };
    useUiStateStore.setState({
      lastNewThreadProjectRef: { environmentId: "environment-1", projectId: "project-b" } as never,
    });
    await using screen = await render(
      <DraftHeroHeadline
        draftId={"draft-1" as never}
        activeProjectRef={{ environmentId: "environment-1", projectId: "project-b" } as never}
        activeProjectTitle="Repo B"
      />,
    );
    await screen.getByRole("button", { name: "Repo A" }).click();

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
  });
});

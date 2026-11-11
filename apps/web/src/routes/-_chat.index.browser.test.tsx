import { act, render } from "../../test/render";
import type { lazyRouteComponent } from "@tanstack/react-router";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  projects: [
    { environmentId: "environment-1", id: "recent-project" },
    { environmentId: "environment-1", id: "chosen-project" },
  ],
  setProjects: (_projects: Array<{ environmentId: string; id: string }>) => {},
  bootstrapped: true,
  startDraft: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: unknown) => ({
    options,
    useRouteContext: () => ({ authGateState: { status: "ready" } }),
  }),
  Link: () => null,
}));
vi.mock("../state/entities", async () => {
  const { useState } = await import("react");
  return {
    useProjects: () => {
      const [projects, setProjects] = useState(state.projects);
      state.setProjects = setProjects;
      return projects;
    },
    useVisibleThreadShells: () => [],
    useAllEnvironmentShellsBootstrapped: () => state.bootstrapped,
    readProject: (ref: { environmentId: string; projectId: string }) =>
      state.projects.find(
        (project) => project.environmentId === ref.environmentId && project.id === ref.projectId,
      ) ?? null,
  };
});
vi.mock("../state/projects", async () => {
  const { Atom } = await import("effect/reactivity");
  return { defaultProjectFallbackReadyAtom: () => Atom.make(state.bootstrapped) };
});
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({ environments: [], isReady: true }),
}));
vi.mock("../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => state.startDraft }));
vi.mock("../components/Sidebar.logic", () => ({
  sortScopedProjectsForSidebar: () => state.projects,
}));
vi.mock("../components/NoProjectsHero", () => ({ NoProjectsHero: () => null }));
vi.mock("../components/HostedEmptyState", () => ({ HostedEmptyState: () => null }));
vi.mock("../components/WorkspacePageHeader", () => ({ WorkspacePageHeader: () => null }));
vi.mock("../env", () => ({ isElectron: false }));

import { Route } from "./_chat.index";
import { useUiStateStore } from "../uiStateStore";

function setup() {
  state.startDraft.mockClear();
  state.bootstrapped = true;
  state.projects = [
    { environmentId: "environment-1", id: "recent-project" },
    { environmentId: "environment-1", id: "chosen-project" },
  ];
}

it.each([
  { remembered: "chosen-project", expected: "chosen-project" },
  { remembered: "removed-project", expected: "recent-project" },
  { remembered: null, expected: "recent-project" },
])(
  "returning home selects $expected when the remembered project is $remembered",
  async ({ remembered, expected }) => {
    setup();
    using _state = {
      [Symbol.dispose]: () => useUiStateStore.setState({ lastNewThreadProjectRef: null }),
    };
    useUiStateStore.setState({
      lastNewThreadProjectRef: remembered
        ? ({
            environmentId: "environment-1",
            projectId: remembered,
          } as never)
        : null,
    });
    const View = Route.options.component as ReturnType<typeof lazyRouteComponent>;
    await View.preload?.();
    await using _screen = await render(<View />);
    expect(state.startDraft).toHaveBeenCalledWith(
      { environmentId: "environment-1", projectId: expected },
      { replace: true, rememberProject: false },
    );
  },
);

it("waits for the remembered project's environment before choosing a fallback", async () => {
  setup();
  state.bootstrapped = false;
  state.projects = [{ environmentId: "environment-1", id: "recent-project" }];
  using _state = {
    [Symbol.dispose]: () => {
      state.bootstrapped = true;
      state.projects = [
        { environmentId: "environment-1", id: "recent-project" },
        { environmentId: "environment-1", id: "chosen-project" },
      ];
      useUiStateStore.setState({ lastNewThreadProjectRef: null });
    },
  };
  useUiStateStore.setState({
    lastNewThreadProjectRef: {
      environmentId: "environment-2",
      projectId: "chosen-project",
    } as never,
  });
  const View = Route.options.component as ReturnType<typeof lazyRouteComponent>;
  await View.preload?.();
  await using _screen = await render(<View />);
  expect(state.startDraft).not.toHaveBeenCalled();

  state.projects = [...state.projects, { environmentId: "environment-2", id: "chosen-project" }];
  state.bootstrapped = true;
  await act(() => state.setProjects(state.projects));
  await vi.waitFor(() => {
    expect(state.startDraft).toHaveBeenCalledExactlyOnceWith(
      { environmentId: "environment-2", projectId: "chosen-project" },
      { replace: true, rememberProject: false },
    );
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { lazyRouteComponent } from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  projects: [
    { environmentId: "environment-1", id: "recent-project" },
    { environmentId: "environment-1", id: "chosen-project" },
  ],
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
vi.mock("../state/entities", () => ({
  useProjects: () => state.projects,
  useThreadShells: () => [],
  useAllEnvironmentShellsBootstrapped: () => true,
}));
vi.mock("../state/environments", () => ({
  useEnvironments: () => ({ environments: [], isReady: true }),
}));
vi.mock("../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => state.startDraft }));
vi.mock("../components/Sidebar.logic", () => ({
  sortScopedProjectsForSidebar: () => state.projects,
}));
vi.mock("../components/NoProjectsHero", () => ({ NoProjectsHero: () => null }));
vi.mock("../components/WorkspacePageHeader", () => ({ WorkspacePageHeader: () => null }));
vi.mock("../env", () => ({ isElectron: false }));

import { Route } from "./_chat.index";
import { useUiStateStore } from "../uiStateStore";

afterEach(() => {
  useUiStateStore.setState({ lastNewThreadProjectRef: null });
  state.startDraft.mockClear();
  vi.unstubAllGlobals();
});

it.each([
  { remembered: "chosen-project", expected: "chosen-project" },
  { remembered: "removed-project", expected: "recent-project" },
  { remembered: null, expected: "recent-project" },
])(
  "returning home selects $expected when the remembered project is $remembered",
  async ({ remembered, expected }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    useUiStateStore.setState({
      lastNewThreadProjectRef: remembered
        ? ({
            environmentId: "environment-1",
            projectId: remembered,
          } as never)
        : null,
    });
    const container = document.createElement("div");
    const root = createRoot(container);
    const View = Route.options.component as ReturnType<typeof lazyRouteComponent>;
    try {
      await View.preload?.();
      await act(() => root.render(<View />));
      expect(state.startDraft).toHaveBeenCalledWith(
        { environmentId: "environment-1", projectId: expected },
        { replace: true },
      );
    } finally {
      await act(() => root.unmount());
    }
  },
);

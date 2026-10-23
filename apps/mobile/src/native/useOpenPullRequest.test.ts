import { AsyncResult } from "effect/reactivity";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  preferences: {} as { pullRequestLinkTarget?: "system" | "app" },
  navigate: vi.fn(),
  dispatch: vi.fn(),
  reset: vi.fn(),
  openExternal: vi.fn(async () => true),
}));

vi.mock("react", () => ({ useCallback: <T>(callback: T) => callback }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: state.navigate, dispatch: state.dispatch }),
  StackActions: { replace: vi.fn() },
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => AsyncResult.success(state.preferences),
}));
vi.mock("../state/preferences", () => ({ mobilePreferencesAtom: {} }));
vi.mock("../state/entities", () => ({ useThreadShell: vi.fn() }));
vi.mock("../lib/android-workspace-navigation", () => ({ resetAndroidWorkspace: state.reset }));
vi.mock("../lib/openExternalUrl", () => ({ tryOpenExternalUrl: state.openExternal }));
vi.mock("../lib/copyTextWithHaptic", () => ({ copyTextWithHaptic: vi.fn() }));

import { useNavigateToPullRequest, pullRequestLinkContextMenu } from "./useOpenPullRequest";

const url = "https://github.com/D3SOX/t3code/pull/65";
const context = { environmentId: "environment", projectId: "project" };

beforeEach(() => {
  vi.clearAllMocks();
  state.preferences = {};
  state.openExternal.mockResolvedValue(true);
});

describe("mobile pull request link destinations", () => {
  it("opens PR links externally by default, like desktop", async () => {
    expect(await useNavigateToPullRequest()(url, context)).toBe(true);
    expect(state.openExternal).toHaveBeenCalledWith(url, "pull-request");
    expect(state.reset).not.toHaveBeenCalled();
  });

  it("honors the saved in-app preference", async () => {
    state.preferences = { pullRequestLinkTarget: "app" };
    expect(await useNavigateToPullRequest()(url, context)).toBe(true);
    expect(state.reset).toHaveBeenCalledWith(expect.anything(), {
      name: "PullRequest",
      params: { ...context, repository: "d3sox/t3code", host: "github.com", number: 65 },
    });
    expect(state.openExternal).not.toHaveBeenCalled();
  });

  it("falls back to the host when the PR has no project context", async () => {
    state.preferences = { pullRequestLinkTarget: "app" };
    expect(await useNavigateToPullRequest()(url, null)).toBe(true);
    expect(state.openExternal).toHaveBeenCalledWith(url, "pull-request");
  });

  it("can open one link inside T3 without changing the default", async () => {
    await useNavigateToPullRequest()(url, context, "app");
    expect(state.reset).toHaveBeenCalled();
    expect(state.openExternal).not.toHaveBeenCalled();
    expect(state.preferences).toEqual({});
  });

  it("can open one link externally despite the in-app preference", async () => {
    state.preferences = { pullRequestLinkTarget: "app" };
    await useNavigateToPullRequest()(url, context, "system");
    expect(state.openExternal).toHaveBeenCalledWith(url, "pull-request");
    expect(state.reset).not.toHaveBeenCalled();
  });

  it("opens a Markdown link in T3 from its menu while clicks use the system default", () => {
    const navigate = useNavigateToPullRequest();
    const menu = pullRequestLinkContextMenu((url, target) => navigate(url, context, target));
    expect(menu.fileContextMenu(url)?.actions.map((action) => action.id)).toEqual([
      "pr-open-app",
      "pr-open-system",
      "pr-copy-link",
    ]);
    menu.onFileContextMenuAction(url, "pr-open-app");
    expect(state.reset).toHaveBeenCalled();
    expect(state.openExternal).not.toHaveBeenCalled();
  });

  it("opens a Markdown link externally from its menu while clicks use T3", () => {
    state.preferences = { pullRequestLinkTarget: "app" };
    const navigate = useNavigateToPullRequest();
    const menu = pullRequestLinkContextMenu((url, target) => navigate(url, context, target));
    menu.onFileContextMenuAction(url, "pr-open-system");
    expect(state.openExternal).toHaveBeenCalledWith(url, "pull-request");
    expect(state.reset).not.toHaveBeenCalled();
    expect(menu.fileContextMenu("https://example.com")).toBeUndefined();
  });

  it("reports an external opening failure without switching to the in-app viewer", async () => {
    state.openExternal.mockResolvedValue(false);
    expect(await useNavigateToPullRequest()(url, context)).toBe(false);
    expect(state.reset).not.toHaveBeenCalled();
  });
});

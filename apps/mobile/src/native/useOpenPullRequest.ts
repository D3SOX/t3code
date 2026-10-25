import { useNavigation, useRoute, StackActions } from "@react-navigation/native";
import { nativePullRequestDestination } from "../lib/pullRequestNavigation";
import { useCallback } from "react";
import { Platform } from "react-native";
import { resetAndroidWorkspace } from "../lib/android-workspace-navigation";
import {
  DEFAULT_PULL_REQUEST_LINK_TARGET,
  EnvironmentId,
  ThreadId,
  type BrowserLinkTarget,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useProjects, useThreadShell } from "../state/entities";
import { tryOpenExternalUrl } from "../lib/openExternalUrl";
import { mobilePreferencesAtom } from "../state/preferences";
import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import { copyTextWithHaptic } from "../lib/copyTextWithHaptic";
import { appAtomRegistry } from "../state/atom-registry";
import { environmentServerConfigsAtom } from "../state/server";

type PullRequestContext = { readonly environmentId: string; readonly projectId: string };

// Avoid useRoute so layouts without route context can open any thread's pull requests.
export function useNavigateToPullRequest(options?: { readonly replace?: boolean }) {
  const navigation = useNavigation();
  const projects = useProjects();
  const replace = options?.replace;
  const preferences = useAtomValue(mobilePreferencesAtom);
  const linkTarget = AsyncResult.isSuccess(preferences)
    ? (preferences.value.pullRequestLinkTarget ?? DEFAULT_PULL_REQUEST_LINK_TARGET)
    : DEFAULT_PULL_REQUEST_LINK_TARGET;
  return useCallback(
    async (url: string, context: PullRequestContext | null, target = linkTarget) => {
      if (target === "system") return tryOpenExternalUrl(url, "pull-request");
      // Read at press time so a capability push does not hand every link a new handler.
      const serverConfigs = appAtomRegistry.get(environmentServerConfigsAtom);
      const params = nativePullRequestDestination(
        url,
        context,
        projects,
        (environmentId) => serverConfigs.get(environmentId)?.environment.capabilities,
      );
      if (!params) return tryOpenExternalUrl(url, "pull-request");
      if (Platform.OS === "android")
        resetAndroidWorkspace(navigation, { name: "PullRequest", params });
      else if (replace) navigation.dispatch(StackActions.replace("PullRequest", params));
      else navigation.navigate("PullRequest", params);
      return true;
    },
    [navigation, projects, replace, linkTarget],
  );
}

export function useOpenPullRequest(options?: {
  readonly replace?: boolean;
  readonly context?: PullRequestContext;
}) {
  const route = useRoute();
  const routeContext = route.params as
    | {
        environmentId?: string | string[];
        projectId?: string | string[];
        threadId?: string | string[];
      }
    | undefined;
  const first = (value: string | string[] | undefined) => {
    const text = Array.isArray(value) ? value[0] : value;
    return text?.trim() ? text : undefined;
  };
  const environmentId = options?.context?.environmentId ?? first(routeContext?.environmentId);
  const threadId = first(routeContext?.threadId);
  const thread = useThreadShell(
    environmentId && threadId
      ? { environmentId: EnvironmentId.make(environmentId), threadId: ThreadId.make(threadId) }
      : null,
  );
  const projectId =
    options?.context?.projectId ?? first(routeContext?.projectId) ?? thread?.projectId;
  const navigateToPullRequest = useNavigateToPullRequest({ replace: options?.replace });
  return useCallback(
    (url: string, target?: BrowserLinkTarget) =>
      navigateToPullRequest(
        url,
        environmentId && projectId
          ? { environmentId: String(environmentId), projectId: String(projectId) }
          : null,
        target,
      ),
    [environmentId, projectId, navigateToPullRequest],
  );
}

export function pullRequestLinkContextMenu(open: ReturnType<typeof useOpenPullRequest>) {
  return {
    fileContextMenu: (url: string) =>
      sourceControlClients.parseChangeRequestUrl(url)
        ? {
            title: url,
            actions: [
              { id: "pr-open-app", title: "Open in T3 Code" },
              { id: "pr-open-system", title: "Open in system browser" },
              { id: "pr-copy-link", title: "Copy link" },
            ],
          }
        : undefined,
    onFileContextMenuAction: (url: string, action: string) => {
      if (action === "pr-open-app") void open(url, "app");
      else if (action === "pr-open-system") void open(url, "system");
      else if (action === "pr-copy-link") copyTextWithHaptic(url, { target: "pull request link" });
    },
  };
}

import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import { mobilePreferencesAtom, saveMobilePreferences } from "../../state/preferences";
import { useAtomCommand } from "../../state/use-atom-command";

export function useThreadListV2ShelfPreferences() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomCommand(saveMobilePreferences);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const pinnedShelfExpanded =
    !loaded || preferencesResult.value.threadListPinnedShelfExpanded !== false;
  const activeShelfExpanded =
    !loaded || preferencesResult.value.threadListActiveShelfExpanded !== false;
  const togglePinnedShelf = () => {
    if (!loaded) return;
    void savePreferences({
      transform: (current) => ({
        threadListPinnedShelfExpanded: current.threadListPinnedShelfExpanded === false,
      }),
    });
  };
  const toggleActiveShelf = () => {
    if (!loaded) return;
    void savePreferences({
      transform: (current) => ({
        threadListActiveShelfExpanded: current.threadListActiveShelfExpanded === false,
      }),
    });
  };
  const snoozedShelfExpanded =
    loaded && preferencesResult.value.threadListSnoozedShelfExpanded === true;
  const settledShelfExpanded =
    loaded && preferencesResult.value.threadListSettledShelfExpanded === true;
  const workingShelfEnabled = loaded && preferencesResult.value.workingShelfEnabled !== false;
  const workingShelfExpanded =
    loaded && preferencesResult.value.threadListWorkingShelfExpanded === true;
  const watchingShelfExpanded =
    loaded && preferencesResult.value.threadListWatchingShelfExpanded === true;

  // Transforms read optimistic state so same-frame presses toggle twice.
  const toggleSnoozedShelf = () => {
    if (!loaded) return;
    void savePreferences({
      transform: (current) => ({
        threadListSnoozedShelfExpanded: current.threadListSnoozedShelfExpanded !== true,
      }),
    });
  };
  const toggleSettledShelf = () => {
    if (!loaded) return;
    void savePreferences({
      transform: (current) => ({
        threadListSettledShelfExpanded: current.threadListSettledShelfExpanded !== true,
      }),
    });
  };
  const toggleWorkingShelf = () => {
    if (!loaded) return;
    void savePreferences({
      transform: (current) => ({
        threadListWorkingShelfExpanded: current.threadListWorkingShelfExpanded !== true,
      }),
    });
  };
  const toggleWatchingShelf = () => {
    if (!loaded) return;
    void savePreferences({
      transform: (current) => ({
        threadListWatchingShelfExpanded: current.threadListWatchingShelfExpanded !== true,
      }),
    });
  };
  return {
    loaded,
    pinnedShelfExpanded,
    activeShelfExpanded,
    togglePinnedShelf,
    toggleActiveShelf,
    settledShelfExpanded,
    snoozedShelfExpanded,
    workingShelfEnabled,
    workingShelfExpanded,
    watchingShelfExpanded,
    toggleSettledShelf,
    toggleSnoozedShelf,
    toggleWorkingShelf,
    toggleWatchingShelf,
  } as const;
}

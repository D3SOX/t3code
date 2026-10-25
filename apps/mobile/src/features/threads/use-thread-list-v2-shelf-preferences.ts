import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useRef } from "react";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
export function useThreadListV2ShelfPreferences() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const pinnedShelfExpanded =
    !loaded || preferencesResult.value.threadListPinnedShelfExpanded !== false;
  const activeShelfExpanded =
    !loaded || preferencesResult.value.threadListActiveShelfExpanded !== false;
  const pinnedShelfExpandedRef = useRef(pinnedShelfExpanded);
  const activeShelfExpandedRef = useRef(activeShelfExpanded);
  useEffect(() => {
    pinnedShelfExpandedRef.current = pinnedShelfExpanded;
    activeShelfExpandedRef.current = activeShelfExpanded;
  }, [pinnedShelfExpanded, activeShelfExpanded]);
  const togglePinnedShelf = () => {
    if (!loaded) return;
    const expanded = !pinnedShelfExpandedRef.current;
    pinnedShelfExpandedRef.current = expanded;
    savePreferences({
      threadListPinnedShelfExpanded: expanded,
    });
  };
  const toggleActiveShelf = () => {
    if (!loaded) return;
    const expanded = !activeShelfExpandedRef.current;
    activeShelfExpandedRef.current = expanded;
    savePreferences({
      threadListActiveShelfExpanded: expanded,
    });
  };
  const snoozedShelfExpanded =
    loaded && preferencesResult.value.threadListSnoozedShelfExpanded === true;
  const settledShelfExpanded =
    loaded && preferencesResult.value.threadListSettledShelfExpanded === true;
  const workingShelfEnabled = loaded && preferencesResult.value.workingShelfEnabled === true;
  const workingShelfExpanded =
    loaded && preferencesResult.value.threadListWorkingShelfExpanded === true;

  // Transforms read optimistic state so same-frame presses toggle twice.
  const toggleSnoozedShelf = () => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => ({
        threadListSnoozedShelfExpanded: current.threadListSnoozedShelfExpanded !== true,
      }),
    });
  };
  const toggleSettledShelf = () => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => ({
        threadListSettledShelfExpanded: current.threadListSettledShelfExpanded !== true,
      }),
    });
  };
  const toggleWorkingShelf = () => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => ({
        threadListWorkingShelfExpanded: current.threadListWorkingShelfExpanded !== true,
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
    toggleSettledShelf,
    toggleSnoozedShelf,
    toggleWorkingShelf,
  } as const;
}

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "./preferences";

export function useEnvironmentIdentification() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  return {
    mode: AsyncResult.isSuccess(preferences)
      ? (preferences.value.environmentIdentificationMode ?? DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE)
      : DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE,
    isReady: AsyncResult.isSuccess(preferences),
    savePreferences,
  };
}

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import Constants from "expo-constants";
import { resolveMobileStageLabel } from "../lib/mobileBranding";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "./preferences";

export function useEnvironmentIdentification() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const mode = AsyncResult.isSuccess(preferences)
    ? (preferences.value.environmentIdentificationMode ?? DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE)
    : DEFAULT_ENVIRONMENT_IDENTIFICATION_MODE;
  const stage = resolveMobileStageLabel(Constants.expoConfig?.extra?.appVariant);
  return {
    mode,
    artworkStage: mode === "artwork" && stage !== "Alpha" ? stage : null,
    isReady: AsyncResult.isSuccess(preferences),
    savePreferences,
  };
}

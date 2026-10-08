import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsScreen } from "./components/SettingsScreen";
import { CodeAppearanceSection } from "./appearance/sections/CodeAppearanceSection";
import { TerminalAppearanceSection } from "./appearance/sections/TerminalAppearanceSection";
import { TextAppearanceSection } from "./appearance/sections/TextAppearanceSection";
import { ThemeAppearanceSection } from "./appearance/sections/ThemeAppearanceSection";
import { EnvironmentIdentificationSection } from "./appearance/sections/EnvironmentIdentificationSection";

export function SettingsAppearanceRouteScreen() {
  const insets = useSafeAreaInsets();

  return (
    <SettingsScreen title="Appearance">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 18) + 18,
        }}
      >
        <ThemeAppearanceSection />
        <EnvironmentIdentificationSection />
        <ThreadDisplaySettingsSection />
        <TextAppearanceSection />
        <TerminalAppearanceSection />
        <CodeAppearanceSection />
      </ScrollView>
    </SettingsScreen>
  );
}

function ThreadDisplaySettingsSection() {
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const showThreadBranches =
    !AsyncResult.isSuccess(preferences) || preferences.value.sidebarShowThreadBranches !== false;

  return (
    <SettingsSection title="Thread display">
      <SettingsSwitchRow
        icon="arrow.triangle.branch"
        label="Show thread branches"
        subtitle="Turn off for more compact thread rows."
        value={showThreadBranches}
        onValueChange={(value) => savePreferences({ sidebarShowThreadBranches: value })}
      />
    </SettingsSection>
  );
}

import { Pressable, View } from "react-native";
import { AppText as Text } from "../../../../components/AppText";
import { useEnvironmentIdentification } from "../../../../state/environmentIdentification";
import { SettingsSection } from "../../components/SettingsSection";

const OPTIONS = [
  { mode: "artwork", label: "Artwork" },
  { mode: "pill", label: "Pill" },
  { mode: "none", label: "None" },
] as const;

export function EnvironmentIdentificationSection() {
  const { mode, isReady, savePreferences } = useEnvironmentIdentification();
  return (
    <View className="gap-2">
      <SettingsSection title="Environment identification">
        {OPTIONS.map((option) => (
          <Pressable
            key={option.mode}
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === option.mode, disabled: !isReady }}
            disabled={!isReady}
            onPress={() => savePreferences({ environmentIdentificationMode: option.mode })}
            className="min-h-12 flex-row items-center justify-between gap-4 px-4 py-3 active:bg-subtle"
          >
            <Text className="text-base text-foreground">{option.label}</Text>
            {mode === option.mode ? (
              <Text className="text-sm text-primary-text">Selected</Text>
            ) : null}
          </Pressable>
        ))}
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        Choose how Dev and Nightly environments are identified.
      </Text>
    </View>
  );
}

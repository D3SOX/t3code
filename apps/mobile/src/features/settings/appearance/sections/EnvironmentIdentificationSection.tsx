import { msg, T, useGT, useMessages } from "gt-react-native";
import { Pressable, View } from "react-native";
import { AppText as Text } from "../../../../components/ui/AppText";
import { useEnvironmentIdentification } from "../../../../state/environmentIdentification";
import { SettingsSection } from "../../components/SettingsSection";

const OPTIONS = [
  { mode: "artwork", label: msg("Artwork") },
  { mode: "pill", label: msg("Pill") },
  { mode: "none", label: msg("None") },
] as const;

export function EnvironmentIdentificationSection() {
  const gt = useGT();
  const m = useMessages();
  const { mode, isReady, savePreferences } = useEnvironmentIdentification();
  return (
    <View className="gap-2">
      <SettingsSection title={gt("Environment identification")}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.mode}
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === option.mode, disabled: !isReady }}
            disabled={!isReady}
            onPress={() => savePreferences({ environmentIdentificationMode: option.mode })}
            className="min-h-12 flex-row items-center justify-between gap-4 px-4 py-3 active:bg-subtle"
          >
            <Text className="text-base text-foreground">{m(option.label)}</Text>
            {mode === option.mode ? (
              <Text className="text-sm text-primary-text">
                <T>Selected</T>
              </Text>
            ) : null}
          </Pressable>
        ))}
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        <T>Choose how Dev and Nightly environments are identified.</T>
      </Text>
    </View>
  );
}

import { msg, T, useGT, useMessages, Var } from "gt-react-native";
import { DEFAULT_PULL_REQUEST_LINK_TARGET } from "@t3tools/contracts";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { DEFAULT_FOLLOW_UP_BEHAVIOR, type FollowUpBehavior } from "../../lib/followUpBehavior";
import { mobilePreferencesAtom, saveMobilePreferences } from "../../state/preferences";
import { useAtomCommand } from "../../state/use-atom-command";
import { ListChoiceRow as SettingsChoiceRow } from "../../components/ui/ListChoiceRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";

const FOLLOW_UP_OPTIONS: ReadonlyArray<{
  readonly behavior: FollowUpBehavior;
  readonly label: string;
  readonly description: string;
}> = [
  {
    behavior: "queue",
    label: msg("After current turn"),
    description: msg("Your message waits and runs after the current turn finishes."),
  },
  {
    behavior: "next-tool",
    label: msg("After next tool call"),
    description: msg(
      "Wait for the next tool to finish, then steer the active turn. If the turn ends first, run next.",
    ),
  },
  {
    behavior: "steer",
    label: msg("Steer", { $context: "verb, follow-up behavior" }),
    description: msg("Your message reaches the agent right away, changing what it is working on."),
  },
];

export function SettingsFollowUpRouteScreen() {
  const gt = useGT();
  const m = useMessages();
  const insets = useSafeAreaInsets();
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomCommand(saveMobilePreferences);
  const preferencesReady = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;
  const selectedBehavior = AsyncResult.isSuccess(preferencesResult)
    ? (preferencesResult.value.followUpBehavior ?? DEFAULT_FOLLOW_UP_BEHAVIOR)
    : null;

  const content = (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      className="flex-1"
      contentContainerClassName="gap-3 px-5 pt-4"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
    >
      <SettingsSection title={gt("While the agent is running")}>
        {FOLLOW_UP_OPTIONS.map((option, index) => (
          <SettingsChoiceRow
            key={option.behavior}
            label={m(option.label)}
            description={m(option.description)}
            selected={selectedBehavior === option.behavior}
            separated={index > 0}
            disabled={!preferencesReady}
            onPress={() => {
              void savePreferences({ followUpBehavior: option.behavior });
            }}
          />
        ))}
      </SettingsSection>
      <PullRequestLinkSettings />
      <Text className="px-2 text-sm text-foreground-muted">
        <T>
          Long-press the send button to use the other option for a single message. With a hardware
          keyboard, hold <Var>{Platform.OS === "android" ? "Ctrl" : "Command"}</Var> while sending.
        </T>
      </Text>
    </ScrollView>
  );

  return <SettingsScreen title={gt("Chat")}>{content}</SettingsScreen>;
}

function PullRequestLinkSettings() {
  const gt = useGT();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const save = useAtomCommand(saveMobilePreferences);
  const ready = AsyncResult.isSuccess(preferences) && !preferences.waiting;
  const target = AsyncResult.isSuccess(preferences)
    ? (preferences.value.pullRequestLinkTarget ?? DEFAULT_PULL_REQUEST_LINK_TARGET)
    : null;
  return (
    <SettingsSection title={gt("Open pull requests in")}>
      <SettingsChoiceRow
        label={gt("System browser")}
        description={gt("Open links with your device's default app.")}
        selected={target === "system"}
        disabled={!ready}
        onPress={() => save({ pullRequestLinkTarget: "system" })}
      />
      <SettingsChoiceRow
        label="T3 Code"
        description={gt("View pull requests inside T3 Code.")}
        selected={target === "app"}
        disabled={!ready}
        separated
        onPress={() => save({ pullRequestLinkTarget: "app" })}
      />
    </SettingsSection>
  );
}

import { type RefObject, useLayoutEffect, useRef } from "react";
import { Pressable, TextInput, type TextInputInstance, View } from "react-native";

import { SymbolView } from "./AppSymbol";
import { useAndroidControlSizing } from "./useAndroidControlSizing";

export interface SearchFieldProps {
  readonly autoFocus?: boolean;
  readonly inputRef: RefObject<TextInputInstance | null>;
  readonly accessibilityLabel: string;
  readonly clearAccessibilityLabel: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
}

export function SearchField({
  inputRef,
  autoFocus = true,
  accessibilityLabel,
  clearAccessibilityLabel,
  placeholder,
  value,
  onChangeText,
}: SearchFieldProps) {
  const { scale, mediumIconSize } = useAndroidControlSizing();
  // The field owns its text: a controlled value that lags fast typing overwrites the newer native
  // text and drops letters. Values this field reported come back as stale echoes and are skipped.
  const reported = useRef([value]);
  const report = (text: string) => {
    reported.current.push(text);
    onChangeText(text);
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- pushes a caller's reset (closing search) into the uncontrolled native field
  useLayoutEffect(() => {
    const echo = reported.current.indexOf(value);
    if (echo >= 0) {
      reported.current.splice(0, echo + 1);
      return;
    }
    reported.current = [];
    // Callers only ever reset the query; TextInput has no imperative way to set other text.
    if (value === "") inputRef.current?.clear();
  }, [inputRef, value]);
  return (
    <View
      className="min-w-0 flex-1 flex-row items-center rounded-full border border-input-border bg-input"
      style={{
        minHeight: Math.max(48, 42 * scale),
        gap: 7 * scale,
        paddingHorizontal: 10.5 * scale,
      }}
    >
      <SymbolView
        name="magnifyingglass"
        size={mediumIconSize}
        tintColorClassName="accent-foreground-muted"
      />
      <TextInput
        ref={inputRef}
        accessibilityLabel={accessibilityLabel}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        placeholder={placeholder}
        placeholderTextColorClassName="accent-placeholder"
        selectionColorClassName="accent-focus/32"
        cursorColorClassName="accent-focus"
        selectionHandleColorClassName="accent-focus"
        className="min-w-0 flex-1 font-sans text-base text-foreground"
        style={{ minHeight: Math.max(48, 42 * scale), paddingVertical: 7 * scale }}
        defaultValue={value}
        onChangeText={report}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityLabel={clearAccessibilityLabel}
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => {
            inputRef.current?.clear();
            report("");
            inputRef.current?.focus();
          }}
        >
          <SymbolView
            name="xmark.circle.fill"
            size={mediumIconSize}
            tintColorClassName="accent-foreground-muted"
          />
        </Pressable>
      ) : null}
    </View>
  );
}

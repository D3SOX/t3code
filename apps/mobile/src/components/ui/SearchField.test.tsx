import { act, createRef, type Ref } from "react";
import { createRoot } from "react-dom/client";
import type { TextInputInstance } from "react-native";
import { expect, it, vi } from "vite-plus/test";

const native = vi.hoisted(() => ({
  clear: vi.fn(),
  onChangeText: (_text: string) => {},
}));

vi.mock("react-native", async () => {
  const { useImperativeHandle } = await import("react");
  return {
    View: (props: { readonly children?: unknown }) => props.children,
    Pressable: () => null,
    TextInput: (props: {
      readonly ref: Ref<unknown>;
      readonly onChangeText: (text: string) => void;
    }) => {
      useImperativeHandle(props.ref, () => ({ clear: native.clear, focus: () => {} }));
      native.onChangeText = props.onChangeText;
      return null;
    },
  };
});
vi.mock("./AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("./useAndroidControlSizing", () => ({
  useAndroidControlSizing: () => ({ scale: 1, mediumIconSize: 16 }),
}));

import { SearchField } from "./SearchField";

it("keeps typed text when the caller's value lags, and applies the caller's reset", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  const inputRef = createRef<TextInputInstance>();
  const render = (value: string) =>
    act(() =>
      root.render(
        <SearchField
          inputRef={inputRef}
          accessibilityLabel="Search"
          clearAccessibilityLabel="Clear"
          placeholder="Search"
          value={value}
          onChangeText={() => {}}
        />,
      ),
    );
  render("");
  native.onChangeText("w");
  native.onChangeText("we");
  // The caller catches up one keystroke at a time.
  render("w");
  render("we");
  expect(native.clear).not.toHaveBeenCalled();

  render("");
  expect(native.clear).toHaveBeenCalledOnce();
  act(() => root.unmount());
});

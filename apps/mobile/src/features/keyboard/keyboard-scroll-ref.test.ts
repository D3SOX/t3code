import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeVM from "node:vm";
import { describe, expect, it, vi } from "vite-plus/test";

const require = NodeModule.createRequire(import.meta.url);
const packageRoot = NodePath.dirname(
  require.resolve("react-native-keyboard-controller/package.json"),
);
const babel = require(
  require.resolve("@babel/core", { paths: [require.resolve("babel-preset-expo")] }),
) as {
  transformFileSync: (file: string, options: Record<string, unknown>) => { code: string };
};

const compile = (file: string) =>
  babel.transformFileSync(NodePath.join(packageRoot, file), {
    configFile: NodePath.resolve(import.meta.dirname, "../../..", "babel.config.js"),
    envName: "production",
    caller: { name: "metro", platform: "android", isDev: false, supportsStaticESM: false },
  }).code;

describe("keyboard chat scroll correction", () => {
  it.each([true, false])("handles the UI-runtime animated ref (mounted: %s)", (mounted) => {
    const dispatchScroll = vi.fn();
    const frames: Array<() => void> = [];
    let reactToPadding: ((current: number, previous: number) => void) | undefined;
    const module: {
      exports: {
        useExtraContentPadding?: (options: Record<string, unknown>) => void;
      };
    } = { exports: {} };
    const reanimated = {
      useAnimatedReaction: (_prepare: unknown, reaction: typeof reactToPadding) => {
        reactToPadding = reaction;
      },
      scrollTo: (ref: { value: unknown }, ...args: unknown[]) => {
        if (ref.value) dispatchScroll(...args);
      },
    };
    NodeVM.runInNewContext(
      compile("src/components/KeyboardChatScrollView/useExtraContentPadding/index.ts"),
      {
        module,
        exports: module.exports,
        requestAnimationFrame: (frame: () => void) => frames.push(frame),
        require: (name: string) => {
          if (name.startsWith("@babel/runtime/")) return require(name);
          switch (name) {
            case "react":
              return { useCallback: (callback: unknown) => callback };
            case "react-native":
              return { Platform: { OS: "android" } };
            case "react-native-reanimated":
            case "../../../reanimated":
              return reanimated;
            case "../../utils/safeScrollTo": {
              const helper = { exports: {} };
              NodeVM.runInNewContext(compile("src/components/utils/safeScrollTo.ts"), {
                module: helper,
                exports: helper.exports,
                require: (name: string) => {
                  if (name.startsWith("@babel/runtime/")) return require(name);
                  if (name === "react-native-reanimated") return reanimated;
                  throw new Error(`Unexpected helper dependency: ${name}`);
                },
              });
              return helper.exports;
            }
            case "../../../architecture":
              return { IS_FABRIC: true };
            case "../useChatKeyboard/helpers":
              return { isScrollAtEnd: () => true, shouldShiftContent: () => true };
            default:
              throw new Error(`Unexpected dependency: ${name}`);
          }
        },
      },
    );
    module.exports.useExtraContentPadding!({
      scrollViewRef: { value: mounted ? {} : null },
      extraContentPadding: { value: 100 },
      keyboardPadding: { value: 0 },
      blankSpace: { value: 0 },
      adjustedInsetCompensation: 0,
      adjustedStartInsetCompensation: 0,
      scroll: { value: 200 },
      layout: { value: { height: 800 } },
      size: { value: { height: 1000 } },
      inverted: false,
      keyboardLiftBehavior: "persistent",
      freeze: { value: false },
    });
    reactToPadding!(100, 0);
    expect(frames).toHaveLength(1);
    expect(() => frames[0]!()).not.toThrow();
    if (mounted) expect(dispatchScroll).toHaveBeenCalledWith(0, 300, false);
    else expect(dispatchScroll).not.toHaveBeenCalled();
  });
});

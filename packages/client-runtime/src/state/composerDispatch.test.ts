import { describe, expect, it } from "vite-plus/test";

import {
  alternateComposerDispatchAction,
  resolveComposerDispatchMode,
} from "./composerDispatch.ts";

describe("resolveComposerDispatchMode", () => {
  it.each([
    ["queue", "next-tool"],
    ["next-tool", "queue"],
    ["steer", "queue"],
  ] as const)(
    "uses configured %s behavior only during a running turn",
    (activeTurnDefault, alternateAction) => {
      expect(
        resolveComposerDispatchMode({
          running: true,
          alternateModifier: false,
          activeTurnDefault,
        }),
      ).toBe(activeTurnDefault);
      expect(
        resolveComposerDispatchMode({
          running: true,
          alternateModifier: true,
          activeTurnDefault,
        }),
      ).toBe(alternateAction);
      expect(
        resolveComposerDispatchMode({
          running: false,
          alternateModifier: false,
          activeTurnDefault,
        }),
      ).toBe("auto");
      expect(
        resolveComposerDispatchMode({ running: false, alternateModifier: true, activeTurnDefault }),
      ).toBe("auto");
    },
  );

  it("names the alternate action so the affordance can be labelled", () => {
    expect(alternateComposerDispatchAction("queue")).toBe("next-tool");
    expect(alternateComposerDispatchAction("steer")).toBe("queue");
    expect(alternateComposerDispatchAction()).toBe("queue");
  });
});

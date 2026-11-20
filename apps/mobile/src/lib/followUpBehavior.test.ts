import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_FOLLOW_UP_BEHAVIOR, resolveMobileFollowUpDispatchMode } from "./followUpBehavior";

describe("mobile follow-up delivery", () => {
  it("uses after-next-tool delivery by default", () => {
    expect(
      resolveMobileFollowUpDispatchMode({
        running: true,
        canSteer: true,
        preference: DEFAULT_FOLLOW_UP_BEHAVIOR,
      }),
    ).toBe("next-tool");
  });

  it.each(["queue", "next-tool", "steer"] as const)(
    "preserves every explicit timing with the %s preference",
    (preference) => {
      expect(resolveMobileFollowUpDispatchMode({ running: true, canSteer: true, preference })).toBe(
        preference === "steer" ? "auto" : preference,
      );
      for (const override of ["queue", "next-tool", "steer"] as const) {
        expect(
          resolveMobileFollowUpDispatchMode({
            running: true,
            canSteer: true,
            preference,
            override,
          }),
        ).toBe(override === "steer" ? "auto" : override);
      }
    },
  );

  it("queues after the turn when steering is unavailable", () => {
    expect(
      resolveMobileFollowUpDispatchMode({
        running: true,
        canSteer: false,
        preference: "next-tool",
      }),
    ).toBe("queue");
  });

  it("starts normally when idle", () => {
    expect(
      resolveMobileFollowUpDispatchMode({
        running: false,
        canSteer: true,
        preference: "next-tool",
      }),
    ).toBeUndefined();
  });
});

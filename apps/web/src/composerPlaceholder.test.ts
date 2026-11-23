import { describe, expect, it } from "vite-plus/test";

import {
  ACTIVE_COMPOSER_PLACEHOLDER,
  DISCONNECTED_COMPOSER_PLACEHOLDER,
} from "./composerPlaceholder";

describe("composer placeholders", () => {
  it("invites a new prompt before a session starts", () => {
    expect(DISCONNECTED_COMPOSER_PLACEHOLDER).toBe(
      "Ask anything, @tag files/folders, $use skills, or / for commands",
    );
  });

  it("invites follow-up work after a session starts", () => {
    expect(ACTIVE_COMPOSER_PLACEHOLDER).toBe("Ask for changes, send follow-ups, or attach images");
  });
});

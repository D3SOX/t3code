import { describe, expect, it } from "vite-plus/test";
import { shouldOpenPullRequestExternally } from "./openPullRequestLink";

describe("shouldOpenPullRequestExternally", () => {
  it("uses the browser for an unmodified click when it is preferred", () => {
    expect(shouldOpenPullRequestExternally({ metaKey: false, ctrlKey: false }, "system")).toBe(
      true,
    );
  });
});

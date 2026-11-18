import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import { createAppHistory } from "./appHistory";

const FIRST = "/environment/first";
const SECOND = "/environment/second?view=chat";
const THIRD = "/environment/third";

describe("app modal history", () => {
  it.each(["/usage", "/settings", "/settings/providers?machine=remote#models"])(
    "keeps %s and its close out of Back and Forward history",
    (modal) => {
      const browser = createMemoryHistory({
        initialEntries: [FIRST, SECOND, THIRD],
        initialIndex: 1,
      });
      const history = createAppHistory(browser);
      const underlyingLocation = browser.location;

      history.push(modal);
      history.push("/settings/general");
      history.replace("/settings/providers?machine=remote#models");

      expect(history.location.href).toBe("/settings/providers?machine=remote#models");
      expect(history.location.state.__TSR_index).toBe(1);
      expect(browser.location).toBe(underlyingLocation);
      expect(browser.length).toBe(3);

      history.push(SECOND);
      browser.back();
      expect(history.location.href).toBe(FIRST);
      browser.forward();
      expect(history.location.href).toBe(SECOND);
      browser.forward();
      expect(history.location.href).toBe(THIRD);
      expect(browser.length).toBe(3);
      history.destroy();
    },
  );

  it("navigates between pages while a modal is open without leaving a modal to revisit", () => {
    const browser = createMemoryHistory({
      initialEntries: [FIRST, SECOND, THIRD],
      initialIndex: 1,
    });
    const history = createAppHistory(browser);

    history.push("/usage");
    browser.back();
    expect(history.location.href).toBe(FIRST);
    browser.forward();
    expect(history.location.href).toBe(SECOND);

    history.push("/settings/general");
    browser.forward();
    expect(history.location.href).toBe(THIRD);
    history.back();
    expect(history.location.href).toBe(SECOND);
    history.destroy();
  });

  it("records a different page opened from a modal", () => {
    const browser = createMemoryHistory({ initialEntries: [FIRST, SECOND] });
    const history = createAppHistory(browser);

    history.push("/settings/projects");
    history.push(THIRD);
    expect(browser.length).toBe(3);
    expect(history.location.href).toBe(THIRD);
    history.back();
    expect(history.location.href).toBe(SECOND);
    history.destroy();
  });

  it("replaces a directly loaded modal when returning to the app", () => {
    const browser = createMemoryHistory({ initialEntries: ["/settings/general"] });
    const history = createAppHistory(browser);

    history.push("/settings/providers");
    history.push("/");
    expect(browser.length).toBe(1);
    expect(history.location.href).toBe("/");
    expect(history.canGoBack()).toBe(false);
    history.destroy();
  });
});

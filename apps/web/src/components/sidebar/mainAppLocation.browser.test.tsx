import { EnvironmentId, MessageId, ThreadId, type AssistantCitation } from "@t3tools/contracts";
import { createBrowserHistory, createHashHistory, type AnyRouter } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { createAppHistory } from "../../appHistory";
import {
  assistantCitationFromLocation,
  assistantCitationNavigation,
} from "../../lib/assistantCitationNavigation";
import {
  startMainAppLocationTracking,
  useCloseAppModal,
  useNavigateToMainApp,
} from "./mainAppLocation";

const THREAD_PATH = "/environment-one/thread-one";

const citation: AssistantCitation = {
  version: 1,
  environmentId: EnvironmentId.make("environment-one"),
  threadId: ThreadId.make("thread-one"),
  messageId: MessageId.make("assistant-one"),
  text: "quoted reply",
  start: 0,
  end: 12,
  prefix: "",
  suffix: "",
};

function ReturnControls() {
  const closeAppModal = useCloseAppModal();
  const navigateToMainApp = useNavigateToMainApp();
  return (
    <>
      <button type="button" onClick={() => void closeAppModal()}>
        Close modal
      </button>
      <button type="button" onClick={() => void navigateToMainApp()}>
        Back to app
      </button>
    </>
  );
}

// The tracker records on onResolved, which the router emits only once React commits the page.
async function settled(router: AnyRouter, navigation: Promise<void>) {
  await navigation;
  await vi.waitFor(() =>
    expect(router.state.resolvedLocation?.href).toBe(router.state.location.href),
  );
}

describe("main app return location", () => {
  it.each([
    ["web", createBrowserHistory],
    ["desktop", createHashHistory],
  ] as const)("keeps modals out of native %s history", async (_, createHistory) => {
    const frame = document.createElement("iframe");
    using _frame = { [Symbol.dispose]: () => frame.remove() };
    frame.src = "/favicon.ico";
    const loaded = new Promise<void>((resolve) =>
      frame.addEventListener("load", () => resolve(), { once: true }),
    );
    document.body.append(frame);
    await loaded;
    const browserWindow = frame.contentWindow!;
    const browser = createHistory({ window: browserWindow });
    using _history = { [Symbol.dispose]: () => browser.destroy() };
    browser.replace("/environment-one/previous-thread");
    browser.flush();
    browser.push(THREAD_PATH);
    browser.flush();
    browser.push("/environment-one/next-thread");
    browser.flush();
    browserWindow.history.back();
    await vi.waitFor(() => expect(browser.location.href).toBe(THREAD_PATH));

    await using screen = await render(<ReturnControls />, { router: THREAD_PATH });
    const router = screen.router!;
    router.update({ history: createAppHistory(browser) });
    using _tracking = { [Symbol.dispose]: startMainAppLocationTracking(router) };
    const length = browserWindow.history.length;
    const href = browserWindow.location.href;

    await settled(router, router.navigate({ href: "/usage" }));
    await settled(router, router.navigate({ href: "/settings/general" }));
    await settled(router, router.navigate({ href: "/settings/providers" }));
    await userEvent.click(screen.getByRole("button", { name: "Close modal" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe(THREAD_PATH));

    expect(browserWindow.history.length).toBe(length);
    expect(browserWindow.location.href).toBe(href);

    browserWindow.history.forward();
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/environment-one/next-thread"),
    );
    browserWindow.history.back();
    await vi.waitFor(() => expect(router.state.location.pathname).toBe(THREAD_PATH));
    browserWindow.history.back();
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/environment-one/previous-thread"),
    );
    browserWindow.history.forward();
    await vi.waitFor(() => expect(router.state.location.pathname).toBe(THREAD_PATH));
  });

  it("returns to the thread without re-opening the quote source it was opened at", async () => {
    await using screen = await render(<ReturnControls />, { router: THREAD_PATH });
    const router = screen.router!;
    router.update({ history: createAppHistory(router.history) });
    using _tracking = { [Symbol.dispose]: startMainAppLocationTracking(router) };

    const returnLocation = async (from: string, control: string) => {
      await settled(router, router.navigate(assistantCitationNavigation(citation)));
      expect(assistantCitationFromLocation(router.state.location.href)).toEqual(citation);
      await settled(router, router.navigate({ href: from }));
      await userEvent.click(screen.getByRole("button", { name: control }));
      await vi.waitFor(() => expect(router.state.location.pathname).toBe(THREAD_PATH));
      return router.state.location.href;
    };

    const closingUsage = await returnLocation("/usage", "Close modal");
    const sidebarBack = await returnLocation("/pull-requests", "Back to app");

    expect({ closingUsage, sidebarBack }).toEqual({
      closingUsage: THREAD_PATH,
      sidebarBack: THREAD_PATH,
    });
  });
});

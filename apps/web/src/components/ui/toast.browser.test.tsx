import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { AnchoredToastProvider, ToastProvider, toastManager } from "./toast";

describe("toastManager", () => {
  it("shows a toast added before any provider mounted", async () => {
    toastManager.add({ type: "info", title: "Raised before the first render" });

    await using _screen = await render(<ToastProvider>{null}</ToastProvider>);

    await expect.element(page.getByText("Raised before the first render")).toBeVisible();
  });

  it("exposes one Notifications landmark when both toast providers mount", async () => {
    await using _screen = await render(
      <ToastProvider>
        <AnchoredToastProvider>{null}</AnchoredToastProvider>
      </ToastProvider>,
    );

    const notifications = page.getByRole("region", { name: "Notifications" });
    await expect.element(notifications.first()).toBeInTheDocument();
    expect(
      notifications.elements(),
      "only the corner toast viewport should be a Notifications landmark",
    ).toHaveLength(1);
    await expect.element(notifications).toHaveAttribute("data-slot", "toast-viewport");

    const anchoredViewport = document.querySelector("[data-slot=toast-viewport-anchored]");
    expect(anchoredViewport).toHaveAttribute("aria-live", "polite");
  });
});

describe("toast auto-dismiss", () => {
  // Regression: the hidden toast stayed "ending", so leaving the stack never resumed its timers.
  it("auto-dismisses after a hidden thread-scoped toast closed and the stack was hovered", async () => {
    await using _screen = await render(<ToastProvider>{null}</ToastProvider>);

    const hiddenId = toastManager.add({
      type: "info",
      title: "Scoped to another thread",
      data: {
        threadRef: {
          environmentId: EnvironmentId.make("env-other"),
          threadId: ThreadId.make("thread-other"),
        },
      },
    });
    toastManager.close(hiddenId);

    toastManager.add({ type: "success", title: "Auto dismissed", timeout: 300 });
    const visible = page.getByText("Auto dismissed");
    await expect.element(visible).toBeVisible();
    await visible.hover();
    await visible.unhover();

    await expect.element(visible).not.toBeInTheDocument();
  });
});

import { Toast } from "@base-ui/react/toast";
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
  // Regression: a closed toast the thread filter hid never finished its exit, so it stayed in the
  // store as "ending" and kept the stack's hover pause, freezing every other toast's timer.
  it("removes a closed thread-scoped toast that is hidden on this route", async () => {
    function ToastCount() {
      return <output aria-label="Toast count">{Toast.useToastManager().toasts.length}</output>;
    }
    await using _screen = await render(
      <ToastProvider>
        <ToastCount />
      </ToastProvider>,
    );

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
    const count = page.getByRole("status", { name: "Toast count" });
    await expect.element(count).toHaveTextContent("1");
    toastManager.close(hiddenId);

    await expect.element(count).toHaveTextContent("0");
  });
});

import * as Option from "effect/Option";
import { EnvironmentId, RunId, ThreadId, TurnItemId } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({
  loadSnapshot: vi.fn<(threadId: string) => Pick<OrchestrationV2ThreadProjection, "turnItems">>(),
}));

vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pressable: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../state/threads", () => ({
  useEnvironmentThread: (_environmentId: string | null, threadId: string | null) => ({
    data: threadId === null ? Option.none() : Option.some(harness.loadSnapshot(threadId)),
  }),
}));

import { ModelCapacityRetryNotice } from "./ModelCapacityRetryNotice";

it("waits for creation acknowledgement before loading details and still shows live capacity retries", () => {
  harness.loadSnapshot.mockReset();
  harness.loadSnapshot.mockImplementation(() => {
    throw new Error("Thread does not exist until creation is acknowledged");
  });
  const threadRef = {
    environmentId: EnvironmentId.make("environment"),
    threadId: ThreadId.make("new-thread"),
  };
  const runId = RunId.make("run");
  const thread = {
    id: threadRef.threadId,
    environmentId: threadRef.environmentId,
    runtime: { activeRunId: runId },
  } as EnvironmentThreadShell;
  const container = document.createElement("div");
  const root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    act(() =>
      root.render(
        <ModelCapacityRetryNotice threadRef={null} thread={thread} onCancel={() => {}} />,
      ),
    );
    expect(harness.loadSnapshot).not.toHaveBeenCalled();

    harness.loadSnapshot.mockReturnValue({
      turnItems: [
        {
          id: TurnItemId.make("retry"),
          threadId: threadRef.threadId,
          runId,
          nodeId: null,
          providerThreadId: null,
          providerTurnId: null,
          nativeItemRef: null,
          parentItemId: null,
          ordinal: 0,
          status: "running",
          title: null,
          startedAt: null,
          completedAt: null,
          updatedAt: DateTime.makeUnsafe("2026-10-22T00:00:00.000Z"),
          type: "error",
          failure: {
            class: "provider_error",
            message: "Model at capacity",
            code: "serverOverloaded",
            retryable: true,
          },
          retry: { attempt: 1, maxAttempts: null, retryDelayMs: null },
        },
      ],
    });
    act(() =>
      root.render(
        <ModelCapacityRetryNotice threadRef={threadRef} thread={thread} onCancel={() => {}} />,
      ),
    );
    expect(container.textContent).toContain("Retrying model (attempt 1)");
    expect(container.textContent).toContain("Cancel retry");
    expect(harness.loadSnapshot).toHaveBeenCalledWith(threadRef.threadId);
  } finally {
    act(() => root.unmount());
  }
});

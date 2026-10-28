import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { EnvironmentThread } from "@t3tools/client-runtime/state/shell";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Atom } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

const harness = vi.hoisted(() => ({ loadSnapshot: vi.fn<() => EnvironmentThread | null>() }));

vi.mock("../../state/threads", () => ({
  environmentThreadDetails: {
    threadAtom: () => Atom.make(() => harness.loadSnapshot()),
  },
}));

import { useWorkflowOpening } from "./use-workflow-opening";

it("does not request a pending creation's conversation before it exists", () => {
  harness.loadSnapshot.mockReset();
  harness.loadSnapshot.mockReturnValue(null);
  const environmentId = EnvironmentId.make("environment");
  const threadId = ThreadId.make("pending-thread");
  function Probe({ delivered }: { delivered: boolean }) {
    const opening = useWorkflowOpening(delivered ? { environmentId, threadId } : null);
    return <span>{opening === null ? "Ordinary conversation" : "Workflow"}</span>;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  try {
    act(() => root.render(<Probe delivered={false} />));
    expect(harness.loadSnapshot).not.toHaveBeenCalled();
    act(() => root.render(<Probe delivered />));
    expect(harness.loadSnapshot).toHaveBeenCalled();
    expect(container.textContent).toBe("Ordinary conversation");
  } finally {
    act(() => root.unmount());
  }
});

import { act, createElement, useLayoutEffect, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { NativeSyntheticEvent } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
}));

import { useMediaSlots } from "../../node_modules/react-native-enriched-markdown/src/native/useMediaSlots";

const initialMarkdown = "Before\n\n![Preview](image.png)";
const asset = {
  id: "image-1",
  kind: "image" as const,
  url: "image.png",
  anchor: "image-anchor",
  altText: "Preview",
  title: "",
  placement: "block" as const,
  eligible: true,
};
const frame = { id: asset.id, x: 0, y: 40, width: 332, height: 1 };
const nativeEvent = <T,>(value: T) => ({ nativeEvent: value }) as NativeSyntheticEvent<T>;
type Slot = ReactElement<{
  onLayout: (event: { nativeEvent: { layout: { width: number; height: number } } }) => void;
}>;

let root: Root;
let media: ReturnType<typeof useMediaSlots>;
function Probe({ markdown }: { markdown: string }) {
  const state = useMediaSlots(
    markdown,
    "parser",
    () => createElement("image"),
    undefined,
    undefined,
  );
  useLayoutEffect(() => {
    media = state;
  });
  return null;
}
const render = async (markdown = initialMarkdown) => {
  await act(() => root.render(createElement(Probe, { markdown })));
};
const measure = (slot: Slot, height: number, width = frame.width) =>
  slot.props.onLayout(nativeEvent({ layout: { width, height } }));

beforeEach(async () => {
  const document = { nodeType: 9, addEventListener() {}, removeEventListener() {} };
  const container = {
    nodeType: 1,
    tagName: "DIV",
    namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document,
    addEventListener() {},
    removeEventListener() {},
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { document, HTMLIFrameElement: EventTarget });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container as unknown as HTMLElement);
  await render();
  await act(() => {
    media.nativeProps.onDocumentAssets(nativeEvent({ revision: 1, assets: [asset] }));
    media.nativeProps.onMediaLayout(nativeEvent({ revision: 1, frames: [frame] }));
  });
});

afterEach(async () => {
  await act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("native markdown image reservation", () => {
  it("reserves the portrait height when shadow and mounted widths round differently", async () => {
    // Pixel at 350 dpi with 3.5-point message padding: the shadow width is
    // 421.49 points, while the mounted native view reports 422.4 points.
    await act(() => {
      media.nativeProps.onMediaLayout(
        nativeEvent({ revision: 1, frames: [{ ...frame, width: 422.4 }] }),
      );
    });
    await act(() => measure(media.slots[0] as Slot, 504.23, 422.4));

    expect(media.nativeProps.mediaOverrides[0]).toMatchObject({
      height: 504.23,
      // Zero tells native to use the validated height at either rounded width.
      width: 0,
    });

    // A real width change still discards that height until React measures again.
    await act(() => {
      media.nativeProps.onMediaLayout(
        nativeEvent({ revision: 1, frames: [{ ...frame, width: 280 }] }),
      );
    });
    expect(media.nativeProps.mediaOverrides[0]?.height).toBe(1);
  });

  it("updates reserved height when an image finishes loading", async () => {
    const slot = media.slots[0] as Slot;
    await act(() => measure(slot, 200));
    expect(media.nativeProps.mediaOverrides[0]?.height).toBe(200);
    await act(() => measure(slot, 260));
    expect(media.nativeProps.mediaOverrides[0]?.height).toBe(260);
  });

  it.each([false, true])(
    "reserves a mounted image's height after streaming (native revision accepted: %s)",
    async (acceptRevision) => {
      const slot = media.slots[0] as Slot;
      await act(() => measure(slot, 200));
      await act(() => {
        media.nativeProps.onMediaLayout(
          nativeEvent({ revision: 1, frames: [{ ...frame, height: 200 }] }),
        );
      });
      await render(`${initialMarkdown}\n\nText after the image.`);
      if (acceptRevision) {
        await act(() => {
          media.nativeProps.onDocumentAssets(nativeEvent({ revision: 2, assets: [asset] }));
          media.nativeProps.onMediaLayout(nativeEvent({ revision: 2, frames: [frame] }));
        });
      }
      await act(() => measure(slot, 260));
      expect(media.nativeProps.mediaOverrides[0]?.height).toBe(260);
    },
  );

  it("rejects a delayed measurement after replacing the document", async () => {
    const slot = media.slots[0] as Slot;
    await render(`Replacement\n\n![Preview](image.png)`);
    await act(() => {
      media.nativeProps.onDocumentAssets(nativeEvent({ revision: 2, assets: [asset] }));
      media.nativeProps.onMediaLayout(nativeEvent({ revision: 2, frames: [frame] }));
      measure(slot, 260);
    });
    expect(media.nativeProps.mediaOverrides[0]?.height).toBe(1);
    await act(() => measure(media.slots[0] as Slot, 320));
    expect(media.nativeProps.mediaOverrides[0]?.height).toBe(320);
  });

  it("rejects the old image's measurement when an append changes its identity", async () => {
    const slot = media.slots[0] as Slot;
    await render(`${initialMarkdown}\n\nText after the image.`);
    await act(() => {
      media.nativeProps.onDocumentAssets(
        nativeEvent({ revision: 2, assets: [{ ...asset, url: "other.png" }] }),
      );
      media.nativeProps.onMediaLayout(nativeEvent({ revision: 2, frames: [frame] }));
      measure(slot, 260);
    });
    expect(media.nativeProps.mediaOverrides[0]?.height).toBe(1);
    await act(() => measure(media.slots[0] as Slot, 320));
    expect(media.nativeProps.mediaOverrides[0]?.height).toBe(320);
  });

  it("remeasures the image after the available width changes", async () => {
    const slot = media.slots[0] as Slot;
    await act(() => measure(slot, 260));
    await act(() => {
      media.nativeProps.onMediaLayout(
        nativeEvent({ revision: 1, frames: [{ ...frame, width: 280 }] }),
      );
      measure(slot, 260);
    });
    expect(media.nativeProps.mediaOverrides[0]?.height).toBe(1);
    await act(() => measure(media.slots[0] as Slot, 220, 280));
    expect(media.nativeProps.mediaOverrides[0]?.height).toBe(220);
  });
});

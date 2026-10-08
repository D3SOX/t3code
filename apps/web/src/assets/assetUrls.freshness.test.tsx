import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  ThreadId,
  type AssetCreateUrlResult,
  type AssetResource,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  revision: 1,
  query: null as Atom.Atom<AsyncResult.AsyncResult<AssetCreateUrlResult>> | null,
  requests: vi.fn(),
}));

vi.mock("~/state/assets", () => ({
  assetEnvironment: { createUrl: () => state.query },
}));
vi.mock("~/state/session", () => ({
  usePreparedConnection: () => ({ _tag: "Some", value: { httpBaseUrl: "https://host.test" } }),
}));
vi.mock("~/state/filesystem", () => ({
  useFilesystemReadAccess: () => ({ canReadFiles: true, isPending: false }),
}));
vi.mock("~/state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));

import { useAssetUrlState } from "./assetUrls";

const environmentId = EnvironmentId.make("image-host");
const threadId = ThreadId.make("image-thread");
const mutableResources: AssetResource[] = [
  { _tag: "media-file", threadId, path: "/repo/image.png" },
  { _tag: "workspace-file", threadId, path: "image.png" },
  { _tag: "draft-workspace-file", cwd: "/repo", path: "image.png" },
];

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.revision = 1;
  state.requests.mockReset();
  state.query = Atom.make(
    Effect.sync(() => {
      state.requests();
      return {
        relativeUrl: `/api/assets/image-${state.revision}.png`,
        expiresAt: 999999,
        imageDimensions: { width: state.revision * 100, height: 100 },
      };
    }),
  ).pipe(
    Atom.swr({ staleTime: 5 * 60_000, revalidateOnMount: true }),
    Atom.withRefresh(30 * 60_000),
    Atom.setIdleTTL(60 * 60_000),
  );
});

afterEach(() => vi.unstubAllGlobals());

function ImageSource({ resource }: { resource: AssetResource }) {
  const image = useAssetUrlState(environmentId, resource);
  return (
    <output>
      {image._tag === "Success" ? `${image.url} (${image.imageDimensions?.width}px)` : image._tag}
    </output>
  );
}

it.each(mutableResources)(
  "reloads $_tag when another message shows the same file",
  async (resource) => {
    const registry = AtomRegistry.make();
    let renderer: ReactTestRenderer | undefined;
    const renderMessages = (count: number) => (
      <RegistryContext.Provider value={registry}>
        {Array.from({ length: count }, (_, index) => (
          <ImageSource key={index === 0 ? "previous" : "new"} resource={resource} />
        ))}
      </RegistryContext.Provider>
    );
    try {
      await act(async () => {
        renderer = create(renderMessages(1));
      });
      expect(renderer!.root.findByType("output").children).toEqual([
        "https://host.test/api/assets/image-1.png (100px)",
      ]);
      state.revision = 2;
      await act(async () => renderer!.update(renderMessages(2)));
      for (const image of renderer!.root.findAllByType("output")) {
        expect(image.children).toEqual(["https://host.test/api/assets/image-2.png (200px)"]);
      }
      const requestsAfterLoading = state.requests.mock.calls.length;
      await act(async () => renderer!.update(renderMessages(2)));
      expect(state.requests).toHaveBeenCalledTimes(requestsAfterLoading);
      await act(async () => renderer!.unmount());
      renderer = undefined;
      state.revision = 3;
      await act(async () => {
        renderer = create(renderMessages(1));
      });
      expect(renderer!.root.findByType("output").children).toEqual([
        "https://host.test/api/assets/image-3.png (300px)",
      ]);
    } finally {
      await act(async () => renderer?.unmount());
      registry.dispose();
    }
  },
);

it("keeps immutable attachments cached across messages", async () => {
  const registry = AtomRegistry.make();
  const resource: AssetResource = { _tag: "attachment", attachmentId: "uploaded-image" };
  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(
        <RegistryContext.Provider value={registry}>
          <ImageSource resource={resource} />
        </RegistryContext.Provider>,
      );
    });
    const requestsAfterLoading = state.requests.mock.calls.length;
    await act(async () => {
      renderer!.update(
        <RegistryContext.Provider value={registry}>
          <ImageSource resource={resource} />
          <ImageSource resource={resource} />
        </RegistryContext.Provider>,
      );
    });
    expect(state.requests).toHaveBeenCalledTimes(requestsAfterLoading);
  } finally {
    await act(async () => renderer?.unmount());
    registry.dispose();
  }
});

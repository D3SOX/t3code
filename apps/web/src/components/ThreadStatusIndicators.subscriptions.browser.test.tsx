import { type ThreadPullRequestLink, type VcsStatusResult } from "@t3tools/contracts";
import type { MouseEvent } from "react";
import { render } from "../../test/render";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "../index.css";
import { Button } from "./ui/button";

const state = vi.hoisted(() => ({ queries: [] as string[] }));

vi.mock(import("../state/entities"), async (original) => ({
  ...(await original()),
  useProject: () => null,
  useServerConfigs: () => new Map(),
}));
vi.mock(import("../state/vcs"), async (original) => {
  const { AsyncResult, Atom } = await import("effect/reactivity");
  const statuses = Atom.family((cwd: string) =>
    Atom.make(() => {
      state.queries.push(`vcs:${cwd}`);
      return AsyncResult.success({
        isRepo: true,
        hasPrimaryRemote: true,
        isDefaultRef: false,
        refName: "feature/test",
        hasWorkingTreeChanges: false,
        workingTree: { files: [], insertions: 0, deletions: 0 },
        hasUpstream: true,
        aheadCount: 0,
        behindCount: 0,
        pr: {
          number: 42,
          title: "Observed worktree PR",
          url: "https://github.com/example/repo/pull/42",
          baseRef: "main",
          headRef: "feature/test",
          state: "open",
        },
      } satisfies VcsStatusResult);
    }),
  );
  const actual = await original();
  return {
    ...actual,
    vcsEnvironment: {
      ...actual.vcsEnvironment,
      status: (({ input }: { input: { cwd: string } }) => statuses(input.cwd)) as never,
    },
  };
});
vi.mock(import("../state/pullRequests"), async (importOriginal) => {
  const original = await importOriginal();
  const { AsyncResult, Atom } = await import("effect/reactivity");
  const { ProjectId } = await import("@t3tools/contracts");
  const summaries = Atom.family((number: number) =>
    Atom.make(() => {
      state.queries.push(`pr:${number}`);
      return AsyncResult.success({
        provider: "github" as const,
        projectId: ProjectId.make("project-test"),
        repository: "example/repo",
        number,
        title: "Observed linked PR",
        url: `https://github.com/example/repo/pull/${number}`,
        state: "open" as const,
        headBranch: "feature/test",
        baseBranch: "main",
        updatedAt: "2026-09-04T00:00:00.000Z",
      });
    }),
  );
  return {
    ...original,
    linkedPullRequestDetailAtom: (({ input }: { input: { number: number } }) =>
      summaries(input.number)) as never,
  };
});
import { ThreadPullRequestBadgeControl } from "./ThreadStatusIndicators";

// The lease overscans 160px around a 20px viewport, a 340px band. With 45px rows the band
// covers exactly 8 rows at each scroll position below.

it("keeps a long PR hover list in the viewport and lets the last row be selected", async () => {
  const previousViewport = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(800, 480);
  const pullRequests = Array.from({ length: 40 }, (_, index): ThreadPullRequestLink => ({
    host: "github.com",
    repository: "example/repo",
    number: index + 1,
    url: `https://github.com/example/repo/pull/${index + 1}`,
    source: "manual",
    linkedAt: "2026-01-01T00:00:00Z",
    snapshot: null,
    stack: null,
  }));
  const onOpenPullRequest = vi.fn((event: MouseEvent<HTMLElement>) => event.preventDefault());
  const container = document.createElement("div");
  document.body.append(container);

  try {
    await using _screen = await render(
      <div style={{ position: "fixed", top: 220, left: 300 }}>
        <ThreadPullRequestBadgeControl
          render={<Button size="xs" />}
          badge={{ kind: "pull-request", others: 39, state: "open" }}
          pullRequests={pullRequests}
          number={1}
          url={pullRequests[0]!.url}
          status={null}
          onOpenList={() => {}}
          onOpenPullRequest={onOpenPullRequest}
          onOpenPullRequestContextMenu={() => {}}
        />
      </div>,
      { container },
    );
    await userEvent.hover(container.querySelector("button")!);
    const popup = () => document.querySelector<HTMLElement>('[data-slot="tooltip-popup"]')!;
    await expect.poll(() => popup()?.querySelectorAll("a").length).toBe(40);
    await expect.poll(() => popup().getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    await expect
      .poll(() => popup().getBoundingClientRect().bottom)
      .toBeLessThanOrEqual(window.innerHeight);

    const lastRow = popup().querySelector<HTMLAnchorElement>("li:last-child a")!;
    expect(lastRow.getBoundingClientRect().top).toBeGreaterThan(
      popup().getBoundingClientRect().bottom,
    );
    await userEvent.wheel(popup(), { delta: { y: 10_000 } });
    await expect
      .poll(() => lastRow.getBoundingClientRect().bottom)
      .toBeLessThanOrEqual(popup().getBoundingClientRect().bottom);
    expect(lastRow.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      popup().getBoundingClientRect().top,
    );
    await userEvent.click(lastRow);
    expect(onOpenPullRequest).toHaveBeenCalledExactlyOnceWith(expect.anything(), lastRow.href);
  } finally {
    container.remove();
    await page.viewport(previousViewport.width, previousViewport.height);
  }
});

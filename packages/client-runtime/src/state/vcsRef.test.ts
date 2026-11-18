import { describe, expect, it } from "vite-plus/test";

import { resolveWorktreeBaseRef, type VcsRef } from "./vcsRef.ts";

const ref = (name: string, extra: Partial<VcsRef> = {}): VcsRef => ({
  name,
  current: false,
  isDefault: false,
  worktreePath: null,
  ...extra,
});

describe("resolveWorktreeBaseRef", () => {
  it("defaults to the repository's default branch instead of assuming main", () => {
    const refs = [
      ref("feature", { current: true }),
      ref("origin/development", { isRemote: true, isDefault: true }),
      ref("development", { isDefault: true }),
    ];
    expect(resolveWorktreeBaseRef("", refs)).toBe("development");
    expect(resolveWorktreeBaseRef("", refs.slice(0, 2))).toBe("origin/development");
    expect(resolveWorktreeBaseRef(" release ", refs)).toBe("release");
    expect(resolveWorktreeBaseRef("", [])).toBe("");
  });
});

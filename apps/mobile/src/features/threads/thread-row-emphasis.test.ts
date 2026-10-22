import { describe, expect, it } from "vite-plus/test";

import { shouldRecedeThreadRow } from "./thread-row-emphasis";

describe("shouldRecedeThreadRow", () => {
  it("recedes background work", () => {
    expect(shouldRecedeThreadRow({ status: "working", selected: false })).toBe(true);
    expect(shouldRecedeThreadRow({ status: "waiting", selected: false })).toBe(true);
    expect(shouldRecedeThreadRow({ status: "background", selected: false })).toBe(true);
  });
});

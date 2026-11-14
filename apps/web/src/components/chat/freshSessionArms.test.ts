import { expect, it } from "vite-plus/test";

import {
  armFreshSession,
  claimFreshSessionArm,
  disarmFreshSession,
  readFreshSessionArm,
  restoreFreshSessionArm,
} from "./freshSessionArms";

it("gives the fresh session to only the first accepted submission", () => {
  const threadKey = "fresh-session-claim";
  using _cleanup = { [Symbol.dispose]: () => disarmFreshSession(threadKey) };
  armFreshSession(threadKey);
  const arm = readFreshSessionArm(threadKey)!;
  expect(arm).toBeDefined();
  expect(claimFreshSessionArm(threadKey, arm)).toBe(arm);
  expect(readFreshSessionArm(threadKey)).toBeUndefined();
  expect(claimFreshSessionArm(threadKey, arm)).toBeUndefined();
});

it("restores a failed send's arm without restoring an older arm over a newer send", () => {
  const threadKey = "fresh-session-restore";
  using _cleanup = { [Symbol.dispose]: () => disarmFreshSession(threadKey) };
  armFreshSession(threadKey);
  const first = readFreshSessionArm(threadKey)!;
  claimFreshSessionArm(threadKey, first);
  restoreFreshSessionArm(threadKey, first);
  expect(readFreshSessionArm(threadKey)).toBe(first);

  claimFreshSessionArm(threadKey, first);
  armFreshSession(threadKey);
  const newer = readFreshSessionArm(threadKey)!;
  expect(newer).not.toBe(first);
  restoreFreshSessionArm(threadKey, first);
  expect(readFreshSessionArm(threadKey)).toBe(newer);

  claimFreshSessionArm(threadKey, newer);
  restoreFreshSessionArm(threadKey, first);
  expect(readFreshSessionArm(threadKey)).toBeUndefined();
  disarmFreshSession(threadKey, newer);
  restoreFreshSessionArm(threadKey, first);
  expect(readFreshSessionArm(threadKey)).toBeUndefined();
});

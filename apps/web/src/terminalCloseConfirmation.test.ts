import { beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ enabled: false, confirm: vi.fn<() => Promise<boolean>>() }));
vi.mock("./hooks/useSettings", () => ({
  getClientSettings: () => ({ confirmTerminalClose: state.enabled }),
}));
vi.mock("./localApi", () => ({
  readLocalApi: () => ({ dialogs: { confirm: state.confirm } }),
}));

import { requestTerminalClose } from "./terminalCloseConfirmation";

beforeEach(() => {
  state.enabled = false;
  state.confirm.mockReset();
});

it("closes immediately with confirmation off", () => {
  const close = vi.fn();
  requestTerminalClose(close);
  expect(close).toHaveBeenCalledOnce();
  expect(state.confirm).not.toHaveBeenCalled();
});

it.each([true, false])("waits for confirmation and honors approval=%s", async (approved) => {
  state.enabled = true;
  let resolve!: (value: boolean) => void;
  state.confirm.mockReturnValue(
    new Promise<boolean>((done) => {
      resolve = done;
    }),
  );
  const close = vi.fn();
  requestTerminalClose(close);
  expect(close).not.toHaveBeenCalled();
  resolve(approved);
  await state.confirm.mock.results[0]?.value;
  expect(close).toHaveBeenCalledTimes(approved ? 1 : 0);
});

it("keeps the terminal open if the dialog fails", async () => {
  state.enabled = true;
  state.confirm.mockRejectedValue(new Error("Dialog unavailable"));
  const close = vi.fn();
  requestTerminalClose(close);
  await state.confirm.mock.results[0]?.value.catch(() => undefined);
  expect(close).not.toHaveBeenCalled();
});

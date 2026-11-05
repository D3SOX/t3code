import { DEFAULT_UNIFIED_SETTINGS, type ClientSettings } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import "../../index.css";

const state = vi.hoisted(() => ({ saved: null as ClientSettings | null }));

vi.mock("../../localApi", () => ({
  ensureLocalApi: () => ({
    persistence: {
      getClientSettings: async () => state.saved,
      setClientSettings: async (settings: ClientSettings) => {
        state.saved = settings;
      },
    },
  }),
  readLocalApi: () => null,
}));
vi.mock(import("./useScopedSettings"), async (original) => {
  const settings = await import("../../hooks/useSettings");
  return {
    ...(await original()),
    useScopedSettings: (() => ({
      ...DEFAULT_UNIFIED_SETTINGS,
      ...settings.useClientSettings(),
    })) as never,
    useUpdateScopedSettings: () => settings.updateClientSettings,
  };
});
vi.mock(import("../../state/environments"), async (original) => ({
  ...(await original()),
  useEnvironments: (() => ({
    environments: [
      { environmentId: "laptop", label: "Laptop", connection: { phase: "connected" } },
      { environmentId: "desktop", label: "Desktop", connection: { phase: "connected" } },
    ],
  })) as never,
}));
vi.mock(import("./settingsLayout"), async (original) => ({
  ...(await original()),
  SettingsRow: ({ title, control, resetAction }) => (
    <div>
      <h3>{title}</h3>
      {control}
      {resetAction}
    </div>
  ),
}));
vi.mock("./NotificationSettings", () => ({ NotificationSettings: () => null }));

import {
  __resetClientSettingsPersistenceForTests,
  ensureClientSettingsHydrated,
} from "../../hooks/useSettings";
import { GeneralSettingsPanel } from "./SettingsPanels";

it("remembers the machine for threads without a project and can restore Automatic", async () => {
  state.saved = null;
  __resetClientSettingsPersistenceForTests();
  using _settings = { [Symbol.dispose]: __resetClientSettingsPersistenceForTests };
  await ensureClientSettingsHydrated();

  {
    await using screen = await render(<GeneralSettingsPanel />, { router: "/settings/general" });
    const machine = screen.getByRole("combobox", { name: "Machine for threads without a project" });
    await expect.element(machine).toHaveTextContent("Automatic");
    await userEvent.click(machine);
    await userEvent.click(page.getByRole("option", { name: "Desktop", exact: true }));
    await vi.waitFor(() => expect(state.saved?.defaultScratchEnvironmentId).toBe("desktop"));
    await expect.element(machine).toHaveTextContent("Desktop");
  }

  __resetClientSettingsPersistenceForTests();
  await ensureClientSettingsHydrated();
  await using screen = await render(<GeneralSettingsPanel />, { router: "/settings/general" });
  const machine = screen.getByRole("combobox", { name: "Machine for threads without a project" });
  await expect.element(machine).toHaveTextContent("Desktop");
  await userEvent.click(
    screen.getByRole("button", { name: "Reset machine for threads without a project to default" }),
  );
  await vi.waitFor(() => expect(state.saved?.defaultScratchEnvironmentId).toBeNull());
  await expect.element(machine).toHaveTextContent("Automatic");
});

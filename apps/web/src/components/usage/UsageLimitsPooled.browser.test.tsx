import { EnvironmentId, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { render } from "../../../test/render";
import { UsageLimitsPooled } from "./UsageLimitsPooled";

it("updates remaining credits independently of usage windows and does not turn an unknown balance into zero", async () => {
  const checkedAt = "2026-10-24T12:00:00.000Z";
  const presentations = (
    credits: { balance?: string; hasCredits: boolean; unlimited: boolean } | null,
  ) =>
    new Map([
      [
        EnvironmentId.make("fixture"),
        {
          entry: { target: { label: "Fixture" } },
          serverConfig: {
            providers: [
              {
                instanceId: ProviderInstanceId.make("codex"),
                driver: ProviderDriverKind.make("codex"),
                enabled: true,
                installed: true,
                status: "ready" as const,
                version: null,
                auth: { status: "authenticated" as const },
                checkedAt,
                models: [],
                slashCommands: [],
                skills: [],
                usageLimits: { checkedAt, windows: [], credits },
              },
            ],
          },
        },
      ],
    ]);
  await using screen = await render(
    <UsageLimitsPooled
      presentations={presentations({
        balance: "17524.1215355000",
        hasCredits: true,
        unlimited: false,
      })}
      now={0}
    />,
  );
  await expect.element(screen.getByText("Credits remaining")).toBeVisible();
  await expect.element(screen.getByText("17,525", { exact: true })).toBeVisible();
  await screen.rerender(
    <UsageLimitsPooled
      presentations={presentations({ balance: "0", hasCredits: false, unlimited: false })}
      now={0}
    />,
  );
  await expect.element(screen.getByText("0", { exact: true })).toBeVisible();
  await screen.rerender(
    <UsageLimitsPooled
      presentations={presentations({ hasCredits: true, unlimited: false })}
      now={0}
    />,
  );
  await expect.element(screen.getByText("Unavailable", { exact: true })).toBeVisible();
  await screen.rerender(
    <UsageLimitsPooled
      presentations={presentations({ hasCredits: true, unlimited: true })}
      now={0}
    />,
  );
  await expect.element(screen.getByText("Unlimited", { exact: true })).toBeVisible();
  await screen.rerender(<UsageLimitsPooled presentations={presentations(null)} now={0} />);
  await expect.element(screen.getByText("Credits remaining")).not.toBeInTheDocument();
});

import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { CHATGPT_USAGE_URL } from "@t3tools/shared/usageLimits";
import { describe, expect, it } from "vite-plus/test";

import "~/index.css";

import { render } from "../../../test/render";
import { UsageLimitsPooled } from "./UsageLimitsPooled";

const checkedAt = "2026-10-25T16:00:00.000Z";

function managedChatGpt(instanceId: string, displayName: string): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make("codex"),
    displayName,
    enabled: true,
    installed: true,
    version: "0.164.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt,
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits: {
      checkedAt,
      windows: [],
      unavailable: { reason: "unsupported", message: "Track usage in ChatGPT." },
      externalUsage: { label: "ChatGPT usage", url: CHATGPT_USAGE_URL },
    },
  };
}

describe("UsageLimitsPooled ChatGPT usage card", () => {
  it("names the managed connections it covers", async () => {
    const presentations = new Map([
      [
        EnvironmentId.make("desk"),
        {
          entry: { target: { label: "Desk" } },
          serverConfig: {
            providers: [
              managedChatGpt("chatgpt_work", "ChatGPT Work"),
              managedChatGpt("chatgpt_personal", "ChatGPT Personal"),
            ],
          },
        },
      ],
    ]);
    await using screen = await render(
      <UsageLimitsPooled presentations={presentations} now={Date.parse(checkedAt)} />,
    );

    await expect
      .element(screen.getByText("ChatGPT Work on Desk, ChatGPT Personal on Desk"))
      .toBeVisible();
    await expect
      .element(screen.getByText("View usage in ChatGPT with your connected account."))
      .toBeVisible();
  });
});

describe("UsageLimitsPooled next refill", () => {
  it("skips elapsed resets while waiting for refreshed account data", async () => {
    function account(instanceId: string, usedPercent: number, resetsAt: string): ServerProvider {
      return {
        ...managedChatGpt(instanceId, instanceId),
        usageLimits: {
          checkedAt,
          windows: [{ id: "weekly", label: "Weekly", kind: "weekly", usedPercent, resetsAt }],
        },
      };
    }
    const presentations = new Map([
      [
        EnvironmentId.make("desk"),
        {
          entry: { target: { label: "Desk" } },
          serverConfig: {
            providers: [
              account("Work", 20, "2026-10-25T17:00:00.000Z"),
              account("Personal", 60, "2026-10-25T18:00:00.000Z"),
            ],
          },
        },
      ],
    ]);
    await using screen = await render(
      <UsageLimitsPooled presentations={presentations} now={Date.parse("2026-10-25T17:30:00Z")} />,
    );
    await expect.element(screen.getByText("↻ +30%", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("↻ +30% in 30m")).toBeVisible();

    await screen.rerender(
      <UsageLimitsPooled presentations={presentations} now={Date.parse("2026-10-25T18:00:00Z")} />,
    );
    await expect.element(screen.getByText(/^↻ \+\d+%$/)).not.toBeInTheDocument();
  });
});

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

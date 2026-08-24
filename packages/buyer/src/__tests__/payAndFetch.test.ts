import { describe, expect, it } from "vitest";
import {
  createSignedMandate,
} from "@mandato-ar/mandate";
import { HttpX402Adapter } from "../adapter.js";
import { FIXTURE_402_BODY, encodePaymentRequiredHeader } from "../fixture.js";
import { payAndFetch } from "../payAndFetch.js";

const SECRET = "demo-hmac-secret";
const BASE = "https://ar-agent-fx.mswitach.workers.dev";

describe("payAndFetch dry-run", () => {
  it("uses recorded 402 fixture without wallet / network", async () => {
    expect(FIXTURE_402_BODY.accepts[0].network).toBe("eip155:84532");
    expect(encodePaymentRequiredHeader().length).toBeGreaterThan(20);

    const mandate = createSignedMandate(
      {
        principal: "did:example:marcelo",
        budgetUsdc: "0.05",
        expiresAt: "2026-12-31T23:59:59.000Z",
        allowlist: [`${BASE}/v1/fx/*`, `${BASE}/v1/bcra/*`, `${BASE}/v1/legal/*`],
        network: "eip155:84532",
        resourceBase: BASE,
      },
      { mode: "hmac", secret: SECRET },
    );

    const result = await payAndFetch({
      mandate,
      verifier: { mode: "hmac", secret: SECRET },
      adapter: new HttpX402Adapter({ dryRun: true }),
      url: `${BASE}/v1/fx/usd/blue`,
      simulate402: true,
      priceUsdcHint: "0.001",
    });

    expect(result.ok).toBe(true);
    expect(result.paid).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.amountUsdc).toBe("0.001");
    expect(result.timeline.some((t) => /allowlist/.test(t))).toBe(true);
    expect(result.timeline.some((t) => /budget/.test(t))).toBe(true);
  });

  it("rejects URLs outside allowlist", async () => {
    const mandate = createSignedMandate(
      {
        principal: "did:example:marcelo",
        budgetUsdc: "0.05",
        expiresAt: "2026-12-31T23:59:59.000Z",
        allowlist: [`${BASE}/v1/fx/*`],
        network: "eip155:84532",
        resourceBase: BASE,
      },
      { mode: "hmac", secret: SECRET },
    );

    await expect(
      payAndFetch({
        mandate,
        verifier: { mode: "hmac", secret: SECRET },
        adapter: new HttpX402Adapter({ dryRun: true }),
        url: `${BASE}/v1/bcra/deudores/30500010912`,
        simulate402: true,
      }),
    ).rejects.toThrow(/allowlist/);
  });
});

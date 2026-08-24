import { describe, expect, it } from "vitest";
import {
  assertMandateBudget,
  canAfford,
  createSignedMandate,
  isUrlAllowed,
  verifyMandate,
} from "../index.js";

const SECRET = "demo-hmac-secret";
const BASE = "https://ar-agent-fx.mswitach.workers.dev";

describe("Intent Mandate v0", () => {
  it("signs and verifies with HMAC; enforces allowlist and budget", () => {
    const mandate = createSignedMandate(
      {
        principal: "did:example:marcelo",
        budgetUsdc: "0.05",
        expiresAt: "2026-12-31T23:59:59.000Z",
        allowlist: [
          `${BASE}/v1/fx/*`,
          `${BASE}/v1/bcra/*`,
          `${BASE}/v1/legal/*`,
        ],
        network: "eip155:84532",
        resourceBase: BASE,
      },
      { mode: "hmac", secret: SECRET },
    );

    expect(mandate.version).toBe("0.1.0");
    expect(mandate.signature.startsWith("hmac:")).toBe(true);
    expect(verifyMandate(mandate, { mode: "hmac", secret: SECRET })).toBe(true);
    expect(verifyMandate(mandate, { mode: "hmac", secret: "wrong" })).toBe(false);

    expect(isUrlAllowed(`${BASE}/v1/fx/usd/blue`, mandate.allowlist)).toBe(true);
    expect(isUrlAllowed(`${BASE}/v1/bcra/deudores/30500010912`, mandate.allowlist)).toBe(
      true,
    );
    expect(isUrlAllowed(`${BASE}/v1/cuit/30500010912`, mandate.allowlist)).toBe(false);

    expect(canAfford({ budgetUsdc: mandate.budgetUsdc, spentUsdc: "0" }, "0.01")).toBe(
      true,
    );
    expect(() => assertMandateBudget("0.001", "0.01")).toThrow(/exceeds mandate budget/);
  });
});

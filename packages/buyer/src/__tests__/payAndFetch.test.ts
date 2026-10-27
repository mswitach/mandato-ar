import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSignedMandate,
  formatUsdc,
  parseUsdc,
} from "@mandato-ar/mandate";
import { HttpX402Adapter } from "../adapter.js";
import { FIXTURE_402_BODY, encodePaymentRequiredHeader } from "../fixture.js";
import { payAndFetch } from "../payAndFetch.js";
import type { PaymentAdapter, PaymentProof, PaymentRequirement } from "../types.js";

const SECRET = "demo-hmac-secret";
const BASE = "https://ar-agent-fx.mswitach.workers.dev";
const FX_URL = `${BASE}/v1/fx/usd/blue`;

function signedMandate(budgetUsdc = "0.05") {
  return createSignedMandate(
    {
      principal: "did:example:marcelo",
      budgetUsdc,
      expiresAt: "2026-12-31T23:59:59.000Z",
      allowlist: [`${BASE}/v1/fx/*`, `${BASE}/v1/bcra/*`, `${BASE}/v1/legal/*`],
      network: "eip155:84532",
      resourceBase: BASE,
    },
    { mode: "hmac", secret: SECRET },
  );
}

type AcceptFixture = (typeof FIXTURE_402_BODY)["accepts"][number];

function paymentRequiredBody(
  overrides: Partial<Omit<AcceptFixture, "amount" | "network">> & {
    amount?: string;
    network?: string;
  } = {},
) {
  return {
    ...FIXTURE_402_BODY,
    accepts: [
      {
        ...FIXTURE_402_BODY.accepts[0],
        ...overrides,
      },
    ],
  };
}

function hasPaymentHeader(init?: RequestInit): boolean {
  if (!init?.headers) return false;
  const headers = init.headers;
  if (headers instanceof Headers) {
    return Boolean(headers.get("X-PAYMENT") || headers.get("PAYMENT-SIGNATURE"));
  }
  if (Array.isArray(headers)) {
    return headers.some(([key]) => /^(x-payment|payment-signature)$/i.test(key));
  }
  const rec = headers as Record<string, string>;
  return Boolean(
    rec["X-PAYMENT"] || rec["PAYMENT-SIGNATURE"] || rec["x-payment"] || rec["payment-signature"],
  );
}

function stub402Then200(body: unknown) {
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    if (!hasPaymentHeader(init)) {
      return new Response(JSON.stringify(body), {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader(body),
          "Content-Type": "application/json",
        },
      });
    }
    return new Response(JSON.stringify({ paid: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function trackingAdapter() {
  const calls: PaymentRequirement[] = [];
  const adapter: PaymentAdapter = {
    async pay(req: PaymentRequirement): Promise<PaymentProof> {
      calls.push(req);
      return {
        headerValue: "test-payment-proof",
        amountUsdc: formatUsdc(BigInt(req.amount)),
        dryRun: true,
      };
    },
  };
  return { adapter, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("payAndFetch dry-run", () => {
  it("uses recorded 402 fixture without wallet / network", async () => {
    expect(FIXTURE_402_BODY.accepts[0].network).toBe("eip155:84532");
    expect(encodePaymentRequiredHeader().length).toBeGreaterThan(20);

    const mandate = signedMandate();
    const result = await payAndFetch({
      mandate,
      verifier: { mode: "hmac", secret: SECRET },
      adapter: new HttpX402Adapter({ dryRun: true }),
      url: FX_URL,
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

describe("payAndFetch 402 cap vs priceUsdcHint", () => {
  it("pays when the real 402 amount is within the mandate cap", async () => {
    const body = paymentRequiredBody({ amount: "1000" });
    stub402Then200(body);
    const { adapter, calls } = trackingAdapter();

    const result = await payAndFetch({
      mandate: signedMandate("0.05"),
      verifier: { mode: "hmac", secret: SECRET },
      adapter,
      url: FX_URL,
      priceUsdcHint: "0.001",
    });

    expect(result.ok).toBe(true);
    expect(result.paid).toBe(true);
    expect(result.amountUsdc).toBe("0.001");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.amount).toBe("1000");
    expect(calls[0]?.network).toBe("eip155:84532");
    expect(calls[0]?.asset).toBe(FIXTURE_402_BODY.accepts[0].asset);
    expect(calls[0]?.payTo).toBe(FIXTURE_402_BODY.accepts[0].payTo);
  });

  it("rejects a real 402 amount above the cap even when the hint is below the cap", async () => {
    const body = paymentRequiredBody({ amount: "100000" }); // 0.10 USDC
    stub402Then200(body);
    const { adapter, calls } = trackingAdapter();

    await expect(
      payAndFetch({
        mandate: signedMandate("0.05"),
        verifier: { mode: "hmac", secret: SECRET },
        adapter,
        url: FX_URL,
        priceUsdcHint: "0.001",
      }),
    ).rejects.toThrow(/exceeds mandate budget/);
    expect(calls).toHaveLength(0);
  });

  it("allows a hint above the cap when the real 402 amount is within the cap", async () => {
    // Hint is a pre-flight estimate only. A stale/high hint must not substitute
    // for the 402 amount: if the selected accepts[].amount is within budgetUsdc,
    // payment proceeds. (Refuse only if the real amount exceeds the cap, or
    // differs from and exceeds the hint.)
    const body = paymentRequiredBody({ amount: "1000" }); // 0.001 USDC
    stub402Then200(body);
    const { adapter, calls } = trackingAdapter();

    const result = await payAndFetch({
      mandate: signedMandate("0.05"),
      verifier: { mode: "hmac", secret: SECRET },
      adapter,
      url: FX_URL,
      priceUsdcHint: "1.00",
    });

    expect(result.ok).toBe(true);
    expect(result.paid).toBe(true);
    expect(result.amountUsdc).toBe("0.001");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.amount).toBe("1000");
  });

  it("accepts a real amount equal to the cap and rejects cap + 1 micro", async () => {
    const capUsdc = "0.05";
    const capMicros = parseUsdc(capUsdc);
    expect(formatUsdc(capMicros)).toBe("0.05");

    const atCap = paymentRequiredBody({ amount: capMicros.toString() });
    stub402Then200(atCap);
    const atCapTrack = trackingAdapter();
    const passed = await payAndFetch({
      mandate: signedMandate(capUsdc),
      verifier: { mode: "hmac", secret: SECRET },
      adapter: atCapTrack.adapter,
      url: FX_URL,
      priceUsdcHint: capUsdc,
    });
    expect(passed.ok).toBe(true);
    expect(passed.paid).toBe(true);
    expect(passed.amountUsdc).toBe("0.05");
    expect(atCapTrack.calls).toHaveLength(1);

    vi.unstubAllGlobals();
    const overCap = paymentRequiredBody({ amount: (capMicros + 1n).toString() });
    stub402Then200(overCap);
    const overTrack = trackingAdapter();
    await expect(
      payAndFetch({
        mandate: signedMandate(capUsdc),
        verifier: { mode: "hmac", secret: SECRET },
        adapter: overTrack.adapter,
        url: FX_URL,
        priceUsdcHint: capUsdc,
      }),
    ).rejects.toThrow(/exceeds mandate budget/);
    expect(overTrack.calls).toHaveLength(0);
  });

  it("refuses before signing when the 402 amount differs from and exceeds the hint", async () => {
    const body = paymentRequiredBody({ amount: "2000" }); // 0.002 > hint 0.001, still < cap 0.05
    stub402Then200(body);
    const { adapter, calls } = trackingAdapter();

    await expect(
      payAndFetch({
        mandate: signedMandate("0.05"),
        verifier: { mode: "hmac", secret: SECRET },
        adapter,
        url: FX_URL,
        priceUsdcHint: "0.001",
      }),
    ).rejects.toThrow(/differs from and exceeds price hint/);
    expect(calls).toHaveLength(0);
  });

  it("rejects a 402 network that does not match the mandate", async () => {
    const body = paymentRequiredBody({ network: "eip155:8453", amount: "1000" });
    stub402Then200(body);
    const { adapter, calls } = trackingAdapter();

    await expect(
      payAndFetch({
        mandate: signedMandate("0.05"),
        verifier: { mode: "hmac", secret: SECRET },
        adapter,
        url: FX_URL,
        priceUsdcHint: "0.001",
      }),
    ).rejects.toThrow(/does not match mandate network/);
    expect(calls).toHaveLength(0);
  });
});

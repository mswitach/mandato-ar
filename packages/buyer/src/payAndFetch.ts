import {
  assertMandateBudget,
  assertNotExpired,
  isUrlAllowed,
  type IntentMandate,
  verifyMandate,
  type MandateVerifier,
} from "@mandato-ar/mandate";
import type { PaymentAdapter, PayAndFetchResult, PaymentRequirement } from "./types.js";
import { FIXTURE_402_BODY, encodePaymentRequiredHeader } from "./fixture.js";

export interface PayAndFetchOptions {
  mandate: IntentMandate;
  verifier: MandateVerifier;
  adapter: PaymentAdapter;
  url: string;
  init?: RequestInit;
  /** If true, simulate 402 without hitting the network. */
  simulate402?: boolean;
  priceUsdcHint?: string;
}

export async function payAndFetch(opts: PayAndFetchOptions): Promise<PayAndFetchResult> {
  const timeline: string[] = [];
  const { mandate, verifier, adapter, url } = opts;

  timeline.push("verify mandate signature");
  if (!verifyMandate(mandate, verifier)) {
    throw new Error("Invalid mandate signature");
  }
  assertNotExpired(mandate);
  timeline.push("mandate ok + not expired");

  if (!isUrlAllowed(url, mandate.allowlist)) {
    throw new Error(`URL not in allowlist: ${url}`);
  }
  timeline.push(`allowlist match: ${url}`);

  if (opts.simulate402) {
    return simulateFlow(opts, timeline);
  }

  timeline.push("GET (unauthenticated)");
  const first = await fetch(url, opts.init);
  if (first.status !== 402) {
    const body = await safeJson(first);
    timeline.push(`status ${first.status} (no payment required)`);
    return {
      ok: first.ok,
      status: first.status,
      url,
      body,
      paid: false,
      dryRun: true,
      timeline,
    };
  }

  timeline.push("received 402 Payment Required");
  const req = await parse402(first, url, opts.priceUsdcHint);
  assertMandateBudget(mandate.budgetUsdc, req.amountUsdcDisplay);
  timeline.push(`budget check ok for ${req.amountUsdcDisplay} USDC`);

  const proof = await adapter.pay(req.payment);
  timeline.push(proof.dryRun ? "adapter pay (dry-run stub)" : "adapter pay (live)");

  const second = await fetch(url, {
    ...opts.init,
    headers: {
      ...(opts.init?.headers as Record<string, string> | undefined),
      "X-PAYMENT": proof.headerValue,
      "PAYMENT-SIGNATURE": proof.headerValue,
    },
  });
  const body = await safeJson(second);
  timeline.push(`retry status ${second.status}`);

  return {
    ok: second.ok,
    status: second.status,
    url,
    body,
    paid: true,
    amountUsdc: proof.amountUsdc,
    dryRun: proof.dryRun,
    timeline,
  };
}

async function simulateFlow(
  opts: PayAndFetchOptions,
  timeline: string[],
): Promise<PayAndFetchResult> {
  const { mandate, adapter, url } = opts;
  timeline.push("simulate 402 (dry-run, no network)");
  const payment: PaymentRequirement = {
    amount: opts.priceUsdcHint ? usdcToMicros(opts.priceUsdcHint) : "1000",
    asset: "USDC",
    network: mandate.network,
    payTo: FIXTURE_402_BODY.accepts[0].payTo,
    resource: url,
  };
  const amountUsdcDisplay = opts.priceUsdcHint ?? "0.001";
  assertMandateBudget(mandate.budgetUsdc, amountUsdcDisplay);
  timeline.push(`budget check ok for ${amountUsdcDisplay} USDC`);
  timeline.push(`fixture header: ${encodePaymentRequiredHeader().slice(0, 24)}...`);

  const proof = await adapter.pay(payment);
  timeline.push(proof.dryRun ? "adapter pay (dry-run stub)" : "adapter pay (live)");
  timeline.push("mock 200 response");

  return {
    ok: true,
    status: 200,
    url,
    body: {
      simulated: true,
      resource: url,
      note: "Dry-run mock — use --live without simulate for real HTTP",
    },
    paid: true,
    amountUsdc: proof.amountUsdc,
    dryRun: proof.dryRun,
    timeline,
  };
}

async function parse402(
  res: Response,
  url: string,
  priceHint?: string,
): Promise<{ payment: PaymentRequirement; amountUsdcDisplay: string }> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = FIXTURE_402_BODY;
  }
  const accepts = (body as { accepts?: Array<Record<string, string>> })?.accepts?.[0];
  const amountRaw = accepts?.maxAmountRequired ?? (priceHint ? usdcToMicros(priceHint) : "1000");
  const amountUsdcDisplay = priceHint ?? microsToUsdc(amountRaw);
  return {
    amountUsdcDisplay,
    payment: {
      amount: amountRaw,
      asset: accepts?.asset ?? "USDC",
      network: accepts?.network ?? "eip155:84532",
      payTo: accepts?.payTo,
      resource: accepts?.resource ?? url,
    },
  };
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 2000) };
  }
}

function usdcToMicros(amount: string): string {
  const [w, f = ""] = amount.split(".");
  return (BigInt(w || "0") * 1_000_000n + BigInt(f.padEnd(6, "0").slice(0, 6))).toString();
}

function microsToUsdc(amount: string): string {
  if (amount.includes(".")) return amount;
  const micros = BigInt(amount);
  const whole = micros / 1_000_000n;
  const frac = (micros % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

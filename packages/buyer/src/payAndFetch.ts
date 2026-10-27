import {
  assertMandateBudget,
  assertNotExpired,
  formatUsdc,
  isUrlAllowed,
  parseUsdc,
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
  /**
   * Pre-flight price estimate (USDC decimal). Never used as the cap amount.
   * The mandate cap is always checked against the selected 402 `accepts[]`.amount
   * (USDC micro-units via parseUsdc/formatUsdc). If the real amount differs from
   * this hint and exceeds it, payment is refused before signing.
   */
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

  if (opts.priceUsdcHint) {
    timeline.push(`preflight price hint ${opts.priceUsdcHint} USDC (estimate only)`);
  }

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
  const req = await parse402(first, url, mandate);
  assertRealAmountAllowed(mandate.budgetUsdc, req.amountUsdcDisplay, opts.priceUsdcHint);
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

/**
 * Cap is enforced against the real 402 amount (USDC micros → formatUsdc), never the hint.
 *
 * Chosen hint behavior:
 * - Hint above cap + real amount within cap → allow (hint is an estimate; 402 is authoritative).
 * - Real amount exceeds cap → refuse, even if the hint was under the cap.
 * - Real amount differs from the hint and is greater than the hint → refuse before signing
 *   (seller asked for more than advertised), even if still under the cap.
 * - Exact cap boundary: amount == cap passes; cap + 1 micro is rejected.
 */
function assertRealAmountAllowed(
  mandateBudgetUsdc: string,
  amountUsdcDisplay: string,
  priceUsdcHint?: string,
): void {
  assertMandateBudget(mandateBudgetUsdc, amountUsdcDisplay);
  if (priceUsdcHint === undefined) return;
  const real = parseUsdc(amountUsdcDisplay);
  const hint = parseUsdc(priceUsdcHint);
  if (real !== hint && real > hint) {
    throw new Error(
      `402 amount ${amountUsdcDisplay} USDC differs from and exceeds price hint ${priceUsdcHint} USDC`,
    );
  }
}

async function simulateFlow(
  opts: PayAndFetchOptions,
  timeline: string[],
): Promise<PayAndFetchResult> {
  const { mandate, adapter, url } = opts;
  timeline.push("simulate 402 (dry-run, no network)");
  const amountMicros = opts.priceUsdcHint ? parseUsdc(opts.priceUsdcHint) : 1000n;
  const amountUsdcDisplay = formatUsdc(amountMicros);
  const payment: PaymentRequirement = {
    amount: amountMicros.toString(),
    asset: "USDC",
    network: mandate.network,
    payTo: FIXTURE_402_BODY.accepts[0].payTo,
    resource: url,
  };
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
  mandate: IntentMandate,
): Promise<{ payment: PaymentRequirement; amountUsdcDisplay: string }> {
  const paymentRequiredHeader = res.headers.get("payment-required");
  let paymentData: unknown;

  if (paymentRequiredHeader) {
    try {
      const decoded = Buffer.from(paymentRequiredHeader, "base64url").toString("utf8");
      paymentData = JSON.parse(decoded);
    } catch (error) {
      console.warn("Failed to parse PAYMENT-REQUIRED header, falling back to body:", error);
    }
  }

  if (!paymentData) {
    try {
      paymentData = await res.json();
    } catch {
      throw new Error("Unable to parse 402 PAYMENT-REQUIRED (header and body)");
    }
  }

  const accept = selectAccept(paymentData, mandate);
  assert402MatchesMandate(mandate, accept);

  const amountField = accept.amount ?? accept.maxAmountRequired;
  if (amountField === undefined || amountField === null || amountField === "") {
    throw new Error("402 accept is missing amount");
  }
  const amountMicros = microsFrom402Amount(amountField);
  const amountUsdcDisplay = formatUsdc(amountMicros);

  return {
    amountUsdcDisplay,
    payment: {
      amount: amountMicros.toString(),
      asset: accept.asset != null && String(accept.asset) !== "" ? String(accept.asset) : "USDC",
      network: String(accept.network),
      payTo: typeof accept.payTo === "string" ? accept.payTo : undefined,
      resource: (typeof accept.resource === "string" ? accept.resource : undefined) ?? url,
      extra: accept.extra as Record<string, unknown> | undefined,
    },
  };
}

function selectAccept(
  paymentData: unknown,
  mandate: IntentMandate,
): Record<string, unknown> {
  const accepts = (paymentData as { accepts?: Array<Record<string, unknown>> })?.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new Error("402 PAYMENT-REQUIRED has no accepts[]");
  }
  const matched = accepts.find((entry) => String(entry.network) === mandate.network);
  if (!matched) {
    throw new Error(
      `402 network ${String(accepts[0]?.network)} does not match mandate network ${mandate.network}`,
    );
  }
  return matched;
}

/**
 * v0 mandate carries `network` only. Asset and payTo are taken from the selected
 * 402 accept (no mandate fields to compare); they are not overwritten with
 * defaults that could hide a mismatch.
 */
function assert402MatchesMandate(
  mandate: IntentMandate,
  accept: Record<string, unknown>,
): void {
  const network = String(accept.network ?? "");
  if (network !== mandate.network) {
    throw new Error(
      `402 network ${network} does not match mandate network ${mandate.network}`,
    );
  }
}

function microsFrom402Amount(raw: unknown): bigint {
  const text = String(raw).trim();
  if (text.includes(".")) {
    return parseUsdc(text);
  }
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid 402 amount: ${text}`);
  }
  return BigInt(text);
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 2000) };
  }
}

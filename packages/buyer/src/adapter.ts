import type { PaymentAdapter, PaymentProof, PaymentRequirement } from "./types.js";

export interface HttpX402AdapterOptions {
  /** When true, never touches chain — returns a stub proof. */
  dryRun?: boolean;
  facilitatorUrl?: string;
  /** Hex private key — only used when dryRun=false (not implemented on-chain here). */
  privateKey?: string;
}

/**
 * Stub HTTP x402 adapter.
 * Dry-run: returns a fake proof suitable for timeline demos.
 * Live: documents the facilitator flow; real signing is left for a wallet integration.
 */
export class HttpX402Adapter implements PaymentAdapter {
  readonly dryRun: boolean;
  readonly facilitatorUrl: string;
  private readonly privateKey?: string;

  constructor(opts: HttpX402AdapterOptions = {}) {
    this.dryRun = opts.dryRun ?? true;
    this.facilitatorUrl = opts.facilitatorUrl ?? "https://x402.org/facilitator";
    this.privateKey = opts.privateKey;
  }

  async pay(req: PaymentRequirement): Promise<PaymentProof> {
    if (this.dryRun || !this.privateKey) {
      const stub = {
        dryRun: true,
        network: req.network,
        amount: req.amount,
        asset: req.asset,
        payTo: req.payTo,
        note: "HttpX402Adapter stub — set BUYER_PRIVATE_KEY and dryRun=false for live",
      };
      return {
        headerValue: Buffer.from(JSON.stringify(stub), "utf8").toString("base64url"),
        amountUsdc: microsToUsdc(req.amount),
        dryRun: true,
      };
    }

    // Live path: scaffold only — wire facilitator settle/verify with your wallet.
    throw new Error(
      `Live x402 settle not wired in MVP stub. Facilitator: ${this.facilitatorUrl}. ` +
        "Use dry-run or plug a wallet PaymentAdapter.",
    );
  }
}

/** maxAmountRequired may be integer micros ("1000" = 0.001 USDC) or decimal. */
function microsToUsdc(amount: string): string {
  if (amount.includes(".")) return amount;
  const micros = BigInt(amount);
  const whole = micros / 1_000_000n;
  const frac = (micros % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

import { utf8ToBase64Url } from "./base64url.js";
import type { PaymentAdapter, PaymentProof, PaymentRequirement } from "./types.js";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequired } from "@x402/core/types";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

export interface HttpX402AdapterOptions {
  /** When true, never touches chain — returns a stub proof. */
  dryRun?: boolean;
  facilitatorUrl?: string;
  /** Hex private key — only used when dryRun=false */
  privateKey?: string;
}

/**
 * HTTP x402 adapter with Exact EVM (EIP-3009) support.
 * Dry-run: returns a fake proof suitable for timeline demos.
 * Live: signs EIP-3009 payment with buyer key via @x402/evm.
 */
export class HttpX402Adapter implements PaymentAdapter {
  readonly dryRun: boolean;
  readonly facilitatorUrl: string;
  private readonly privateKey?: string;
  private httpClient?: x402HTTPClient;

  constructor(opts: HttpX402AdapterOptions = {}) {
    this.dryRun = opts.dryRun ?? true;
    this.facilitatorUrl = opts.facilitatorUrl ?? "https://x402.org/facilitator";
    this.privateKey = opts.privateKey;

    if (!this.dryRun && this.privateKey) {
      try {
        const account = privateKeyToAccount(this.privateKey as `0x${string}`);
        const signer = toClientEvmSigner(account);
        const client = new x402Client();
        client.register("eip155:*", new ExactEvmScheme(signer));
        this.httpClient = new x402HTTPClient(client);
      } catch (error) {
        throw new Error(
          `Failed to initialize x402 client: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  async pay(req: PaymentRequirement): Promise<PaymentProof> {
    if (this.dryRun || !this.privateKey || !this.httpClient) {
      const stub = {
        dryRun: true,
        network: req.network,
        amount: req.amount,
        asset: req.asset,
        payTo: req.payTo,
        note: "HttpX402Adapter stub — set BUYER_PRIVATE_KEY and dryRun=false for live",
      };
      return {
        headerValue: utf8ToBase64Url(JSON.stringify(stub)),
        amountUsdc: microsToUsdc(req.amount),
        dryRun: true,
      };
    }

    const accept: Record<string, unknown> = {
      scheme: "exact",
      network: req.network as `${string}:${string}`,
      amount: req.amount,
      asset: req.asset || "",
      payTo: req.payTo || "",
      maxTimeoutSeconds: 300,
    };
    if (req.extra) {
      accept.extra = req.extra;
    }

    const paymentRequired: PaymentRequired = {
      x402Version: 2,
      error: "Payment required",
      resource: {
        url: req.resource || "",
        description: "AR data resource",
        mimeType: "application/json",
      },
      accepts: [accept] as PaymentRequired["accepts"],
    };

    try {
      const paymentPayload = await this.httpClient.createPaymentPayload(paymentRequired);
      const headers = this.httpClient.encodePaymentSignatureHeader(paymentPayload);
      const headerValue = headers["PAYMENT-SIGNATURE"] || headers["X-PAYMENT"] || "";

      return {
        headerValue,
        amountUsdc: microsToUsdc(req.amount),
        dryRun: false,
      };
    } catch (error) {
      throw new Error(
        `Live x402 payment failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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

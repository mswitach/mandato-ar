export interface PaymentRequirement {
  amount: string;
  asset: string;
  network: string;
  payTo?: string;
  resource?: string;
  extra?: Record<string, unknown>;
}

export interface PaymentProof {
  /** Opaque proof / header value the resource server expects */
  headerValue: string;
  amountUsdc: string;
  dryRun: boolean;
  txHash?: string;
}

export interface PaymentAdapter {
  /** Build a payment proof for a 402 challenge (stub or live). */
  pay(req: PaymentRequirement): Promise<PaymentProof>;
}

export interface PayAndFetchResult {
  ok: boolean;
  status: number;
  url: string;
  body: unknown;
  paid: boolean;
  amountUsdc?: string;
  dryRun: boolean;
  timeline: string[];
}

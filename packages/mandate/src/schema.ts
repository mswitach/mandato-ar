import { z } from "zod";

/** Intent Mandate v0 — budget + allowlist for x402 agent payments. */
export const IntentMandateSchema = z.object({
  version: z.literal("0.1.0"),
  principal: z.string().min(1),
  budgetUsdc: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, "budgetUsdc must be a decimal USDC string"),
  expiresAt: z.string().datetime(),
  allowlist: z.array(z.string().min(1)).min(1),
  network: z.string().min(1),
  resourceBase: z.string().url(),
  nonce: z.string().min(8),
  signature: z.string().min(1),
});

export type IntentMandate = z.infer<typeof IntentMandateSchema>;

export type UnsignedMandate = Omit<IntentMandate, "signature">;

export const DEMO_PRESETS = {
  fxBlue: {
    label: "FX blue",
    path: "/v1/fx/usd/blue",
    priceUsdc: "0.001",
  },
  bcraCuit: {
    label: "BCRA CUIT 30500010912",
    path: "/v1/bcra/deudores/30500010912",
    priceUsdc: "0.01",
  },
  legalMonotributo: {
    label: "Legal search monotributo",
    path: "/v1/legal/search?q=monotributo",
    priceUsdc: "0.005",
  },
} as const;

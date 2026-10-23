import { z } from "zod";

const usdcAmount = z
  .string()
  .regex(/^\d+(\.\d{1,6})?$/, "USDC amount must be a decimal string");

const principalSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  display: z.string().min(1).optional(),
});

const agentSchema = z.object({
  id: z.string().min(1),
  handle: z.string().min(1).optional(),
  role: z.string().min(1),
});

const scopeSchema = z.object({
  allowedAssets: z.array(z.string().min(1)),
  allowedActions: z.array(z.string().min(1)),
  deniedActions: z.array(z.string().min(1)),
  approvalMode: z.string().min(1),
});

const limitsSchema = z.object({
  currency: z.string().min(1),
  maxPerOperationUsdc: usdcAmount,
  maxPerDayUsdc: usdcAmount,
  dayBoundary: z.string().min(1),
  aboveLimit: z.string().min(1),
});

const disputeLiabilitySchema = z.object({
  withinMandate: z.string().min(1),
  outsideMandate: z.string().min(1),
  note: z.string().min(1).optional(),
});

const receiptSchema = z.object({
  required: z.boolean(),
  chain: z.string().min(1),
  format: z.string().min(1),
  status: z.string().min(1).optional(),
  txHash: z.string().min(1).optional(),
});

/**
 * Intent Mandate v0.2 — scoped agent authority (assets, actions, limits).
 * Accepts both `"0.2.0"` and the example's `"0.2.0-draft"`.
 */
export const IntentMandateV2Schema = z.object({
  version: z.enum(["0.2.0", "0.2.0-draft"]),
  kind: z.literal("intent-mandate"),
  example: z.boolean().optional(),
  principal: principalSchema,
  agent: agentSchema,
  network: z.string().min(1),
  scope: scopeSchema,
  limits: limitsSchema,
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  authorizedBy: z.string().min(1),
  disputeLiability: disputeLiabilitySchema,
  receipt: receiptSchema,
  nonce: z.string().min(1),
  signature: z.string().min(1),
});

export const UnsignedMandateV2Schema = IntentMandateV2Schema.omit({ signature: true });

export type IntentMandateV2 = z.infer<typeof IntentMandateV2Schema>;
export type UnsignedMandateV2 = z.infer<typeof UnsignedMandateV2Schema>;

import { IntentMandateSchema, type IntentMandate, type UnsignedMandate } from "./schema.js";
import { newNonce, signMandate, type MandateSigner } from "./crypto.js";

export interface CreateMandateInput {
  principal: string;
  budgetUsdc: string;
  expiresAt: string;
  allowlist: string[];
  network: string;
  resourceBase: string;
  nonce?: string;
}

export function createUnsignedMandate(input: CreateMandateInput): UnsignedMandate {
  return {
    version: "0.1.0",
    principal: input.principal,
    budgetUsdc: input.budgetUsdc,
    expiresAt: input.expiresAt,
    allowlist: input.allowlist,
    network: input.network,
    resourceBase: input.resourceBase,
    nonce: input.nonce ?? newNonce(),
  };
}

export function createSignedMandate(
  input: CreateMandateInput,
  signer: MandateSigner,
): IntentMandate {
  const unsigned = createUnsignedMandate(input);
  const signed = signMandate(unsigned, signer);
  return IntentMandateSchema.parse(signed);
}

export function assertNotExpired(m: IntentMandate, now = new Date()): void {
  if (new Date(m.expiresAt).getTime() <= now.getTime()) {
    throw new Error(`Mandate expired at ${m.expiresAt}`);
  }
}

import type { UnsignedMandate } from "./schema.js";

/** Stable JSON for signing: sorted keys, no signature field. */
export function canonicalizeMandate(m: UnsignedMandate): string {
  const ordered: Record<string, unknown> = {
    allowlist: m.allowlist,
    budgetUsdc: m.budgetUsdc,
    expiresAt: m.expiresAt,
    network: m.network,
    nonce: m.nonce,
    principal: m.principal,
    resourceBase: m.resourceBase,
    version: m.version,
  };
  return JSON.stringify(ordered);
}

import { parseUsdc } from "./budget.js";
import type { IntentMandateV2 } from "./schema-v2.js";

export interface MandateOperationV2 {
  asset: string;
  action: string;
  amountUsdc: string;
}

export interface MandateDayStateV2 {
  spentTodayUsdc: string;
}

export type CheckOperationReason =
  | "not_yet_issued"
  | "expired"
  | "action_not_allowed"
  | "action_denied"
  | "asset_not_allowed"
  | "exceeds_max_per_operation"
  | "exceeds_max_per_day";

export interface CheckOperationResult {
  ok: boolean;
  reasons: CheckOperationReason[];
}

/**
 * Check whether an operation is inside a v0.2 mandate at `now`.
 * Collects every applicable rejection reason (does not fail-fast).
 */
export function checkOperation(
  mandate: IntentMandateV2,
  op: MandateOperationV2,
  state: MandateDayStateV2,
  now: Date = new Date(),
): CheckOperationResult {
  const reasons: CheckOperationReason[] = [];
  const nowMs = now.getTime();

  if (nowMs < new Date(mandate.issuedAt).getTime()) {
    reasons.push("not_yet_issued");
  }
  if (nowMs >= new Date(mandate.expiresAt).getTime()) {
    reasons.push("expired");
  }

  if (mandate.scope.deniedActions.includes(op.action)) {
    reasons.push("action_denied");
  }
  if (!mandate.scope.allowedActions.includes(op.action)) {
    reasons.push("action_not_allowed");
  }
  if (!mandate.scope.allowedAssets.includes(op.asset)) {
    reasons.push("asset_not_allowed");
  }

  const amount = parseUsdc(op.amountUsdc);
  if (amount > parseUsdc(mandate.limits.maxPerOperationUsdc)) {
    reasons.push("exceeds_max_per_operation");
  }
  if (parseUsdc(state.spentTodayUsdc) + amount > parseUsdc(mandate.limits.maxPerDayUsdc)) {
    reasons.push("exceeds_max_per_day");
  }

  return { ok: reasons.length === 0, reasons };
}

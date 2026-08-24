/** Compare decimal USDC strings without floating error for small amounts. */
export function parseUsdc(amount: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(amount.trim());
  if (!m) throw new Error(`Invalid USDC amount: ${amount}`);
  const whole = BigInt(m[1]!);
  const frac = (m[2] ?? "").padEnd(6, "0");
  return whole * 1_000_000n + BigInt(frac);
}

export function formatUsdc(micros: bigint): string {
  const neg = micros < 0n;
  const v = neg ? -micros : micros;
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "") || "0";
  const s = frac === "0" ? whole.toString() : `${whole}.${frac}`;
  return neg ? `-${s}` : s;
}

export interface BudgetState {
  budgetUsdc: string;
  spentUsdc: string;
}

export function remainingUsdc(state: BudgetState): string {
  return formatUsdc(parseUsdc(state.budgetUsdc) - parseUsdc(state.spentUsdc));
}

export function canAfford(state: BudgetState, priceUsdc: string): boolean {
  return parseUsdc(state.budgetUsdc) - parseUsdc(state.spentUsdc) >= parseUsdc(priceUsdc);
}

export function applySpend(state: BudgetState, priceUsdc: string): BudgetState {
  if (!canAfford(state, priceUsdc)) {
    throw new Error(
      `Budget exceeded: need ${priceUsdc} USDC, remaining ${remainingUsdc(state)}`,
    );
  }
  return {
    budgetUsdc: state.budgetUsdc,
    spentUsdc: formatUsdc(parseUsdc(state.spentUsdc) + parseUsdc(priceUsdc)),
  };
}

export function assertMandateBudget(mandateBudgetUsdc: string, priceUsdc: string): void {
  if (parseUsdc(mandateBudgetUsdc) < parseUsdc(priceUsdc)) {
    throw new Error(
      `Price ${priceUsdc} exceeds mandate budget ${mandateBudgetUsdc} USDC`,
    );
  }
}

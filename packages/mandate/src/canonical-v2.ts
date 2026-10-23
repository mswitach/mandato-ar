/**
 * Recursively sort object keys. Arrays keep their order; items are visited.
 * Used so two equivalent mandate objects produce the same JSON bytes.
 */
function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

/**
 * Canonical JSON for Intent Mandate v0.2 signing:
 * keys sorted recursively, top-level `signature` omitted, no extra whitespace.
 */
export function canonicalizeMandateV2(mandate: unknown): string {
  if (!mandate || typeof mandate !== "object") {
    return JSON.stringify(sortKeysDeep({}));
  }
  const rest: Record<string, unknown> = { ...(mandate as Record<string, unknown>) };
  delete rest.signature;
  return JSON.stringify(sortKeysDeep(rest));
}

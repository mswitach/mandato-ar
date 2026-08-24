/**
 * Match a URL against allowlist patterns.
 * Supports trailing `*` as a path prefix wildcard (not full glob).
 */
export function isUrlAllowed(url: string, allowlist: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const normalized = parsed.origin + parsed.pathname + parsed.search;
  return allowlist.some((pattern) => matchPattern(normalized, pattern));
}

function matchPattern(url: string, pattern: string): boolean {
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return url.startsWith(prefix);
  }
  // Exact match, or same path ignoring trailing slash
  if (url === pattern) return true;
  const a = url.endsWith("/") ? url.slice(0, -1) : url;
  const b = pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
  return a === b;
}

/** Browser + Node base64url helpers (no Buffer). */
function bytesToBinaryString(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return bin;
}

function toBase64(bin: string): string {
  if (typeof btoa === "function") return btoa(bin);
  const Buf = (globalThis as { Buffer?: { from: (s: string, e: string) => { toString: (e: string) => string } } }).Buffer;
  if (Buf) return Buf.from(bin, "binary").toString("base64");
  throw new Error("No base64 encoder available");
}

export function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const b64 = toBase64(bytesToBinaryString(bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

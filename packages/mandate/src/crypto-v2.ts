import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { canonicalizeMandateV2 } from "./canonical-v2.js";
import type { Ed25519Signer, Ed25519Verifier } from "./crypto.js";
import {
  IntentMandateV2Schema,
  UnsignedMandateV2Schema,
  type IntentMandateV2,
  type UnsignedMandateV2,
} from "./schema-v2.js";

function payloadBytes(mandate: unknown): Uint8Array {
  return utf8ToBytes(canonicalizeMandateV2(mandate));
}

/**
 * Sign an unsigned v0.2 mandate with raw 32-byte ed25519 hex keys (@noble).
 * Signature format: `ed25519:<64-byte hex>`.
 */
export function signMandateV2(
  mandate: UnsignedMandateV2,
  signer: Ed25519Signer,
): IntentMandateV2 {
  const unsigned = UnsignedMandateV2Schema.parse(mandate);
  const sk = hexToBytes(signer.privateKeyHex);
  const signature = "ed25519:" + bytesToHex(ed25519.sign(payloadBytes(unsigned), sk));
  return IntentMandateV2Schema.parse({ ...unsigned, signature });
}

/**
 * Verify a v0.2 mandate signature over the canonical UTF-8 bytes.
 * Compatible with signatures produced by Node `crypto` ed25519 and @noble.
 */
export function verifyMandateV2(
  mandate: IntentMandateV2,
  verifier: Ed25519Verifier,
): boolean {
  const sig = mandate.signature;
  if (!sig.startsWith("ed25519:")) return false;
  try {
    const raw = hexToBytes(sig.slice("ed25519:".length));
    const pub = hexToBytes(verifier.publicKeyHex);
    return ed25519.verify(raw, payloadBytes(mandate), pub);
  } catch {
    return false;
  }
}

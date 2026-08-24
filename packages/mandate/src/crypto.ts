import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils";
import { canonicalizeMandate } from "./canonical.js";
import type { IntentMandate, UnsignedMandate } from "./schema.js";

export type SigningMode = "hmac" | "ed25519";

export interface HmacSigner {
  mode: "hmac";
  secret: string;
}

export interface Ed25519Signer {
  mode: "ed25519";
  /** 32-byte private key as hex (or PKCS8 PEM on Node — prefer hex). */
  privateKeyHex: string;
}

export type MandateSigner = HmacSigner | Ed25519Signer;

export interface HmacVerifier {
  mode: "hmac";
  secret: string;
}

export interface Ed25519Verifier {
  mode: "ed25519";
  publicKeyHex: string;
}

export type MandateVerifier = HmacVerifier | Ed25519Verifier;

function payloadBytes(m: UnsignedMandate): Uint8Array {
  return utf8ToBytes(canonicalizeMandate(m));
}

function asUnsigned(m: IntentMandate | UnsignedMandate): UnsignedMandate {
  const { signature: _ignored, ...rest } = m as IntentMandate;
  return rest;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Sign an unsigned mandate.
 * - HMAC-SHA256 (prefix `hmac:`) — convenient for demos / browser
 * - ed25519 (prefix `ed25519:`) — raw 32-byte hex keys
 */
export function signMandate(m: UnsignedMandate, signer: MandateSigner): IntentMandate {
  const bytes = payloadBytes(m);
  let signature: string;
  if (signer.mode === "hmac") {
    const mac = hmac(sha256, utf8ToBytes(signer.secret), bytes);
    signature = "hmac:" + bytesToHex(mac);
  } else {
    const sk = hexToBytes(signer.privateKeyHex);
    signature = "ed25519:" + bytesToHex(ed25519.sign(bytes, sk));
  }
  return { ...m, signature };
}

export function verifyMandate(m: IntentMandate, verifier: MandateVerifier): boolean {
  const bytes = payloadBytes(asUnsigned(m));
  const sig = m.signature;
  if (verifier.mode === "hmac") {
    if (!sig.startsWith("hmac:")) return false;
    const expected =
      "hmac:" + bytesToHex(hmac(sha256, utf8ToBytes(verifier.secret), bytes));
    return timingSafeEqualHex(sig, expected);
  }
  if (!sig.startsWith("ed25519:")) return false;
  const raw = hexToBytes(sig.slice("ed25519:".length));
  const pub = hexToBytes(verifier.publicKeyHex);
  return ed25519.verify(raw, bytes, pub);
}

/** Generate an ed25519 hex keypair for demos (do not commit the private key). */
export function generateEd25519DemoKeypair(): {
  privateKeyHex: string;
  publicKeyHex: string;
} {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(publicKey),
  };
}

export function newNonce(bytes = 16): string {
  return bytesToHex(randomBytes(bytes));
}

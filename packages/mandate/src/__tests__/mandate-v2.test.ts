import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  IntentMandateV2Schema,
  canonicalizeMandateV2,
  checkOperation,
  generateEd25519DemoKeypair,
  signMandateV2,
  verifyMandateV2,
  type IntentMandateV2,
  type UnsignedMandateV2,
} from "../index.js";

const examplePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../examples/ash-example-mandate.json",
);

const exampleDoc = JSON.parse(readFileSync(examplePath, "utf8")) as {
  mandate: IntentMandateV2;
  verifier: { mode: "ed25519"; publicKeyHex: string };
};

const example = IntentMandateV2Schema.parse(exampleDoc.mandate);
const exampleVerifier = {
  mode: "ed25519" as const,
  publicKeyHex: exampleDoc.verifier.publicKeyHex,
};

const NOW = new Date("2026-10-23T12:00:00.000Z");
const VALID_OP = { asset: "USDC", action: "spot_buy", amountUsdc: "25" };
const ZERO_SPENT = { spentTodayUsdc: "0" };

function unsignedExample(): UnsignedMandateV2 {
  const { signature, ...rest } = example;
  void signature;
  return rest;
}

describe("Intent Mandate v0.2", () => {
  it("parses the Ash example and accepts 0.2.0 or 0.2.0-draft", () => {
    expect(example.version).toBe("0.2.0-draft");
    expect(IntentMandateV2Schema.parse({ ...example, version: "0.2.0" }).version).toBe(
      "0.2.0",
    );
  });

  it("verifies the attached example with its demo ed25519 public key", () => {
    expect(verifyMandateV2(example, exampleVerifier)).toBe(true);
  });

  it("canonicalizes with recursively sorted keys and no signature field", () => {
    const canonical = canonicalizeMandateV2(example);
    expect(canonical).toContain('"agent"');
    expect(canonical.includes('"signature"')).toBe(false);
    expect(canonical.startsWith("{")).toBe(true);
    const parsed = JSON.parse(canonical) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(Object.keys(parsed).slice().sort());
    const scope = parsed.scope as Record<string, unknown>;
    expect(Object.keys(scope)).toEqual(Object.keys(scope).slice().sort());
    expect(canonical).toBe(canonicalizeMandateV2(unsignedExample()));
  });

  it("fails verification when any signed field is tampered", () => {
    const tampers: IntentMandateV2[] = [
      { ...example, nonce: "ffffffff00000000" },
      { ...example, version: "0.2.0" },
      { ...example, network: "eip155:8453" },
      { ...example, authorizedBy: "did:example:other" },
      { ...example, issuedAt: "2026-10-22T21:00:01.000Z" },
      { ...example, expiresAt: "2026-11-22T23:59:58.000Z" },
      {
        ...example,
        principal: { ...example.principal, display: "Someone else" },
      },
      { ...example, agent: { ...example.agent, handle: "@other" } },
      {
        ...example,
        scope: { ...example.scope, allowedAssets: ["USDC"] },
      },
      {
        ...example,
        limits: { ...example.limits, maxPerOperationUsdc: "24" },
      },
      {
        ...example,
        disputeLiability: { ...example.disputeLiability, withinMandate: "agent" },
      },
      {
        ...example,
        receipt: { ...example.receipt, status: "confirmed" },
      },
    ];

    for (const tampered of tampers) {
      expect(verifyMandateV2(tampered, exampleVerifier)).toBe(false);
    }
  });

  it("round-trips sign/verify with a fresh @noble ed25519 keypair", () => {
    const keys = generateEd25519DemoKeypair();
    const signed = signMandateV2(unsignedExample(), {
      mode: "ed25519",
      privateKeyHex: keys.privateKeyHex,
    });
    expect(signed.signature.startsWith("ed25519:")).toBe(true);
    expect(
      verifyMandateV2(signed, { mode: "ed25519", publicKeyHex: keys.publicKeyHex }),
    ).toBe(true);
    expect(verifyMandateV2(signed, exampleVerifier)).toBe(false);
  });

  it("allows a spot_buy of exactly 25 USDC inside the validity window", () => {
    const result = checkOperation(example, VALID_OP, ZERO_SPENT, NOW);
    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("rejects 25.000001 as over the per-operation limit", () => {
    const result = checkOperation(
      example,
      { ...VALID_OP, amountUsdc: "25.000001" },
      ZERO_SPENT,
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["exceeds_max_per_operation"]);
  });

  it("allows a daily total of exactly 100 USDC and rejects the next micro", () => {
    const atCap = checkOperation(
      example,
      VALID_OP,
      { spentTodayUsdc: "75" },
      NOW,
    );
    expect(atCap).toEqual({ ok: true, reasons: [] });

    const overCap = checkOperation(
      example,
      { ...VALID_OP, amountUsdc: "20.000001" },
      { spentTodayUsdc: "80" },
      NOW,
    );
    expect(overCap.ok).toBe(false);
    expect(overCap.reasons).toEqual(["exceeds_max_per_day"]);
  });

  it("rejects an expired mandate and a not-yet-issued mandate", () => {
    const atExpiry = checkOperation(
      example,
      VALID_OP,
      ZERO_SPENT,
      new Date(example.expiresAt),
    );
    expect(atExpiry.ok).toBe(false);
    expect(atExpiry.reasons).toEqual(["expired"]);

    const afterExpiry = checkOperation(
      example,
      VALID_OP,
      ZERO_SPENT,
      new Date("2026-11-23T00:00:00.000Z"),
    );
    expect(afterExpiry.reasons).toContain("expired");

    const beforeIssue = checkOperation(
      example,
      VALID_OP,
      ZERO_SPENT,
      new Date("2026-10-22T20:59:59.999Z"),
    );
    expect(beforeIssue.ok).toBe(false);
    expect(beforeIssue.reasons).toEqual(["not_yet_issued"]);

    const atIssue = checkOperation(
      example,
      VALID_OP,
      ZERO_SPENT,
      new Date(example.issuedAt),
    );
    expect(atIssue).toEqual({ ok: true, reasons: [] });
  });

  it("rejects actions that are not allowed or explicitly denied", () => {
    const notAllowed = checkOperation(
      example,
      { ...VALID_OP, action: "stake" },
      ZERO_SPENT,
      NOW,
    );
    expect(notAllowed.ok).toBe(false);
    expect(notAllowed.reasons).toEqual(["action_not_allowed"]);

    const denied = checkOperation(
      example,
      { ...VALID_OP, action: "withdraw" },
      ZERO_SPENT,
      NOW,
    );
    expect(denied.ok).toBe(false);
    expect(denied.reasons).toContain("action_denied");
    expect(denied.reasons).toContain("action_not_allowed");
  });

  it("rejects an asset outside allowedAssets", () => {
    const result = checkOperation(
      example,
      { ...VALID_OP, asset: "DAI" },
      ZERO_SPENT,
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(["asset_not_allowed"]);
  });
});

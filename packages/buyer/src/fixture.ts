/** Example HTTP 402 challenge header / body used in dry-run demos. */
export const FIXTURE_402_HEADER = "X-PAYMENT-REQUIRED";

export const FIXTURE_402_BODY = {
  x402Version: 2,
  accepts: [
    {
      scheme: "exact",
      network: "eip155:84532",
      maxAmountRequired: "1000",
      asset: "USDC",
      payTo: "0xFd576f2fEf750E202ad8DbDfEcEF088f9AA7A30F",
      resource: "https://ar-agent-fx.mswitach.workers.dev/v1/fx/usd/blue",
      description: "Cotizacion USD/ARS blue",
    },
  ],
} as const;

export function encodePaymentRequiredHeader(
  body: unknown = FIXTURE_402_BODY,
): string {
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
}

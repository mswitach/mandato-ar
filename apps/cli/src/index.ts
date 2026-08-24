#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSignedMandate,
  type IntentMandate,
} from "@mandato-ar/mandate";
import { HttpX402Adapter, payAndFetch } from "@mandato-ar/buyer";
import { defaultAllowlist, resolveAsk } from "./presets.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../../.env") });
loadEnv();

function usage(): never {
  console.log(`Usage:
  mandato ask "<question>" [--live]

Demo presets:
  - FX blue / dolar blue
  - BCRA CUIT 30500010912
  - legal / monotributo

Env: see .env.example (BUYER_DRY_RUN=true by default)
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const live = argv.includes("--live");
  const filtered = argv.filter((a) => a !== "--live" && a !== "--");
  const cmd = filtered[0];
  const question = filtered.slice(1).join(" ").trim();
  return { live, cmd, question };
}

function buildMandate(): { mandate: IntentMandate; secret: string } {
  const secret = process.env.MANDATE_HMAC_SECRET ?? "change-me-demo-only";
  const base =
    process.env.X402_RESOURCE_BASE ?? "https://ar-agent-fx.mswitach.workers.dev";
  const network = process.env.X402_NETWORK ?? "eip155:84532";
  const mandate = createSignedMandate(
    {
      principal: process.env.MANDATE_PRINCIPAL ?? "did:example:marcelo",
      budgetUsdc: process.env.MANDATE_BUDGET_USDC ?? "0.05",
      expiresAt:
        process.env.MANDATE_EXPIRES_AT ?? "2026-12-31T23:59:59.000Z",
      allowlist: defaultAllowlist(base),
      network,
      resourceBase: base,
    },
    { mode: "hmac", secret },
  );
  return { mandate, secret };
}

async function ask(question: string, live: boolean) {
  const resolved = resolveAsk(question);
  const { mandate, secret } = buildMandate();
  const dryRun = !live && (process.env.BUYER_DRY_RUN ?? "true") !== "false";
  const adapter = new HttpX402Adapter({
    dryRun,
    facilitatorUrl:
      process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    privateKey: process.env.BUYER_PRIVATE_KEY,
  });

  console.log(`\n▶ ask: ${question}`);
  console.log(`  preset: ${resolved.label}`);
  console.log(`  url:    ${resolved.url}`);
  console.log(`  mode:   ${dryRun || !live ? "dry-run (simulate402)" : "live HTTP"}`);
  console.log("");

  const result = await payAndFetch({
    mandate,
    verifier: { mode: "hmac", secret },
    adapter,
    url: resolved.url,
    simulate402: dryRun || !live,
    priceUsdcHint: resolved.priceUsdc,
  });

  console.log("Timeline:");
  for (const step of result.timeline) {
    console.log(`  • ${step}`);
  }
  console.log("");
  console.log(
    `Result: status=${result.status} paid=${result.paid} amount=${result.amountUsdc ?? "-"} dryRun=${result.dryRun}`,
  );
  console.log(JSON.stringify(result.body, null, 2));
}

async function main() {
  const argv = process.argv.slice(2);
  const { live, cmd, question } = parseArgs(argv);
  if (cmd !== "ask" || !question) usage();
  await ask(question, live);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});

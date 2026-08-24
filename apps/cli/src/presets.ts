import { DEMO_PRESETS } from "@mandato-ar/mandate";

const BASE =
  process.env.X402_RESOURCE_BASE ?? "https://ar-agent-fx.mswitach.workers.dev";

export interface ResolvedAsk {
  url: string;
  priceUsdc: string;
  label: string;
}

/** Map natural-language / shorthand asks to demo endpoints. */
export function resolveAsk(question: string): ResolvedAsk {
  const q = question.trim().toLowerCase();

  if (
    /blue|d[oó]lar\s*blue|fx\s*blue|cotizaci[oó]n/.test(q) ||
    q === "fx" ||
    q.includes("usd/blue")
  ) {
    return {
      url: `${BASE}${DEMO_PRESETS.fxBlue.path}`,
      priceUsdc: DEMO_PRESETS.fxBlue.priceUsdc,
      label: DEMO_PRESETS.fxBlue.label,
    };
  }

  if (/bcra|deudor|30500010912|cuit/.test(q)) {
    return {
      url: `${BASE}${DEMO_PRESETS.bcraCuit.path}`,
      priceUsdc: DEMO_PRESETS.bcraCuit.priceUsdc,
      label: DEMO_PRESETS.bcraCuit.label,
    };
  }

  if (/monotributo|legal|infoleg|norma/.test(q)) {
    return {
      url: `${BASE}${DEMO_PRESETS.legalMonotributo.path}`,
      priceUsdc: DEMO_PRESETS.legalMonotributo.priceUsdc,
      label: DEMO_PRESETS.legalMonotributo.label,
    };
  }

  return {
    url: `${BASE}${DEMO_PRESETS.fxBlue.path}`,
    priceUsdc: DEMO_PRESETS.fxBlue.priceUsdc,
    label: `${DEMO_PRESETS.fxBlue.label} (default for: ${question.slice(0, 40)})`,
  };
}

export function defaultAllowlist(base = BASE): string[] {
  return [`${base}/v1/fx/*`, `${base}/v1/bcra/*`, `${base}/v1/legal/*`];
}

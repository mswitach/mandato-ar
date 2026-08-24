import { useMemo, useState } from "react";
import {
  DEMO_PRESETS,
  createSignedMandate,
  type IntentMandate,
} from "@mandato-ar/mandate";
import {
  HttpX402Adapter,
  payAndFetch,
  type PayAndFetchResult,
} from "@mandato-ar/buyer";

const BASE = "https://ar-agent-fx.mswitach.workers.dev";
const DEFAULT_ALLOWLIST = [
  `${BASE}/v1/fx/*`,
  `${BASE}/v1/bcra/*`,
  `${BASE}/v1/legal/*`,
];

type PresetKey = keyof typeof DEMO_PRESETS;

interface FormState {
  principal: string;
  budgetUsdc: string;
  expiresAt: string;
  hmacSecret: string;
  question: string;
  preset: PresetKey;
}

const initial: FormState = {
  principal: "did:example:marcelo",
  budgetUsdc: "0.05",
  expiresAt: "2026-12-31T23:59:59.000Z",
  hmacSecret: "change-me-demo-only",
  question: "dolar blue",
  preset: "fxBlue",
};

export function App() {
  const [form, setForm] = useState<FormState>(initial);
  const [mandate, setMandate] = useState<IntentMandate | null>(null);
  const [result, setResult] = useState<PayAndFetchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = DEMO_PRESETS[form.preset];
  const targetUrl = useMemo(() => `${BASE}${selected.path}`, [selected]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function signMandateLocal() {
    setError(null);
    try {
      const m = createSignedMandate(
        {
          principal: form.principal,
          budgetUsdc: form.budgetUsdc,
          expiresAt: form.expiresAt,
          allowlist: DEFAULT_ALLOWLIST,
          network: "eip155:84532",
          resourceBase: BASE,
        },
        { mode: "hmac", secret: form.hmacSecret },
      );
      setMandate(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runAsk() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const m =
        mandate ??
        createSignedMandate(
          {
            principal: form.principal,
            budgetUsdc: form.budgetUsdc,
            expiresAt: form.expiresAt,
            allowlist: DEFAULT_ALLOWLIST,
            network: "eip155:84532",
            resourceBase: BASE,
          },
          { mode: "hmac", secret: form.hmacSecret },
        );
      if (!mandate) setMandate(m);

      const out = await payAndFetch({
        mandate: m,
        verifier: { mode: "hmac", secret: form.hmacSecret },
        adapter: new HttpX402Adapter({ dryRun: true }),
        url: targetUrl,
        simulate402: true,
        priceUsdcHint: selected.priceUsdc,
      });
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Mandato AR</h1>
      <p className="sub">
        Intent Mandate firmado → allowlist + presupuesto → x402 dry-run contra{" "}
        <a href={BASE} target="_blank" rel="noreferrer">
          ar-agent-fx
        </a>{" "}
        (Base Sepolia).
      </p>

      <div className="grid two">
        <section className="card">
          <h2>Mandate</h2>
          <div className="row cols-2">
            <div>
              <label>Principal</label>
              <input
                value={form.principal}
                onChange={(e) => update("principal", e.target.value)}
              />
            </div>
            <div>
              <label>Budget USDC</label>
              <input
                value={form.budgetUsdc}
                onChange={(e) => update("budgetUsdc", e.target.value)}
              />
            </div>
          </div>
          <div className="row cols-2">
            <div>
              <label>Expires at</label>
              <input
                value={form.expiresAt}
                onChange={(e) => update("expiresAt", e.target.value)}
              />
            </div>
            <div>
              <label>HMAC secret (demo)</label>
              <input
                value={form.hmacSecret}
                onChange={(e) => update("hmacSecret", e.target.value)}
              />
            </div>
          </div>
          <p className="mono" style={{ color: "var(--muted)" }}>
            network: eip155:84532 · resourceBase: {BASE}
          </p>
          <div className="actions">
            <button type="button" onClick={signMandateLocal}>
              Firmar mandate
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setMandate(null)}
            >
              Limpiar
            </button>
          </div>
          {mandate && (
            <pre style={{ marginTop: "0.85rem" }}>
              {JSON.stringify(mandate, null, 2)}
            </pre>
          )}
        </section>

        <section className="card">
          <h2>Ask</h2>
          <div className="presets">
            {(Object.keys(DEMO_PRESETS) as PresetKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  update("preset", key);
                  update("question", DEMO_PRESETS[key].label);
                }}
              >
                {DEMO_PRESETS[key].label}
              </button>
            ))}
          </div>
          <div className="row">
            <div>
              <label>Pregunta</label>
              <textarea
                value={form.question}
                onChange={(e) => update("question", e.target.value)}
              />
            </div>
          </div>
          <p className="mono">
            → {targetUrl}
            <br />
            precio demo: {selected.priceUsdc} USDC
          </p>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => void runAsk()}>
              {busy ? "Pagando…" : "Ask (dry-run)"}
            </button>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Timeline</h2>
        {error && <p style={{ color: "var(--warn)" }}>{error}</p>}
        {!result && !error && (
          <p style={{ color: "var(--muted)" }}>Sin corridas todavía.</p>
        )}
        {result && (
          <>
            <p>
              <span className={`badge ${result.ok ? "ok" : "warn"}`}>
                status {result.status}
              </span>
              <span className="badge">{result.paid ? "paid" : "unpaid"}</span>
              <span className="badge warn">dry-run</span>
              {result.amountUsdc && (
                <span className="badge">{result.amountUsdc} USDC</span>
              )}
            </p>
            <ul className="timeline">
              {result.timeline.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <h3>Respuesta</h3>
            <pre>{JSON.stringify(result.body, null, 2)}</pre>
          </>
        )}
      </section>

      <footer>
        Discovery:{" "}
        <a href={`${BASE}/.well-known/x402.json`} target="_blank" rel="noreferrer">
          /.well-known/x402.json
        </a>{" "}
        · Facilitator:{" "}
        <a href="https://x402.org/facilitator" target="_blank" rel="noreferrer">
          x402.org
        </a>{" "}
        · MIT © 2026 Marcelo Switach
      </footer>
    </main>
  );
}

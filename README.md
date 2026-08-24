# Mandato AR

**ES** · Agente demo con *Intent Mandate* firmado (presupuesto + allowlist) que responde preguntas de datos de Argentina pagando [ar-agent-fx](https://ar-agent-fx.mswitach.workers.dev) via **x402** en **Base Sepolia** (`eip155:84532`).

**EN** · Public demo: an agent with a signed Intent Mandate (budget + allowlist) answers Argentina-data questions by paying ar-agent-fx via x402 on Base Sepolia.

## Que es / What it is

- Un **mandate v0** firmado (HMAC o ed25519) que limita que URLs puede llamar el buyer y cuanto USDC puede gastar.
- Un **buyer** que hace `payAndFetch` contra endpoints x402 (stub HTTP + fixture 402).
- Un **CLI** (`mandato ask`) y una **web** minima (Vite + React) para demo.

## Que no es / What it is not

- No es un wallet custodio ni un exchange.
- No reconstruye ar-agent-fx: **consume** la API live.
- No incluye claves privadas reales; el modo live requiere tu propia key en `.env` (nunca en git).
- El pago on-chain real via facilitator es un stub/adapter: el MVP demuestra el flujo mandate → allowlist → 402 → respuesta.

## API live (consume)

| Recurso | URL |
|--------|-----|
| Base | https://ar-agent-fx.mswitach.workers.dev |
| Discovery | https://ar-agent-fx.mswitach.workers.dev/.well-known/x402.json |
| Facilitator | https://x402.org/facilitator |
| Network | `eip155:84532` (Base Sepolia) |

Presets demo: FX blue · BCRA CUIT `30500010912` · legal search `monotributo`.

## Layout

```
mandato-ar/
  packages/mandate/   # schema zod, create/sign/verify, allowlist, budget
  packages/buyer/     # payAndFetch, PaymentAdapter, HttpX402Adapter
  apps/cli/           # mandato ask "..." [--live]
  apps/web/           # Vite+React one-pager
```

## Requisitos

- Node 20+
- pnpm 9+

```bash
corepack enable
pnpm install
pnpm --filter @mandato-ar/mandate test
pnpm ask -- "dolar blue"          # dry-run (default)
pnpm ask -- --live "dolar blue"   # requiere BUYER_PRIVATE_KEY + USDC Sepolia
pnpm dev:web
```

Copia `.env.example` → `.env` y ajusta secretos **solo en local**.

## Mandate v0

```json
{
  "version": "0.1.0",
  "principal": "did:example:marcelo",
  "budgetUsdc": "0.05",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "allowlist": [
    "https://ar-agent-fx.mswitach.workers.dev/v1/fx/*",
    "https://ar-agent-fx.mswitach.workers.dev/v1/bcra/*",
    "https://ar-agent-fx.mswitach.workers.dev/v1/legal/*"
  ],
  "network": "eip155:84532",
  "resourceBase": "https://ar-agent-fx.mswitach.workers.dev",
  "nonce": "...",
  "signature": "..."
}
```

Firma: payload canonico JSON sin `signature`; HMAC-SHA256 (demo) o ed25519 (hex keys via @noble). Ver `packages/mandate`.

## Licencia

MIT (c) 2026 Marcelo Switach

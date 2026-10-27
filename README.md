# Mandato AR

**ES** · Agente demo con *Intent Mandate* firmado (presupuesto + allowlist) que responde preguntas de datos de Argentina pagando [ar-agent-fx](https://ar-agent-fx.mswitach.workers.dev) via **x402 Exact EVM** en **Base Sepolia** (`eip155:84532`).

**EN** · Public demo: an agent with a signed Intent Mandate (budget + allowlist) answers Argentina-data questions by paying ar-agent-fx via x402 Exact EVM on Base Sepolia.

> **Testnet only · unaudited · not for real funds.** Settlement is wired for **Base Sepolia** (`eip155:84532`) only. Do not point this buyer at mainnet, do not load production keys, and do not send real USDC. The code is a public demo and has **not** been audited.
>
> **El cap es por pago, no acumulativo.** `budgetUsdc` (v0) y el chequeo del buyer comparan **cada** 402 contra el tope de esa operación. El buyer **no** lleva un running total diario ni de spend acumulado. `maxPerDayUsdc` existe en el schema v0.2 / `checkOperation`, pero el caller tiene que pasar `spentTodayUsdc`; el buyer no lo trackea.

## Que es / What it is

- Un **mandate v0** firmado (HMAC o ed25519) que limita que URLs puede llamar el buyer y cuanto USDC puede gastar **por pago**.
- Un **buyer** que hace `payAndFetch` contra endpoints x402: dry-run con fixture 402 (CI, sin secretos) o settle live **x402 Exact EVM** (EIP-3009) en Base Sepolia via el facilitator.
- Un **CLI** (`mandato ask`) y una **web** minima (Vite + React) para demo.

## Que no es / What it is not

- No es un wallet custodio ni un exchange.
- No reconstruye ar-agent-fx: **consume** la API live.
- No incluye claves privadas reales; el modo live requiere tu propia key **de testnet** en `.env` (nunca en git, nunca mainnet).
- **No es un stub de pago.** El adapter live firma Exact EVM y liquida on-chain en Base Sepolia. Sigue siendo demo: testnet, unaudited, sin tracking acumulado de spend.
- No es un presupuesto diario/total automatico: el tope del buyer es **per payment**.

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
  packages/buyer/     # payAndFetch, PaymentAdapter, HttpX402Adapter (x402 v2 Exact EVM)
  apps/cli/           # mandato ask "..." [--live]
  apps/web/           # Vite+React one-pager
```

### Tecnología

- **x402 v2**: protocolo HTTP 402 Payment Required con header `PAYMENT-REQUIRED` (base64url JSON)
- **Exact EVM**: esquema de pago con EIP-3009 `transferWithAuthorization` (gasless)
- **@x402/evm** + **@x402/core**: SDKs oficiales de x402 para firma y verificación
- **viem**: cliente Ethereum para creación de cuentas y firma EIP-712
- Dry-run mantiene fixtures para CI/CD sin secretos; `--live` usa settle real en Base Sepolia

## Requisitos

- Node 20+
- pnpm 9+

```bash
corepack enable
pnpm install
pnpm test                         # todos los tests (sin secretos)
pnpm ask -- "dolar blue"          # dry-run (default, sin red)
pnpm dev:web                      # web UI demo
```

### Modo live (pagos de testnet en Base Sepolia)

**Solo testnet. Unaudited. No uses fondos reales.**

1. Obtén tokens de **Base Sepolia** (no mainnet):
   - **ETH Sepolia** (para gas si es necesario): [Coinbase Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet)
   - **USDC Sepolia** (para pagos): bridge desde Sepolia con [Superbridge](https://testnets.superbridge.app/base-sepolia) o faucet de Circle
   
2. Copia `.env.example` → `.env` y ajusta:
   ```bash
   BUYER_PRIVATE_KEY=0x...  # wallet throwaway de testnet (nunca claves de producción / mainnet)
   BUYER_DRY_RUN=false
   ```

3. Ejecuta con `--live`:
   ```bash
   pnpm ask -- --live "dolar blue"
   ```

El pago usa **EIP-3009** (transferencia gasless de USDC) via x402 Exact EVM. El facilitador paga el gas; tu wallet solo firma la autorización. La transacción se liquida on-chain en Base Sepolia (USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`).

El buyer chequea el cap **contra el `amount` real del 402** (micros USDC del `accepts[]` seleccionado), no contra el `priceUsdcHint` del CLI. El hint es solo una estimación pre-flight. Si el 402 pide más que el cap del mandate — o más que el hint — se rechaza **antes de firmar**. Ese cap es **por pago**: no hay acumulador diario/total en el buyer.

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

`budgetUsdc` es el tope **por pago** (el buyer no suma gastos previos). Firma: payload canonico JSON sin `signature`; HMAC-SHA256 (demo) o ed25519 (hex keys via @noble). Ver `packages/mandate`.

## Mandate v0.2

Módulo **aditivo** (no reemplaza v0.1): schema, canonicalización, firma ed25519 y `checkOperation` en `packages/mandate`. Ejemplo canónico: [`packages/mandate/examples/ash-example-mandate.json`](packages/mandate/examples/ash-example-mandate.json).

`version` acepta `"0.2.0"` y `"0.2.0-draft"` (el ejemplo usa el draft).

El buyer de este repo **sigue en v0.1** (`budgetUsdc` per payment). v0.2 documenta limits diarios y scope, pero **nadie en el buyer acumula spend**. No uses el ejemplo v0.2 como si el agente ya respetara un presupuesto diario en runtime.

Misma advertencia que el resto del repo: **solo Base Sepolia / testnet, unaudited, no para fondos reales.** El ejemplo es demo.

### Campos

| Campo | Contenido |
|--------|-----------|
| `kind` | `intent-mandate` |
| `example` | flag opcional (el ejemplo es `true`) |
| `principal` | `{ id, role, display? }` |
| `agent` | `{ id, handle?, role }` |
| `network` | p.ej. `eip155:84532` (Base Sepolia) |
| `scope` | `allowedAssets[]`, `allowedActions[]`, `deniedActions[]`, `approvalMode` |
| `limits` | `currency`, `maxPerOperationUsdc` (per payment), `maxPerDayUsdc` (solo si el caller pasa `spentTodayUsdc`; el buyer no lo trackea), `dayBoundary`, `aboveLimit` |
| `issuedAt` / `expiresAt` | ISO-8601 |
| `authorizedBy` | id del principal |
| `disputeLiability` | `{ withinMandate, outsideMandate, note? }` |
| `receipt` | `{ required, chain, format, status?, txHash? }` |
| `nonce` / `signature` | nonce + `ed25519:<hex>` |

### Canonicalización y firma

JSON con **claves ordenadas recursivamente**, sin el campo `signature`. La firma es ed25519 sobre esos bytes UTF-8 (keys hex crudas de 32 bytes via `@noble`, prefijo `ed25519:`). El ejemplo se firmó con `node:crypto` ed25519; `verifyMandateV2` debe aceptar esa firma.

La **llave pública del ejemplo es demo y descartable**. No es una llave real de Marce ni de ningún principal. No usarla en producción.

### disputeLiability (PROPUESTA)

`disputeLiability` es una **PROPUESTA** pendiente de validación con la contraparte (principal y operador del agente). No es un acuerdo ejecutado.

### Receipt pendiente

El `receipt` del **ejemplo** está **pendiente**: ese JSON no incluye un `txHash` de una corrida autorizada. `status` lo dice explícitamente. El buyer *sí* puede liquidar x402 Exact EVM en Base Sepolia cuando corre `--live` con una key de testnet; eso no “completa” ni firma el ejemplo. No correr pagos live/mainnet para rellenar este fixture.

`checkOperation(mandate, { asset, action, amountUsdc }, { spentTodayUsdc }, now)` rechaza: no vigente / vencido, action no permitida o en `deniedActions`, asset no permitido, monto > `maxPerOperationUsdc`, o `spentToday + amount` > `maxPerDayUsdc` (USDC via `parseUsdc`/`formatUsdc`, sin floats). **El buyer no llama `checkOperation` ni mantiene `spentTodayUsdc`.** El tope que aplica hoy en `payAndFetch` es el `budgetUsdc` v0 **por cada 402**, no un acumulado diario.

## Licencia

MIT (c) 2026 Marcelo Switach

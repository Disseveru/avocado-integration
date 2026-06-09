# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **single Node.js/TypeScript CLI** (`scripts/avocadoArbitrage.ts`) that signs Avocado Safe spells for a Base USDC flash-loan arbitrage flow. There is no web server, database, or Docker stack.

### Prerequisites

- **Node.js 18+** (Node 22 works in Cloud Agent VMs)
- **npm** (`package-lock.json` is the source of truth)
- **Secrets** (injected in Cloud Agent VMs or via local `.env`):
  - `AVOCADO_OWNER_PRIVATE_KEY` — hex private key (with or without `0x` prefix)
  - `BASE_RPC_URL` — Base mainnet JSON-RPC URL (must start with `https://`, no leading `=`)

Copy `.env.example` to `.env` when developing locally.

### Install

```bash
npm install
```

### Lint / typecheck / run

| Task | Command |
|------|---------|
| Typecheck | `npm run typecheck` |
| Dry-run arbitrage script (sign only) | `npm run avocado:arbitrage` |
| Broadcast on-chain | `BROADCAST_AVOCADO_TX=true npm run avocado:arbitrage` |

There is no ESLint config or dedicated lint script in this repo.

### RPC / network gotchas

The Avocado SDK resolves the Safe address via **Polygon (chain 137)** using its default RPC (`https://polygon-rpc.com`). That endpoint may return `403` from some cloud/datacenter IPs. If `npm run avocado:arbitrage` fails with `could not detect network`, preload alternate RPC URLs before the script runs:

```bash
export BASE_RPC_URL="${BASE_RPC_URL#=}"   # strip accidental leading '=' from injected secrets
NODE_OPTIONS="--import ./.cursor/avocado-rpc-preload.mjs" npm run avocado:arbitrage
```

The preload file (`.cursor/avocado-rpc-preload.mjs`) overrides Polygon and Base RPC URLs via `setRpcUrls` without changing application code.

### External services (not started locally)

- Avocado Network RPC: `https://rpc.avocado.instadapp.io` (chain 634)
- Base mainnet RPC: from `BASE_RPC_URL`
- Polygon RPC: required indirectly by `@instadapp/avocado` for Safe address derivation
- Instadapp Avocado relayer: used only when `BROADCAST_AVOCADO_TX=true`

Default mode is **dry run** — it signs and logs the EIP-712 payload without broadcasting.

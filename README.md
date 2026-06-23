# vibatest — Solana presale program

An [Anchor](https://www.anchor-lang.com/) program for a SOL presale: **anyone can deposit**, but **only a single, immutable authority wallet can withdraw**. Ships with a zero-build single-page dApp for connecting a wallet and depositing.

**🌐 Live dApp:** https://app-alpha-nine-65.vercel.app (currently pointed at devnet)

## How it works

| Instruction | Caller | Effect |
|---|---|---|
| `initialize(authority)` | deployer (once) | Stores the sole withdrawal wallet (immutable — no setter) |
| `deposit(amount)` | anyone | Transfers SOL into the vault PDA |
| `withdraw(amount)` | authority only | Moves SOL from the vault to the authority |

Withdrawals are guarded by both `has_one = authority` and a `Signer` constraint, so only the wallet recorded at init can ever move funds. Deposited SOL lives in a system-owned `vault` PDA; the program signs vault transfers via `invoke_signed`.

- **Program account (PDA `["presale"]`)** — stores `authority`, `total_deposited`, bumps.
- **Vault (PDA `["vault"]`)** — system-owned account that holds the SOL.

## Layout

```
programs/vibatest/src/lib.rs   the program
tests/vibatest.ts              tests (deposit, authorized + rejected withdraw)
scripts/initialize.ts          sets the withdrawal authority (run once after deploy)
app/index.html                 connect-wallet + deposit dApp (no build step)
```

## Build & test

```bash
anchor build
anchor test          # spins up a local validator and runs the suite
```

## Deploy

```bash
anchor deploy --provider.cluster <rpc-url>
npx ts-node scripts/initialize.ts          # ANCHOR_PROVIDER_URL / ANCHOR_WALLET env
```

To deploy with reduced rent (no upgrade headroom):

```bash
solana program deploy target/deploy/vibatest.so \
  --program-id target/deploy/vibatest-keypair.json \
  --max-len <program-size + headroom> -u <rpc-url>
```

## Run the dApp

```bash
cd app && python3 -m http.server 5173   # http://localhost:5173
```

Set the `RPC_URL` / `CLUSTER` constants in `app/index.html` for your target network.

## Toolchain note

The bundled Solana platform-tools (Rust 1.79) can't parse newer `edition2024` crates. The committed `Cargo.lock` + `.cargo/config.toml` (MSRV-aware resolver) and `rust-version = "1.79"` pin the dependency graph to a buildable set. Keep the lockfile committed.

## ⚠️ Disclaimer

Unaudited. The authority is immutable and there is no refund path. Review and audit before handling real funds on mainnet.

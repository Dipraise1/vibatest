/**
 * One-time initialization of the vibatest presale.
 *
 * Sets the SINGLE withdrawal authority. After this runs, only the wallet
 * below can ever withdraw deposited SOL.
 *
 * Usage:
 *   anchor run init            (uses Anchor.toml [scripts] entry)
 *   or: npx ts-node scripts/initialize.ts
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Vibatest } from "../target/types/vibatest";
import { PublicKey } from "@solana/web3.js";

// >>> The one and only wallet permitted to withdraw <<<
const WITHDRAW_AUTHORITY = new PublicKey(
  "4TmEKYig8gDy6mM39fSgYBgRgHvnDZSwBpRL7s7rUDRc"
);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.vibatest as Program<Vibatest>;

  const [presale] = PublicKey.findProgramAddressSync(
    [Buffer.from("presale")],
    program.programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId
  );

  console.log("Program:   ", program.programId.toBase58());
  console.log("Presale PDA:", presale.toBase58());
  console.log("Vault PDA:  ", vault.toBase58());
  console.log("Authority:  ", WITHDRAW_AUTHORITY.toBase58());

  const tx = await program.methods
    .initialize(WITHDRAW_AUTHORITY)
    .accounts({ payer: provider.wallet.publicKey })
    .rpc();

  console.log("Initialized. Tx:", tx);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);

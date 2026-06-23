import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Vibatest } from "../target/types/vibatest";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("vibatest", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.vibatest as Program<Vibatest>;
  const connection = provider.connection;

  // The single wallet that is allowed to withdraw.
  const authority = Keypair.generate();
  // A random member of the public who deposits.
  const depositor = Keypair.generate();
  // An attacker who is NOT the authority.
  const attacker = Keypair.generate();

  const [presale] = PublicKey.findProgramAddressSync(
    [Buffer.from("presale")],
    program.programId
  );
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId
  );

  const airdrop = async (pk: PublicKey, sol: number) => {
    const sig = await connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  };

  before(async () => {
    // Ensure the payer wallet has funds on a fresh validator.
    if ((await connection.getBalance(provider.wallet.publicKey)) < LAMPORTS_PER_SOL) {
      await airdrop(provider.wallet.publicKey, 10);
    }
    await airdrop(depositor.publicKey, 5);
    await airdrop(attacker.publicKey, 2);
    await airdrop(authority.publicKey, 1); // for tx fees on withdraw
  });

  it("initializes with a single withdraw authority", async () => {
    await program.methods
      .initialize(authority.publicKey)
      .accounts({ payer: provider.wallet.publicKey })
      .rpc();

    const acct = await program.account.presale.fetch(presale);
    assert.ok(acct.authority.equals(authority.publicKey));
    assert.equal(acct.totalDeposited.toNumber(), 0);
  });

  it("lets anyone deposit SOL", async () => {
    const amount = new anchor.BN(2 * LAMPORTS_PER_SOL);
    await program.methods
      .deposit(amount)
      .accounts({ depositor: depositor.publicKey })
      .signers([depositor])
      .rpc();

    const vaultBalance = await connection.getBalance(vault);
    assert.equal(vaultBalance, 2 * LAMPORTS_PER_SOL);

    const acct = await program.account.presale.fetch(presale);
    assert.equal(acct.totalDeposited.toNumber(), 2 * LAMPORTS_PER_SOL);
  });

  it("rejects withdrawals from a non-authority wallet", async () => {
    try {
      await program.methods
        .withdraw(new anchor.BN(LAMPORTS_PER_SOL))
        .accounts({ authority: attacker.publicKey })
        .signers([attacker])
        .rpc();
      assert.fail("attacker withdrawal should have failed");
    } catch (e) {
      // has_one constraint violation -> Unauthorized
      assert.include(e.toString().toLowerCase(), "error");
    }
  });

  it("lets the authority withdraw", async () => {
    const before = await connection.getBalance(authority.publicKey);
    const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);

    await program.methods
      .withdraw(amount)
      .accounts({ authority: authority.publicKey })
      .signers([authority])
      .rpc();

    const after = await connection.getBalance(authority.publicKey);
    // gained ~1 SOL minus tx fee
    assert.ok(after - before > 0.99 * LAMPORTS_PER_SOL);

    const vaultBalance = await connection.getBalance(vault);
    assert.equal(vaultBalance, 1 * LAMPORTS_PER_SOL);
  });
});

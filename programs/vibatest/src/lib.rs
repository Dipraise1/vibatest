use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("7foDdocSByHdTZQ4zPogPDCEntvNL42K8xGK9vwEXG6u");

#[program]
pub mod vibatest {
    use super::*;

    /// One-time setup. `authority` is the ONLY wallet that will ever be
    /// allowed to withdraw. It is stored immutably (there is no setter).
    pub fn initialize(ctx: Context<Initialize>, authority: Pubkey) -> Result<()> {
        let presale = &mut ctx.accounts.presale;
        presale.authority = authority;
        presale.total_deposited = 0;
        presale.bump = ctx.bumps.presale;
        presale.vault_bump = ctx.bumps.vault;
        msg!("Presale initialized. Withdraw authority: {}", authority);
        Ok(())
    }

    /// Anyone with a wallet can deposit SOL into the presale vault.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, PresaleError::ZeroAmount);

        // Plain system-program transfer from the depositor into the vault PDA.
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.depositor.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            amount,
        )?;

        let presale = &mut ctx.accounts.presale;
        presale.total_deposited = presale
            .total_deposited
            .checked_add(amount)
            .ok_or(PresaleError::Overflow)?;

        msg!(
            "Deposit {} lamports from {}",
            amount,
            ctx.accounts.depositor.key()
        );
        Ok(())
    }

    /// Withdraw SOL from the vault to the authority wallet.
    /// `has_one = authority` + the Signer constraint guarantee that only the
    /// single wallet recorded at init can ever move funds out.
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, PresaleError::ZeroAmount);

        let available = ctx.accounts.vault.lamports();
        require!(amount <= available, PresaleError::InsufficientFunds);

        // The vault PDA "signs" for itself via its seeds.
        let vault_bump = ctx.accounts.presale.vault_bump;
        let seeds: &[&[u8]] = &[b"vault", std::slice::from_ref(&vault_bump)];
        let signer: &[&[&[u8]]] = &[seeds];

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.authority.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        msg!(
            "Withdraw {} lamports to authority {}",
            amount,
            ctx.accounts.authority.key()
        );
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Presale::INIT_SPACE,
        seeds = [b"presale"],
        bump
    )]
    pub presale: Account<'info, Presale>,

    /// System-owned PDA that holds the deposited SOL. No data, just lamports.
    #[account(
        seeds = [b"vault"],
        bump
    )]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut, seeds = [b"presale"], bump = presale.bump)]
    pub presale: Account<'info, Presale>,

    #[account(mut, seeds = [b"vault"], bump = presale.vault_bump)]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [b"presale"],
        bump = presale.bump,
        has_one = authority @ PresaleError::Unauthorized
    )]
    pub presale: Account<'info, Presale>,

    #[account(mut, seeds = [b"vault"], bump = presale.vault_bump)]
    pub vault: SystemAccount<'info>,

    /// Must be the exact wallet stored at init, and must sign.
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Presale {
    /// The only wallet permitted to withdraw.
    pub authority: Pubkey,
    /// Running total of all lamports ever deposited.
    pub total_deposited: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[error_code]
pub enum PresaleError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Vault does not have enough lamports")]
    InsufficientFunds,
    #[msg("Only the authority wallet may withdraw")]
    Unauthorized,
}

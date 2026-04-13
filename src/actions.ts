import { accountUpdate, nftHolding, tokenBalance, mintUpdate } from "./builders";
import { tokenAccountData } from "./spl";
import { SPL_TOKEN_PROGRAM } from "./pubkey";
import type { UpdateFactory } from "./types";

// ─── NFT actions ─────────────────────────────────────────────────────────────

export function mintedNFT(
  mint: string | Uint8Array,
  to:   string | Uint8Array,
  opts?: {
    tokenAccount?: string | Uint8Array;
    filters?:      string[];
  },
): UpdateFactory[] {
  return [
    mintUpdate(mint, { supply: 1n, decimals: 0, filters: opts?.filters }),
    nftHolding({ mint, holder: to, tokenAccount: opts?.tokenAccount, filters: opts?.filters }),
  ];
}

export function transferNFT(
  mint: string | Uint8Array,
  from: string | Uint8Array,
  to:   string | Uint8Array,
  opts?: {
    fromTokenAccount?: string | Uint8Array;
    toTokenAccount?:   string | Uint8Array;
    filters?:          string[];
  },
): UpdateFactory[] {
  return [
    // Sender's token account goes to zero
    accountUpdate(opts?.fromTokenAccount ?? from, 2_039_280, {
      owner:   SPL_TOKEN_PROGRAM,
      data:    tokenAccountData({ mint, holder: from, amount: 0n }),
      filters: opts?.filters,
    }),
    // Receiver holds the NFT
    nftHolding({ mint, holder: to, tokenAccount: opts?.toTokenAccount, filters: opts?.filters }),
  ];
}

export function burnNFT(
  mint: string | Uint8Array,
  from: string | Uint8Array,
  opts?: {
    tokenAccount?: string | Uint8Array;
    filters?:      string[];
  },
): UpdateFactory[] {
  return [
    accountUpdate(opts?.tokenAccount ?? from, 2_039_280, {
      owner:   SPL_TOKEN_PROGRAM,
      data:    tokenAccountData({ mint, holder: from, amount: 0n }),
      filters: opts?.filters,
    }),
    mintUpdate(mint, { supply: 0n, decimals: 0, filters: opts?.filters }),
  ];
}

// ─── SPL token actions ───────────────────────────────────────────────────────

export function mintedSPL(
  mint:   string | Uint8Array,
  to:     string | Uint8Array,
  amount: bigint,
  opts?: {
    decimals?:      number;
    tokenAccount?:  string | Uint8Array;
    totalSupply?:   bigint;  // defaults to amount
    filters?:       string[];
  },
): UpdateFactory[] {
  return [
    mintUpdate(mint, {
      supply:   opts?.totalSupply ?? amount,
      decimals: opts?.decimals ?? 6,
      filters:  opts?.filters,
    }),
    tokenBalance({
      mint,
      holder:       to,
      amount,
      tokenAccount: opts?.tokenAccount,
      filters:      opts?.filters,
    }),
  ];
}

export function transferSPL(
  mint:   string | Uint8Array,
  from:   string | Uint8Array,
  to:     string | Uint8Array,
  amount: bigint,
  opts?: {
    fromBalance?:      bigint;  // sender balance after transfer (default 0n — "send all")
    fromTokenAccount?: string | Uint8Array;
    toTokenAccount?:   string | Uint8Array;
    filters?:          string[];
  },
): UpdateFactory[] {
  return [
    tokenBalance({
      mint,
      holder:       from,
      amount:       opts?.fromBalance ?? 0n,
      tokenAccount: opts?.fromTokenAccount,
      filters:      opts?.filters,
    }),
    tokenBalance({
      mint,
      holder:       to,
      amount,
      tokenAccount: opts?.toTokenAccount,
      filters:      opts?.filters,
    }),
  ];
}

export function burnSPL(
  mint:   string | Uint8Array,
  from:   string | Uint8Array,
  amount: bigint,
  opts?: {
    remainingBalance?: bigint;  // sender balance after burn (default 0n)
    tokenAccount?:     string | Uint8Array;
    totalSupply?:      bigint;  // mint supply after burn
    decimals?:         number;
    filters?:          string[];
  },
): UpdateFactory[] {
  return [
    tokenBalance({
      mint,
      holder:       from,
      amount:       opts?.remainingBalance ?? 0n,
      tokenAccount: opts?.tokenAccount,
      filters:      opts?.filters,
    }),
    mintUpdate(mint, {
      supply:   opts?.totalSupply ?? 0n,
      decimals: opts?.decimals ?? 6,
      filters:  opts?.filters,
    }),
  ];
}

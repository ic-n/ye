import { AccountLayout, MintLayout } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { pubkeyBytes } from "./pubkey";

function pk(v: string | Uint8Array): PublicKey {
  return new PublicKey(pubkeyBytes(v));
}

const PK_ZERO = new PublicKey(new Uint8Array(32));

export interface TokenAccountOpts {
  mint:       string | Uint8Array;
  holder:     string | Uint8Array;  // "owner" in SPL layout
  amount?:    bigint;               // default 1n for NFTs
  delegate?:  string | Uint8Array;
  isFrozen?:  boolean;
  closeAuth?: string | Uint8Array;
}

export function tokenAccountData(opts: TokenAccountOpts): Uint8Array {
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode(
    {
      mint:                 pk(opts.mint),
      owner:                pk(opts.holder),
      amount:               opts.amount ?? 1n,
      delegateOption:       opts.delegate ? 1 : 0,
      delegate:             opts.delegate ? pk(opts.delegate) : PK_ZERO,
      state:                opts.isFrozen ? 2 : 1,  // 1=Initialized, 2=Frozen
      isNativeOption:       0,
      isNative:             0n,
      delegatedAmount:      0n,
      closeAuthorityOption: opts.closeAuth ? 1 : 0,
      closeAuthority:       opts.closeAuth ? pk(opts.closeAuth) : PK_ZERO,
    },
    data,
  );
  return data;
}

export interface MintOpts {
  decimals?:      number;         // 0 for NFTs
  supply?:        bigint;
  mintAuthority?: string | Uint8Array;
  freezeAuth?:    string | Uint8Array;
}

export function mintAccountData(opts: MintOpts = {}): Uint8Array {
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode(
    {
      mintAuthorityOption:   opts.mintAuthority ? 1 : 0,
      mintAuthority:         opts.mintAuthority ? pk(opts.mintAuthority) : PK_ZERO,
      supply:                opts.supply ?? 1n,
      decimals:              opts.decimals ?? 0,
      isInitialized:         true,
      freezeAuthorityOption: opts.freezeAuth ? 1 : 0,
      freezeAuthority:       opts.freezeAuth ? pk(opts.freezeAuth) : PK_ZERO,
    },
    data,
  );
  return data;
}

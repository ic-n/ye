import {
  SubscribeUpdate,
  SubscribeUpdateAccount,
  SubscribeUpdateAccountInfo,
  SubscribeUpdateSlot,
} from "@triton-one/yellowstone-grpc";
import { pubkeyBytes, SPL_TOKEN_PROGRAM, METAPLEX_PROGRAM } from "./pubkey";
import {
  tokenAccountData,
  mintAccountData,
  TokenAccountOpts,
  MintOpts,
} from "./spl";
import { metadataAccountData, MetadataOpts } from "./metaplex";
import type { UpdateFactory } from "./types";

// Mirrors the protobuf SlotStatus enum — values are stable and spec-defined.
export enum SlotStatus {
  SLOT_PROCESSED            = 0,
  SLOT_CONFIRMED            = 1,
  SLOT_FINALIZED            = 2,
  SLOT_FIRST_SHRED_RECEIVED = 3,
  SLOT_COMPLETED            = 4,
  SLOT_CREATED_BANK         = 5,
  SLOT_DEAD                 = 6,
}

// ─── Low-level ───────────────────────────────────────────────────────────────

export function accountUpdate(
  pubkey: string | Uint8Array,
  lamports: number | string = 0,
  opts: {
    owner?: string | Uint8Array;
    data?: Uint8Array;
    filters?: string[];
    isStartup?: boolean;
  } = {}
): UpdateFactory {
  return (slot) =>
    SubscribeUpdate.create({
      filters: opts.filters ?? [],
      account: SubscribeUpdateAccount.create({
        account: SubscribeUpdateAccountInfo.create({
          pubkey: pubkeyBytes(pubkey),
          lamports: String(lamports),
          owner: opts.owner ? pubkeyBytes(opts.owner) : new Uint8Array(32),
          executable: false,
          rentEpoch: "0",
          data: opts.data ?? new Uint8Array(),
          writeVersion: "1",
        }),
        slot,
        isStartup: opts.isStartup ?? false,
      }),
      createdAt: new Date(),
    });
}

// ─── SPL helpers ─────────────────────────────────────────────────────────────

export function nftHolding(opts: {
  holder: string | Uint8Array;
  mint: string | Uint8Array;
  tokenAccount?: string | Uint8Array;
  delegate?: string | Uint8Array;
  isFrozen?: boolean;
  filters?: string[];
}): UpdateFactory {
  const taPubkey = opts.tokenAccount ?? opts.mint;
  return accountUpdate(taPubkey, 2_039_280, {
    owner: SPL_TOKEN_PROGRAM,
    data: tokenAccountData({
      mint: opts.mint,
      holder: opts.holder,
      amount: 1n,
      delegate: opts.delegate,
      isFrozen: opts.isFrozen,
    }),
    filters: opts.filters,
  });
}

export function tokenBalance(opts: {
  holder: string | Uint8Array;
  mint: string | Uint8Array;
  amount: bigint;
  tokenAccount?: string | Uint8Array;
  filters?: string[];
}): UpdateFactory {
  const taPubkey = opts.tokenAccount ?? opts.mint;
  return accountUpdate(taPubkey, 2_039_280, {
    owner: SPL_TOKEN_PROGRAM,
    data: tokenAccountData({
      mint: opts.mint,
      holder: opts.holder,
      amount: opts.amount,
    }),
    filters: opts.filters,
  });
}

export function mintUpdate(
  mint: string | Uint8Array,
  opts: MintOpts & { filters?: string[] } = {}
): UpdateFactory {
  return accountUpdate(mint, 1_461_600, {
    owner: SPL_TOKEN_PROGRAM,
    data: mintAccountData(opts),
    filters: opts.filters,
  });
}

// ─── Metaplex ────────────────────────────────────────────────────────────────

export function nftMetadata(
  metadataAddress: string | Uint8Array,
  opts: MetadataOpts,
  filters?: string[]
): UpdateFactory {
  return accountUpdate(metadataAddress, 5_616_720, {
    owner: METAPLEX_PROGRAM,
    data: metadataAccountData(opts),
    filters,
  });
}

// ─── Slot ─────────────────────────────────────────────────────────────────────

export function slotUpdate(
  opts: {
    status?: SlotStatus;
    parent?: string;
    filters?: string[];
  } = {}
): UpdateFactory {
  return (slot) =>
    SubscribeUpdate.create({
      filters: opts.filters ?? [],
      slot: SubscribeUpdateSlot.create({
        slot,
        parent: opts.parent,
        status: opts.status ?? SlotStatus.SLOT_PROCESSED,
      }),
      createdAt: new Date(),
    });
}

// Re-export layout types for use in actions.ts
export type { TokenAccountOpts, MintOpts };

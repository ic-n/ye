# yellowstone-grpc-mock

A Jest-compatible mock for `@triton-one/yellowstone-grpc` that emits **real serialized on-chain data** so tests exercise the full parse pipeline — not just app logic after parsing.

---

## Why

Pure domain-level mocks miss deserialization edge cases (self-transfer, zero-amount mint, burned token). This mock serializes real SPL token account layouts and Metaplex metadata layouts so the indexer under test receives bytes identical to what Yellowstone would stream from mainnet.

---

## Package structure

```
src/
  types.ts      — QueueItem, UpdateFactory
  pubkey.ts     — pubkeyBytes(), well-known program address constants
  spl.ts        — tokenAccountData(), mintAccountData() via @solana/spl-token layouts
  metaplex.ts   — metadataAccountData() via @metaplex-foundation/mpl-token-metadata
  builders.ts   — low-level: accountUpdate(), nftHolding(), tokenBalance(), slotUpdate(), nftMetadata()
  actions.ts    — high-level: mintedNFT(), transferNFT(), burnNFT(), mintedSPL(), transferSPL(), burnSPL()
  stream.ts     — MockClientDuplexStream extends Duplex (readableObjectMode)
  mock.ts       — YellowStoneMock class + active mock registry
  client.ts     — MockClient (full Client interface stub)
  index.ts      — barrel export
```

---

## API

### YellowStoneMock

```ts
import { YellowStoneMock } from "yellowstone-grpc-mock";
import { mintedNFT, transferNFT, transferSPL, slotUpdate } from "yellowstone-grpc-mock/actions";

const ysm = new YellowStoneMock();

ysm
  .push(mintedNFT(MINT, WALLET1))
  .push(transferNFT(MINT, WALLET1, WALLET2))
  .push(transferSPL(COIN, WALLET2, WALLET1, 500_000n, { fromBalance: 500_000n }))
  .push(slotUpdate())
  .end();
```

`push()` accepts a single `UpdateFactory`, an `UpdateFactory[]`, or a spread of them. Each factory is stamped with the current slot (starts at `280_000_000`, increments per factory).

### Queue item types

| Method | Effect |
|---|---|
| `.push(factory \| factory[])` | Enqueue one or more account/slot updates |
| `.wait(ms)` | Insert a delay between items during playback |
| `.error(err)` | Emit stream error, stop playback |
| `.end()` | Push stream EOF |
| `.setSlot(n)` | Override current slot counter |
| `.reset()` | Clear queue, reset slot, unregister active mock |

### `subscribe()` trigger

`MockClientDuplexStream._write()` starts async playback on first `stream.write(subscribeRequest)` call — matching real Yellowstone behavior where the server begins streaming after the client sends its filter.

---

## Action builders (`src/actions.ts`)

High-level builders that model **what a user did**, each returning `UpdateFactory[]` (emits all accounts that change in that action).

### NFT

| Builder | Emits |
|---|---|
| `mintedNFT(mint, to, opts?)` | Mint account (supply=1) + token account (amount=1) |
| `transferNFT(mint, from, to, opts?)` | Sender token account (amount=0) + receiver token account (amount=1) |
| `burnNFT(mint, from, opts?)` | Token account (amount=0) + mint account (supply=0) |

### SPL

| Builder | Emits |
|---|---|
| `mintedSPL(mint, to, amount, opts?)` | Mint account + token account |
| `transferSPL(mint, from, to, amount, opts?)` | Sender account (fromBalance, default 0n) + receiver account (amount) |
| `burnSPL(mint, from, amount, opts?)` | Token account (remainingBalance, default 0n) + mint account |

### opts for SPL transfer

```ts
transferSPL(mint, from, to, amount, {
  fromBalance?:      bigint;   // sender's balance after transfer (default 0n — "send all")
  fromTokenAccount?: string | Uint8Array;
  toTokenAccount?:   string | Uint8Array;
  filters?:          string[];
})
```

---

## Low-level builders (`src/builders.ts`)

For tests that need precise account control:

| Builder | Description |
|---|---|
| `accountUpdate(pubkey, lamports, opts)` | Raw `SubscribeUpdate` with arbitrary account data |
| `nftHolding(opts)` | SPL token account with amount=1 (NFT holder) |
| `tokenBalance(opts)` | SPL token account with arbitrary amount |
| `nftMetadata(metadataAddress, opts)` | Metaplex metadata account |
| `slotUpdate(opts?)` | `SubscribeUpdateSlot` (default: SLOT_PROCESSED) |

---

## SPL serialization (`src/spl.ts`)

Uses `AccountLayout` and `MintLayout` from `@solana/spl-token`.

- `tokenAccountData(opts)` → 165-byte `Uint8Array`
- `mintAccountData(opts)` → `MintLayout.span`-byte `Uint8Array`
- Token account state: `0`=Uninitialized, `1`=Initialized, `2`=Frozen

---

## Metaplex serialization (`src/metaplex.ts`)

Uses `getMetadataAccountDataSerializer` + `Key` from `@metaplex-foundation/mpl-token-metadata` (Umi / v3+).

**Not** `Metadata.serialize()` — that is the legacy v2 JS SDK API and does not exist in the current package.

The `key: Key.MetadataV1` discriminator byte must be included or `Metadata.deserialize()` will fail.

```ts
import { getMetadataAccountDataSerializer, Key } from "@metaplex-foundation/mpl-token-metadata";

const [data] = getMetadataAccountDataSerializer().serialize({
  key: Key.MetadataV1,
  updateAuthority: ...,
  mint: ...,
  data: { name, symbol, uri, sellerFeeBasisPoints, creators },
  primarySaleHappened: false,
  isMutable: true,
  editionNonce:       { __option: 'None' },
  tokenStandard:      { __option: 'None' },
  collection:         { __option: 'None' },
  uses:               { __option: 'None' },
  collectionDetails:  { __option: 'None' },
  programmableConfig: { __option: 'None' },
});
```

---

## Program addresses (`src/pubkey.ts`)

| Constant | Address |
|---|---|
| `SPL_TOKEN_PROGRAM` | `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` |
| `TOKEN_2022_PROGRAM` | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |
| `METAPLEX_PROGRAM` | `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s` |
| `SYSTEM_PROGRAM` | `new Uint8Array(32)` |

---

## Rent-exempt lamport constants

| Account | Lamports |
|---|---|
| Token account (165 bytes) | `2_039_280` |
| Mint account | `1_461_600` |
| Metadata account (~679 bytes) | `5_616_720` |

---

## MockClient (`src/client.ts`)

Implements the full `Client` interface so TypeScript doesn't complain when app code types variables as `Client`:

```ts
export class MockClient {
  constructor(_endpoint: string, _xToken?: string, _opts?: object) {}
  connect()             → Promise<void>
  subscribe()           → Promise<MockClientDuplexStream>  // delegates to active mock
  getSlot()             → Promise<{ slot: string }>
  getLatestBlockhash()  → Promise<{ slot, blockhash, lastValidBlockHeight }>
  getBlockHeight()      → Promise<{ blockHeight: string }>
  getVersion()          → Promise<{ version: string }>
  ping(count)           → Promise<{ count }>
  isBlockhashValid()    → Promise<{ slot, valid }>
  subscribeReplayInfo() → Promise<{ firstAvailable: string }>
}
```

---

## Jest setup

```ts
// jest.setup.ts
jest.mock("@triton-one/yellowstone-grpc", () => {
  const { MockClient } = require("yellowstone-grpc-mock");
  const actual = jest.requireActual("@triton-one/yellowstone-grpc");
  return {
    __esModule: true,
    default: MockClient,
    CommitmentLevel: actual.CommitmentLevel,
    SlotStatus:      actual.SlotStatus,
  };
});
```

---

## Peer dependencies

```json
{
  "peerDependencies": {
    "@triton-one/yellowstone-grpc": ">=5",
    "@solana/spl-token": ">=0.4",
    "@metaplex-foundation/mpl-token-metadata": ">=3",
    "bs58": ">=5"
  }
}
```

---

## Verification checklist

1. `npx tsc --noEmit` — no errors
2. `nftHolding()` → 165-byte `data` parseable by `AccountLayout.decode()`
3. `nftMetadata()` → data parseable by `getMetadataAccountDataSerializer().deserialize()`
4. `transferNFT(mint, A, B)` emits two account updates: A with amount=0, B with amount=1
5. `transferSPL(mint, A, B, 500n)` emits two token accounts with correct balances
6. `wait(50)` → delta between received items ≥ 50ms
7. `.error(new Error("boom"))` → stream `error` event fires, playback stops
8. `MockClient.connect()` resolves without throwing
9. Genesis slot `280_000_000` increments by 1 per factory pushed

# yellowstone-grpc-mock

- https://github.com/ic-n/ye
- https://www.npmjs.com/package/yellowstone-grpc-mock

A Jest mock for [`@triton-one/yellowstone-grpc`](https://github.com/rpcpool/yellowstone-grpc) that emits **real serialized on-chain data** — SPL token account layouts, Metaplex metadata — so your tests exercise the full parse pipeline rather than just app logic after parsing.

## Why

Most Yellowstone indexer tests mock at the domain level: the stream hands already-decoded objects straight to the indexer. This works for testing business logic, but it skips the deserialization layer entirely. Edge cases like self-transfers, zero-amount mints, burned token accounts, and frozen states never get exercised.

This mock serializes real byte layouts using the same libraries your program uses at runtime (`@solana/spl-token`, `@metaplex-foundation/mpl-token-metadata`), wraps them in valid `SubscribeUpdate` protobuf objects, and plays them through a `Duplex` stream that behaves exactly like the real `ClientDuplexStream` — playback starts when the app sends its first `SubscribeRequest`, just as it does against a live Geyser node.

---

## Installation

```bash
npm install --save-dev yellowstone-grpc-mock
# peer deps (install whichever your project uses)
npm install @solana/spl-token @metaplex-foundation/mpl-token-metadata bs58
```

---

## Quick start

```ts
// jest.setup.ts
jest.mock("@triton-one/yellowstone-grpc", () => {
  const { MockClient } = require("yellowstone-grpc-mock");
  const actual = jest.requireActual("@triton-one/yellowstone-grpc");
  return {
    __esModule: true,
    default: MockClient,
    CommitmentLevel: actual.CommitmentLevel,
    SlotStatus: actual.SlotStatus,
  };
});
```

```ts
// my-indexer.test.ts
import { YellowStoneMock } from "yellowstone-grpc-mock";
import {
  mintedNFT,
  transferNFT,
  transferSPL,
  slotUpdate,
} from "yellowstone-grpc-mock/actions";
import Client from "@triton-one/yellowstone-grpc"; // → MockClient via jest.setup
import { NftHoldIndexer } from "../src/indexer";

const MINT = "So11111111111111111111111111111111111111112";
const WALLET1 = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const WALLET2 = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

it("counts hold slots on transfer", async () => {
  const ysm = new YellowStoneMock();

  ysm
    .push(mintedNFT(MINT, WALLET1))
    .push(transferNFT(MINT, WALLET1, WALLET2))
    .push(slotUpdate())
    .end();

  const client = new Client("https://mock", "token");
  const indexer = new NftHoldIndexer(client, MINT);
  await indexer.run();

  expect(indexer.holdSlots(WALLET1)).toBe(1);
  expect(indexer.holdSlots(WALLET2)).toBe(1);
});
```

---

## API

### `YellowStoneMock`

The central mock object. Construct one at the top of each test — it auto-registers as the active mock that `MockClient.subscribe()` delegates to.

```ts
const ysm = new YellowStoneMock();
```

| Method                        | Description                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `.push(factory \| factory[])` | Enqueue one or more account / slot updates. Each factory is stamped with the current slot, which increments by 1 per factory. |
| `.wait(ms)`                   | Insert a delay between items during playback.                                                                                 |
| `.error(err)`                 | Emit a stream error and stop playback.                                                                                        |
| `.end()`                      | Push EOF — the readable side closes.                                                                                          |
| `.setSlot(n)`                 | Override the internal slot counter.                                                                                           |
| `.reset()`                    | Clear the queue, reset slot to `280_000_000`, deregister the active mock.                                                     |
| `.subscribe()`                | Returns `Promise<MockClientDuplexStream>`. Usually called indirectly via `MockClient`.                                        |

Playback starts only after `stream.write(subscribeRequest)` is called, matching real Yellowstone behavior.

---

### Action builders

High-level builders that model **what a user did**. Each returns `UpdateFactory[]` — the set of accounts that change for that action. Pass the array directly to `.push()`.

#### NFT

```ts
import { mintedNFT, transferNFT, burnNFT } from "yellowstone-grpc-mock/actions";
// or: from "yellowstone-grpc-mock"

ysm.push(mintedNFT(mint, to));
ysm.push(transferNFT(mint, from, to));
ysm.push(burnNFT(mint, from));
```

| Builder                              | Emits                                                                   | Notes |
| ------------------------------------ | ----------------------------------------------------------------------- | ----- |
| `mintedNFT(mint, to, opts?)`         | Mint account (`supply=1`) + token account (`amount=1`)                  |       |
| `transferNFT(mint, from, to, opts?)` | Sender token account (`amount=0`) + receiver token account (`amount=1`) |       |
| `burnNFT(mint, from, opts?)`         | Token account (`amount=0`) + mint account (`supply=0`)                  |       |

#### SPL tokens

```ts
import { mintedSPL, transferSPL, burnSPL } from "yellowstone-grpc-mock/actions";

ysm.push(mintedSPL(mint, to, 1_000_000n));
ysm.push(transferSPL(mint, from, to, 500_000n, { fromBalance: 500_000n }));
ysm.push(
  burnSPL(mint, from, 500_000n, {
    remainingBalance: 0n,
    totalSupply: 9_500_000n,
  })
);
```

| Builder                                      | Emits                             | Notes                                                        |
| -------------------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| `mintedSPL(mint, to, amount, opts?)`         | Mint account + token account      | `opts.decimals` defaults to `6`                              |
| `transferSPL(mint, from, to, amount, opts?)` | Sender account + receiver account | `opts.fromBalance` defaults to `0n` — the "send all" pattern |
| `burnSPL(mint, from, amount, opts?)`         | Token account + mint account      | `opts.remainingBalance` defaults to `0n`                     |

All address arguments accept either a base58 `string` or a raw `Uint8Array`.

---

### Low-level builders

For tests that need precise account control.

```ts
import {
  accountUpdate,
  nftHolding,
  tokenBalance,
  mintUpdate,
  nftMetadata,
  slotUpdate,
} from "yellowstone-grpc-mock/builders";
// or: from "yellowstone-grpc-mock"
```

| Builder                                           | Description                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `accountUpdate(pubkey, lamports, opts)`           | Raw `SubscribeUpdate` with arbitrary owner, data, and filters.                 |
| `nftHolding({ mint, holder, ...opts })`           | SPL token account serialized via `AccountLayout` with `amount=1`.              |
| `tokenBalance({ mint, holder, amount, ...opts })` | SPL token account with an arbitrary amount.                                    |
| `mintUpdate(mint, opts?)`                         | Mint account serialized via `MintLayout`.                                      |
| `nftMetadata(metadataAddress, opts)`              | Metaplex metadata account serialized via `getMetadataAccountDataSerializer()`. |
| `slotUpdate(opts?)`                               | `SubscribeUpdateSlot`. Defaults to `SLOT_PROCESSED`.                           |

---

### `MockClient`

A drop-in replacement for the real `Client` class. All constructor arguments are accepted and ignored. `subscribe()` delegates to the active `YellowStoneMock`. All other RPC methods return plausible stub values.

```ts
const client = new MockClient("https://any-endpoint", "any-token");
await client.connect(); // resolves immediately
const stream = await client.subscribe(); // returns the mock stream
```

---

## Serialization details

### SPL token accounts

Serialized with `AccountLayout` from `@solana/spl-token`. The 165-byte layout matches what Yellowstone streams verbatim from on-chain accounts.

```
state values:  0 = Uninitialized  |  1 = Initialized  |  2 = Frozen
```

### Metaplex metadata

Serialized with `getMetadataAccountDataSerializer()` from `@metaplex-foundation/mpl-token-metadata` (Umi / v3+). The `Key.MetadataV1` discriminator byte is always written as the first byte so `deserialize()` round-trips correctly.

### Rent-exempt lamport defaults

| Account                       | Lamports    |
| ----------------------------- | ----------- |
| Token account (165 bytes)     | `2_039_280` |
| Mint account                  | `1_461_600` |
| Metadata account (~679 bytes) | `5_616_720` |

---

## Peer dependencies

| Package                                   | Version |
| ----------------------------------------- | ------- |
| `@triton-one/yellowstone-grpc`            | `>=5`   |
| `@solana/spl-token`                       | `>=0.4` |
| `@metaplex-foundation/mpl-token-metadata` | `>=3`   |
| `bs58`                                    | `>=5`   |

---

## Project structure

```
src/
  types.ts      — QueueItem, UpdateFactory
  pubkey.ts     — pubkeyBytes(), program address constants
  spl.ts        — tokenAccountData(), mintAccountData()
  metaplex.ts   — metadataAccountData()
  builders.ts   — low-level builders
  actions.ts    — high-level action builders
  stream.ts     — MockClientDuplexStream
  mock.ts       — YellowStoneMock + active mock registry
  client.ts     — MockClient
  index.ts      — barrel export
```

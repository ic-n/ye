import { describe, it, expect, afterEach } from "@jest/globals";
import { AccountLayout } from "@solana/spl-token";
import { getMetadataAccountDataSerializer, Key } from "@metaplex-foundation/mpl-token-metadata";
import type { SubscribeUpdate } from "@triton-one/yellowstone-grpc";

import { YellowStoneMock } from "../src/mock";
import { MockClient } from "../src/client";
import {
  mintedNFT, transferNFT, burnNFT,
  mintedSPL, transferSPL, burnSPL,
} from "../src/actions";
import { nftHolding, tokenBalance, slotUpdate, nftMetadata } from "../src/builders";


// ─── Fixtures ────────────────────────────────────────────────────────────────
// Arbitrary valid pubkeys — not real programs or funded accounts.

const MINT    = "GkNkuozgNFN7K5AAjmFjMSFnNegpqkwEGbJyEXGq7LYR";
const WALLET1 = "5ByhkuHZMH7sU36DhfNMjy78hSMTPKJ1UEdDJqoKkmrU";
const WALLET2 = "9nJ7BWiAsNEHzFBtNXLFKFuJJupCdMwZ6xGZZNYPumpE";
const COIN    = "3mEH6iBwWqZt94dVijMQEXTMv4GVhMT9BAnBHK7HEJKP";

/** Collect all readable SubscribeUpdate objects from the stream. */
function collect(stream: NodeJS.ReadableStream): Promise<SubscribeUpdate[]> {
  return new Promise((resolve, reject) => {
    const items: SubscribeUpdate[] = [];
    stream.on("data",  (chunk: SubscribeUpdate) => items.push(chunk));
    stream.on("end",   () => resolve(items));
    stream.on("error", reject);
  });
}

/** Drive the stream by writing an empty subscribe request, then collect. */
async function run(ysm: YellowStoneMock): Promise<SubscribeUpdate[]> {
  const stream = await ysm.subscribe();
  const done   = collect(stream);
  stream.write({}); // triggers playback
  return done;
}

// ─── YellowStoneMock: slot stamping ──────────────────────────────────────────

describe("YellowStoneMock slot stamping", () => {
  it("starts at slot 280_000_000", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(slotUpdate()).end();
    const [item] = await run(ysm);
    expect(item.slot?.slot).toBe("280000000");
  });

  it("increments slot by 1 per factory pushed", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(slotUpdate())
       .push(slotUpdate())
       .push(slotUpdate())
       .end();
    const items = await run(ysm);
    expect(items.map((i) => i.slot?.slot)).toEqual(["280000000", "280000001", "280000002"]);
  });

  it("each factory in an array gets its own slot", async () => {
    const ysm = new YellowStoneMock();
    // mintedNFT returns 2 factories; they should land on consecutive slots
    ysm.push(mintedNFT(MINT, WALLET1)).end();
    const items = await run(ysm);
    expect(items).toHaveLength(2);
    expect(items[0].account?.slot).toBe("280000000");
    expect(items[1].account?.slot).toBe("280000001");
  });

  it("setSlot overrides the counter", async () => {
    const ysm = new YellowStoneMock();
    ysm.setSlot(999).push(slotUpdate()).end();
    const [item] = await run(ysm);
    expect(item.slot?.slot).toBe("999");
  });

  it("reset clears queue and slot", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(slotUpdate());
    ysm.reset();
    // After reset the mock is unregistered; a new mock takes over
    const ysm2 = new YellowStoneMock();
    ysm2.push(slotUpdate()).end();
    const [item] = await run(ysm2);
    expect(item.slot?.slot).toBe("280000000");
  });
});

// ─── Stream playback ─────────────────────────────────────────────────────────

describe("MockClientDuplexStream playback", () => {
  it("emits items in order and ends", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(slotUpdate())
       .push(slotUpdate())
       .end();
    const items = await run(ysm);
    expect(items).toHaveLength(2);
  });

  it("does not start playback until stream.write() is called", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(slotUpdate()).end();
    const stream = await ysm.subscribe();
    // No write yet — stream should have no data buffered
    expect(stream.readableLength).toBe(0);
    const done = collect(stream);
    stream.write({});
    const items = await done;
    expect(items).toHaveLength(1);
  });

  it("wait() introduces a delay between items", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(slotUpdate())
       .wait(60)
       .push(slotUpdate())
       .end();

    const timestamps: number[] = [];
    const stream = await ysm.subscribe();
    const done   = new Promise<void>((resolve, reject) => {
      stream.on("data",  () => timestamps.push(Date.now()));
      stream.on("end",   resolve);
      stream.on("error", reject);
    });
    stream.write({});
    await done;

    expect(timestamps).toHaveLength(2);
    expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(50);
  });

  it("error() fires the stream error event and stops playback", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(slotUpdate())
       .error(new Error("boom"))
       .push(slotUpdate()) // should never be emitted
       .end();

    const stream  = await ysm.subscribe();
    const items:  SubscribeUpdate[] = [];
    const errored = new Promise<Error>((resolve) => {
      stream.on("data",  (c: SubscribeUpdate) => items.push(c));
      stream.on("error", resolve);
    });
    stream.write({});

    const err = await errored;
    expect(err.message).toBe("boom");
    expect(items).toHaveLength(1); // only the first item before the error
  });

  it("implicit end when no .end() is chained", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(slotUpdate()); // no .end()
    const items = await run(ysm);
    expect(items).toHaveLength(1);
  });
});

// ─── MockClient ──────────────────────────────────────────────────────────────

describe("MockClient", () => {
  afterEach(() => {
    // Clean up active mock between tests
    try { new YellowStoneMock().reset(); } catch {}
  });

  it("connect() resolves without throwing", async () => {
    const client = new MockClient("https://mock", "token");
    await expect(client.connect()).resolves.toBeUndefined();
  });

  it("subscribe() delegates to active YellowStoneMock", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(slotUpdate()).end();
    const client = new MockClient("https://mock", "token");
    const stream = await client.subscribe();
    const done   = collect(stream);
    stream.write({});
    const items = await done;
    expect(items).toHaveLength(1);
  });

  it("subscribe() throws when no active mock", () => {
    const ysm = new YellowStoneMock();
    ysm.reset(); // deregisters
    const client = new MockClient("https://mock");
    expect(() => client.subscribe()).toThrow("No active YellowStoneMock");
  });

  it("getSlot() returns the genesis slot string", async () => {
    const client = new MockClient("https://mock");
    const res = await client.getSlot();
    expect(res.slot).toBe("280000000");
  });

  it("stub RPC methods resolve without throwing", async () => {
    const client = new MockClient("https://mock");
    await expect(client.getLatestBlockhash()).resolves.toHaveProperty("blockhash");
    await expect(client.getBlockHeight()).resolves.toHaveProperty("blockHeight");
    await expect(client.getVersion()).resolves.toHaveProperty("version");
    await expect(client.ping(42)).resolves.toEqual({ count: 42 });
    await expect(client.isBlockhashValid()).resolves.toHaveProperty("valid");
    await expect(client.subscribeReplayInfo()).resolves.toHaveProperty("firstAvailable");
  });
});

// ─── NFT action builders ──────────────────────────────────────────────────────

describe("mintedNFT()", () => {
  it("emits exactly 2 updates: mint account then token account", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(mintedNFT(MINT, WALLET1)).end();
    const items = await run(ysm);
    expect(items).toHaveLength(2);
    // First update is the mint account (no SPL token layout — it's a MintLayout)
    expect(items[0].account).toBeDefined();
    // Second update is the token account
    expect(items[1].account).toBeDefined();
  });

  it("token account data decodes to amount=1 with correct holder", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(mintedNFT(MINT, WALLET1)).end();
    const items  = await run(ysm);
    const taData = items[1].account?.account?.data;
    expect(taData).toBeDefined();
    expect(taData!.length).toBe(AccountLayout.span); // 165 bytes
    const decoded = AccountLayout.decode(Buffer.from(taData!));
    expect(decoded.amount).toBe(1n);
    expect(decoded.owner.toBase58()).toBe(WALLET1);
    expect(decoded.mint.toBase58()).toBe(MINT);
  });
});

describe("transferNFT()", () => {
  it("emits 2 updates: sender zeroed, receiver holds NFT", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(transferNFT(MINT, WALLET1, WALLET2)).end();
    const items = await run(ysm);
    expect(items).toHaveLength(2);

    const sender   = AccountLayout.decode(Buffer.from(items[0].account!.account!.data));
    const receiver = AccountLayout.decode(Buffer.from(items[1].account!.account!.data));

    expect(sender.amount).toBe(0n);
    expect(sender.owner.toBase58()).toBe(WALLET1);

    expect(receiver.amount).toBe(1n);
    expect(receiver.owner.toBase58()).toBe(WALLET2);
  });

  it("both accounts reference the same mint", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(transferNFT(MINT, WALLET1, WALLET2)).end();
    const items = await run(ysm);

    const sender   = AccountLayout.decode(Buffer.from(items[0].account!.account!.data));
    const receiver = AccountLayout.decode(Buffer.from(items[1].account!.account!.data));

    expect(sender.mint.toBase58()).toBe(MINT);
    expect(receiver.mint.toBase58()).toBe(MINT);
  });
});

describe("burnNFT()", () => {
  it("emits token account (amount=0) then mint account (supply=0)", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(burnNFT(MINT, WALLET1)).end();
    const items = await run(ysm);
    expect(items).toHaveLength(2);

    const ta = AccountLayout.decode(Buffer.from(items[0].account!.account!.data));
    expect(ta.amount).toBe(0n);
  });
});

// ─── SPL action builders ──────────────────────────────────────────────────────

describe("mintedSPL()", () => {
  it("emits mint account then token account with correct amount", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(mintedSPL(COIN, WALLET1, 1_000_000n)).end();
    const items = await run(ysm);
    expect(items).toHaveLength(2);

    const ta = AccountLayout.decode(Buffer.from(items[1].account!.account!.data));
    expect(ta.amount).toBe(1_000_000n);
    expect(ta.owner.toBase58()).toBe(WALLET1);
  });
});

describe("transferSPL()", () => {
  it("emits sender (fromBalance) and receiver (amount)", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(transferSPL(COIN, WALLET1, WALLET2, 500_000n, { fromBalance: 500_000n })).end();
    const items = await run(ysm);
    expect(items).toHaveLength(2);

    const sender   = AccountLayout.decode(Buffer.from(items[0].account!.account!.data));
    const receiver = AccountLayout.decode(Buffer.from(items[1].account!.account!.data));

    expect(sender.amount).toBe(500_000n);
    expect(receiver.amount).toBe(500_000n);
  });

  it("sender defaults to 0n when fromBalance is omitted (send-all pattern)", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(transferSPL(COIN, WALLET1, WALLET2, 1_000_000n)).end();
    const items = await run(ysm);

    const sender = AccountLayout.decode(Buffer.from(items[0].account!.account!.data));
    expect(sender.amount).toBe(0n);
  });
});

describe("burnSPL()", () => {
  it("emits token account with remainingBalance then mint", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(burnSPL(COIN, WALLET1, 500_000n, { remainingBalance: 500_000n, totalSupply: 9_500_000n })).end();
    const items = await run(ysm);
    expect(items).toHaveLength(2);

    const ta = AccountLayout.decode(Buffer.from(items[0].account!.account!.data));
    expect(ta.amount).toBe(500_000n);
  });
});

// ─── Low-level builder data integrity ────────────────────────────────────────

describe("nftHolding() data integrity", () => {
  it("produces a 165-byte account data buffer", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(nftHolding({ mint: MINT, holder: WALLET1 })).end();
    const [item] = await run(ysm);
    expect(item.account!.account!.data.length).toBe(AccountLayout.span);
  });

  it("decoded fields match opts: amount=1, correct owner, correct mint, state=Initialized", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(nftHolding({ mint: MINT, holder: WALLET1 })).end();
    const [item] = await run(ysm);

    const decoded = AccountLayout.decode(Buffer.from(item.account!.account!.data));
    expect(decoded.amount).toBe(1n);
    expect(decoded.owner.toBase58()).toBe(WALLET1);
    expect(decoded.mint.toBase58()).toBe(MINT);
    expect(decoded.state).toBe(1); // Initialized
  });

  it("isFrozen sets state=2", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(nftHolding({ mint: MINT, holder: WALLET1, isFrozen: true })).end();
    const [item] = await run(ysm);
    const decoded = AccountLayout.decode(Buffer.from(item.account!.account!.data));
    expect(decoded.state).toBe(2); // Frozen
  });
});

describe("tokenBalance() data integrity", () => {
  it("encodes arbitrary bigint amounts", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(tokenBalance({ mint: COIN, holder: WALLET1, amount: 42_000_000n })).end();
    const [item] = await run(ysm);
    const decoded = AccountLayout.decode(Buffer.from(item.account!.account!.data));
    expect(decoded.amount).toBe(42_000_000n);
  });
});

describe("nftMetadata() data integrity", () => {
  it("produces bytes deserializable by getMetadataAccountDataSerializer()", async () => {
    const ysm = new YellowStoneMock();
    ysm.push(
      nftMetadata("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s", {
        mint:   MINT,
        name:   "Test NFT",
        symbol: "TEST",
        uri:    "https://test.json",
      }),
    ).end();
    const [item] = await run(ysm);

    const data = item.account!.account!.data;
    const [decoded] = getMetadataAccountDataSerializer().deserialize(data);
    expect(decoded.key).toBe(Key.MetadataV1);
    expect(decoded.name.replace(/\0/g, "")).toBe("Test NFT");
    expect(decoded.symbol.replace(/\0/g, "")).toBe("TEST");
  });
});

// ─── Full scenario: NFT hold-slot indexer pattern ────────────────────────────

describe("NFT hold-slot scenario", () => {
  it("emits correct sequence for mint → transfer → burn", async () => {
    const ysm = new YellowStoneMock();
    ysm
      .push(mintedNFT(MINT, WALLET1))        // slots 280_000_000-001
      .push(transferNFT(MINT, WALLET1, WALLET2)) // slots 280_000_002-003
      .push(burnNFT(MINT, WALLET2))          // slots 280_000_004-005
      .push(slotUpdate())
      .end();

    const items = await run(ysm);
    // 2 + 2 + 2 + 1 slot update
    expect(items).toHaveLength(7);

    // After transfer: receiver holds NFT
    const receiverTA = AccountLayout.decode(Buffer.from(items[3].account!.account!.data));
    expect(receiverTA.amount).toBe(1n);
    expect(receiverTA.owner.toBase58()).toBe(WALLET2);

    // After burn: token account zeroed
    const burnedTA = AccountLayout.decode(Buffer.from(items[4].account!.account!.data));
    expect(burnedTA.amount).toBe(0n);
  });
});

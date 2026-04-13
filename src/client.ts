import { getActiveMock } from "./mock";
import type { MockClientDuplexStream } from "./stream";

const MOCK_SLOT = "280000000";

/**
 * Drop-in replacement for `Client` from `@triton-one/yellowstone-grpc`.
 * Delegates subscribe() to the active YellowStoneMock.
 * All RPC utility methods return plausible stub responses so app code
 * that calls them before subscribing does not throw.
 */
export class MockClient {
  constructor(
    _endpoint: string,
    _xToken?: string,
    _opts?: object,
  ) {}

  connect(): Promise<void> {
    return Promise.resolve();
  }

  subscribe(): Promise<MockClientDuplexStream> {
    const mock = getActiveMock();
    if (!mock) throw new Error("No active YellowStoneMock — call new YellowStoneMock() before subscribe()");
    return mock.subscribe();
  }

  getSlot(): Promise<{ slot: string }> {
    return Promise.resolve({ slot: MOCK_SLOT });
  }

  getLatestBlockhash(): Promise<{ slot: string; blockhash: string; lastValidBlockHeight: string }> {
    return Promise.resolve({ slot: MOCK_SLOT, blockhash: "mockhash", lastValidBlockHeight: "0" });
  }

  getBlockHeight(): Promise<{ blockHeight: string }> {
    return Promise.resolve({ blockHeight: "0" });
  }

  getVersion(): Promise<{ version: string }> {
    return Promise.resolve({ version: "mock" });
  }

  ping(count: number): Promise<{ count: number }> {
    return Promise.resolve({ count });
  }

  isBlockhashValid(): Promise<{ slot: string; valid: boolean }> {
    return Promise.resolve({ slot: MOCK_SLOT, valid: true });
  }

  subscribeReplayInfo(): Promise<{ firstAvailable: string }> {
    return Promise.resolve({ firstAvailable: MOCK_SLOT });
  }
}

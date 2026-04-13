import { MockClientDuplexStream } from "./stream";
import type { UpdateFactory, QueueItem } from "./types";

const GENESIS_SLOT = 280_000_000;

let _activeMock: YellowStoneMock | null = null;
export const getActiveMock = (): YellowStoneMock | null => _activeMock;

export class YellowStoneMock {
  private _slot = GENESIS_SLOT;
  private _queue: QueueItem[] = [];

  constructor() {
    _activeMock = this;
  }

  push(factory: UpdateFactory | UpdateFactory[]): this {
    const factories = Array.isArray(factory) ? factory : [factory];
    for (const f of factories) {
      this._queue.push({ type: "data", update: f(String(this._slot)) });
      this._slot++;
    }
    return this;
  }

  wait(ms: number): this {
    this._queue.push({ type: "wait", ms });
    return this;
  }

  error(err: Error): this {
    this._queue.push({ type: "error", error: err });
    return this;
  }

  end(): this {
    this._queue.push({ type: "end" });
    return this;
  }

  setSlot(n: number): this {
    this._slot = n;
    return this;
  }

  subscribe(): Promise<MockClientDuplexStream> {
    return Promise.resolve(new MockClientDuplexStream([...this._queue]));
  }

  reset(): void {
    this._slot = GENESIS_SLOT;
    this._queue = [];
    _activeMock = null;
  }
}

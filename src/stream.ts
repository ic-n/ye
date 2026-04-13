import { Duplex } from "stream";
import type { SubscribeRequest } from "@triton-one/yellowstone-grpc";
import type { QueueItem } from "./types";

export class MockClientDuplexStream extends Duplex {
  private readonly _queue: QueueItem[];
  private _started = false;

  constructor(queue: QueueItem[]) {
    super({ readableObjectMode: true, writableObjectMode: true });
    this._queue = queue;
  }

  // Readable side — Node streams pull via _read; we push proactively during playback
  _read(_size: number): void {}

  // Writable side — first write from the app (SubscribeRequest) triggers playback
  _write(
    _chunk: SubscribeRequest,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
    if (!this._started) {
      this._started = true;
      this._play().catch((err) => this.destroy(err));
    }
  }

  private async _play(): Promise<void> {
    for (const item of this._queue) {
      switch (item.type) {
        case "data":
          // push returns false when the internal buffer is full; respect backpressure
          if (!this.push(item.update)) {
            await new Promise<void>((resolve) => this.once("drain", resolve));
          }
          break;

        case "wait":
          await new Promise<void>((resolve) => setTimeout(resolve, item.ms));
          break;

        case "error":
          this.destroy(item.error);
          return;

        case "end":
          this.push(null);
          return;
      }
    }
    // Implicit end if no explicit end() was queued
    this.push(null);
  }
}

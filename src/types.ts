import type { SubscribeUpdate } from "@triton-one/yellowstone-grpc";

/** A factory called with the current slot string, returns a fully-formed SubscribeUpdate. */
export type UpdateFactory = (slot: string) => SubscribeUpdate;

export type QueueItem =
  | { type: "data";  update: SubscribeUpdate }
  | { type: "wait";  ms: number }
  | { type: "error"; error: Error }
  | { type: "end" };

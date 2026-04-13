import bs58 from "bs58";

export function pubkeyBytes(v: string | Uint8Array): Uint8Array {
  if (v instanceof Uint8Array) return v;
  return bs58.decode(v);
}

export const SPL_TOKEN_PROGRAM  = pubkeyBytes("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const TOKEN_2022_PROGRAM = pubkeyBytes("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
export const METAPLEX_PROGRAM   = pubkeyBytes("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
export const SYSTEM_PROGRAM     = new Uint8Array(32);

// MasterEdition lives under the same Token Metadata program
export const MASTER_EDITION_PROGRAM = METAPLEX_PROGRAM;

import { getMetadataAccountDataSerializer } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import bs58 from "bs58";

function umiPk(v: string | Uint8Array): string {
  return typeof v === "string" ? v : bs58.encode(v);
}

export interface MetadataOpts {
  mint:                  string | Uint8Array;
  updateAuthority?:      string | Uint8Array;
  name?:                 string;
  symbol?:               string;
  uri?:                  string;
  sellerFeeBasisPoints?: number;
  primarySaleHappened?:  boolean;
  isMutable?:            boolean;
  creators?: Array<{
    address:  string | Uint8Array;
    verified: boolean;
    share:    number;
  }>;
}

export function metadataAccountData(opts: MetadataOpts): Uint8Array {
  const creators = opts.creators
    ? {
        __option: "Some" as const,
        value: opts.creators.map((c) => ({
          address:  umiPublicKey(umiPk(c.address)),
          verified: c.verified,
          share:    c.share,
        })),
      }
    : { __option: "None" as const };

  return getMetadataAccountDataSerializer().serialize({
    updateAuthority: umiPublicKey(umiPk(opts.updateAuthority ?? new Uint8Array(32))),
    mint:            umiPublicKey(umiPk(opts.mint)),
    name:            opts.name   ?? "Mock NFT",
    symbol:          opts.symbol ?? "MOCK",
    uri:             opts.uri    ?? "https://mock.json",
    sellerFeeBasisPoints: opts.sellerFeeBasisPoints ?? 0,
    creators,
    primarySaleHappened: opts.primarySaleHappened ?? false,
    isMutable:           opts.isMutable ?? true,
    editionNonce:        { __option: "None" as const },
    tokenStandard:       { __option: "None" as const },
    collection:          { __option: "None" as const },
    uses:                { __option: "None" as const },
    collectionDetails:   { __option: "None" as const },
    programmableConfig:  { __option: "None" as const },
  });
}

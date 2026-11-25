import { BNB_STOCKS, ATLAS_MULTIFEED_BSC, type BnbStock } from "./stocks";
import { readAtlasOnchain, readAtlasSigned, readCmc, readReference, type AtlasSignedRead } from "./sources";
import { bnbVerdict, type Readings, type StockVerdict } from "./verdict";

// One reading of every source and the cat's verdict on each stock: what /api/bnb serves and what
// gets recorded on-chain.

export interface StockSnapshot extends BnbStock, StockVerdict {
  readings: Readings & { atlasConsensusScore: number | null; atlasTwap: number | null; cmcMarketCap: number | null };
  links: { atlasFeed: string; cmc: string; token: string };
}

export interface Snapshot {
  ok: boolean;
  chain: string;
  observedAt: string;
  session: Awaited<ReturnType<typeof readReference>>["session"];
  sources: {
    atlasOnchain: { ok: boolean; contract: string; block: number | null; error?: string };
    atlasSigned: { ok: boolean; configured: boolean; error?: string };
    cmc: { ok: boolean; configured: boolean; error?: string };
    reference: { ok: boolean; observedAt: string | null; error?: string };
  };
  stocks: StockSnapshot[];
  /** The signed Atlas package read with this snapshot (server-side only; stripped before serving). */
  signed: AtlasSignedRead;
}

export async function takeSnapshot(): Promise<Snapshot> {
  const [onchain, signed, cmc, ref] = await Promise.all([readAtlasOnchain(), readAtlasSigned(), readCmc(), readReference()]);
  const nowS = Math.floor(Date.now() / 1000);
  const referenceAgeMin = ref.observedAt ? Math.round((Date.now() - Date.parse(ref.observedAt)) / 60000) : null;

  const stocks: StockSnapshot[] = BNB_STOCKS.map((s) => {
    const a = onchain.feeds[s.atlasFeed];
    const sg = signed.feeds[s.atlasFeed];
    const q = cmc.quotes[s.cmcId];
    const d = cmc.dex[s.token];
    const readings: Readings = {
      atlasPrice: a?.price ?? null,
      atlasOnchainTs: a?.onchainTs ?? null,
      atlasConsensus: sg?.consensusStatus ?? null,
      cmcPrice: q?.price ?? null,
      cmcVolume24h: q?.volume24h ?? null,
      dexPrice: d?.price ?? null,
      dexLiquidityUsd: d?.liquidityUsd ?? null,
      realPrice: ref.prices[s.ticker] ?? null,
      referenceAgeMin,
      marketOpen: ref.session.anchored,
      marketState: ref.session.state,
      hoursToNextOpen: ref.session.hoursToNextOpen,
      nowS,
    };
    return {
      ...s,
      ...bnbVerdict(s, readings),
      readings: { ...readings, atlasConsensusScore: sg?.consensusScore ?? null, atlasTwap: sg?.twapPrice ?? null, cmcMarketCap: q?.marketCap ?? null },
      links: {
        atlasFeed: `https://atlasoracle.io/feeds/${s.atlasFeed}`,
        cmc: `https://coinmarketcap.com/currencies/${s.cmcId}/`,
        token: `https://bscscan.com/token/${s.token}`,
      },
    };
  });

  return {
    ok: onchain.ok || cmc.ok,
    chain: "BNB Smart Chain",
    observedAt: new Date().toISOString(),
    session: ref.session,
    sources: {
      atlasOnchain: { ok: onchain.ok, contract: ATLAS_MULTIFEED_BSC, block: onchain.block, error: onchain.error },
      atlasSigned: { ok: signed.ok, configured: signed.configured, error: signed.error },
      cmc: { ok: cmc.ok, configured: cmc.configured, error: cmc.error },
      reference: { ok: ref.ok, observedAt: ref.observedAt, error: ref.error },
    },
    stocks,
    signed,
  };
}

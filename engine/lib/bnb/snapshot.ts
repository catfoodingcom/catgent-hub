import { BNB_STOCKS, ATLAS_MULTIFEED_BSC, type BnbStock } from "./stocks";
import { readAtlasOnchain, readAtlasSigned, readCmc, readReference, type AtlasSignedRead } from "./sources";
import { bnbVerdict, type Readings, type StockVerdict } from "./verdict";
import { screenAll, type IndexScreen, type ScreenRule } from "./screen";
import { readCouncil, type CouncilLeg, type CouncilView } from "./council";

// One reading of every source and the cat's verdict on each stock: what /api/bnb serves and what
// gets recorded on-chain.

export interface StockSnapshot extends BnbStock, StockVerdict {
  readings: Readings & {
    atlasConsensusScore: number | null;
    atlasTwap: number | null;
    cmcMarketCap: number | null;
    /** 24h volume on BNB Chain DEX pools only (cmcVolume24h also counts exchanges such as Binance). */
    dexVolume24hUsd: number | null;
    dexTxs24h: number | null;
    cexListed: string[];
  };
  /** Does it meet the Steward index's liquidity + volume screen, and for how many days running? */
  index: IndexScreen;
  /** The book's Council on the underlying share. */
  council: CouncilLeg | null;
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
  indexScreen: ScreenRule & { volumeSource: string };
  council: Omit<CouncilView, "bySymbol">;
  /** The signed Atlas package read with this snapshot (server-side only; stripped before serving). */
  signed: AtlasSignedRead;
}

export async function takeSnapshot(): Promise<Snapshot> {
  const [onchain, signed, cmc, ref, councilView] = await Promise.all([
    readAtlasOnchain(),
    readAtlasSigned(),
    readCmc(),
    readReference(),
    readCouncil(BNB_STOCKS),
  ]);
  const screen = await screenAll(
    BNB_STOCKS.map((s) => ({ symbol: s.symbol, liquidityUsd: cmc.dex[s.token]?.liquidityUsd ?? null, volume24hUsd: cmc.dex[s.token]?.volume24hUsd ?? null })),
  );
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
      readings: {
        ...readings,
        atlasConsensusScore: sg?.consensusScore ?? null,
        atlasTwap: sg?.twapPrice ?? null,
        cmcMarketCap: q?.marketCap ?? null,
        dexVolume24hUsd: d?.volume24hUsd ?? null,
        dexTxs24h: d?.txs24h ?? null,
        cexListed: d?.cexListed ?? [],
      },
      index: screen.bySymbol[s.symbol],
      council: councilView.bySymbol[s.symbol] ?? null,
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
    indexScreen: { ...screen.rule, volumeSource: "CMC DEX: 24h volume on BNB Chain pools only" },
    council: (({ bySymbol: _b, ...rest }) => (void _b, rest))(councilView),
    signed,
  };
}

import { promises as fs } from "fs";
import path from "path";
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import { ATLAS_MULTIFEED_BSC, BNB_STOCKS, feedKey } from "./stocks";

// CoAgentic Markets: the BNB Chain lane's raw readings (Atlas Oracle, CoinMarketCap) and the real share.
// Server-side only; the API keys stay on the engine.
// Each reader returns what it got plus where from, so the page can show its working.

const TIMEOUT_MS = 8000;
const BSC_RPC = process.env.BSC_RPC_URL ?? "https://bsc-rpc.publicnode.com";
/** CMC's free plan has 15,000 credits a month: its reads are kept for 5 minutes. */
const CMC_REVALIDATE_S = 300;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

// ---------- Atlas Oracle, on-chain (push mode): read the feed contract on BNB Smart Chain ----------

const multiFeedAbi = [
  {
    type: "function",
    name: "fetchBatch",
    stateMutability: "view",
    inputs: [{ name: "feedIds", type: "bytes4[]" }],
    outputs: [
      {
        name: "priceSnapshots",
        type: "tuple[]",
        components: [
          { name: "price", type: "uint80" },
          { name: "aggregatedTs", type: "uint48" },
          { name: "onchainTs", type: "uint48" },
        ],
      },
    ],
  },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "precision", type: "uint8" }] },
] as const;

export interface AtlasOnchain {
  price: number | null;
  /** When Atlas aggregated the price, and when it landed on-chain (unix seconds). */
  aggregatedTs: number | null;
  onchainTs: number | null;
}

export interface AtlasOnchainRead {
  ok: boolean;
  contract: string;
  block: number | null;
  feeds: Record<number, AtlasOnchain>;
  error?: string;
}

const bscClient = createPublicClient({ chain: bsc, transport: http(BSC_RPC, { timeout: TIMEOUT_MS }) });

export async function readAtlasOnchain(): Promise<AtlasOnchainRead> {
  const ids = BNB_STOCKS.map((s) => s.atlasFeed);
  try {
    const [block, decimals, snaps] = await Promise.all([
      bscClient.getBlockNumber(),
      bscClient.readContract({ address: ATLAS_MULTIFEED_BSC, abi: multiFeedAbi, functionName: "decimals" }),
      bscClient.readContract({ address: ATLAS_MULTIFEED_BSC, abi: multiFeedAbi, functionName: "fetchBatch", args: [ids.map(feedKey)] }),
    ]);
    const feeds: Record<number, AtlasOnchain> = {};
    ids.forEach((id, i) => {
      const s = snaps[i];
      // a feed that was never updated reads as zeros
      const empty = !s || Number(s.price) === 0;
      feeds[id] = {
        price: empty ? null : Number(s.price) / 10 ** decimals,
        aggregatedTs: empty ? null : Number(s.aggregatedTs),
        onchainTs: empty ? null : Number(s.onchainTs),
      };
    });
    return { ok: true, contract: ATLAS_MULTIFEED_BSC, block: Number(block), feeds };
  } catch (e) {
    return { ok: false, contract: ATLAS_MULTIFEED_BSC, block: null, feeds: {}, error: e instanceof Error ? e.message.slice(0, 160) : "read failed" };
  }
}

// ---------- Atlas Oracle, signed (pull mode): consensus health per feed ----------

export interface AtlasSigned {
  price: number | null;
  timestamp: number | null;
  consensusStatus: string | null;
  consensusScore: number | null;
  twapPrice: number | null;
  volatility: number | null;
}

export interface AtlasSignedRead {
  ok: boolean;
  /** No key configured: the lane runs on the on-chain feed alone. */
  configured: boolean;
  feeds: Record<number, AtlasSigned>;
  /** The signed package, for recording a verdict on-chain (the contract checks the signature). */
  payload?: string;
  signature?: string;
  magicMarker?: string;
  error?: string;
}

export async function readAtlasSigned(feedIds: number[] = BNB_STOCKS.map((s) => s.atlasFeed)): Promise<AtlasSignedRead> {
  const key = process.env.ATLAS_API_KEY;
  if (!key) return { ok: false, configured: false, feeds: {} };
  try {
    const res = await fetch("https://api.atlasoracle.io/report/v1/price/latest", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ feedIds: feedIds.map(String), signed: true }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const body = await res.json();
    if (!res.ok || body?.status?.error_code !== "0") throw new Error(body?.status?.error_message ?? String(res.status));
    const d = body.data ?? {};
    const parsed: { feedId: string; price: number | string; timestampSeconds: string }[] = JSON.parse(d.parsedPayload ?? "[]");
    const feeds: Record<number, AtlasSigned> = {};
    for (const p of parsed) {
      feeds[Number(p.feedId)] = {
        // parsedPayload prices are 18-decimal integers; JSON may already have rounded them, which is fine for display
        price: num(p.price) == null ? null : Number(p.price) / 1e18,
        timestamp: num(p.timestampSeconds),
        consensusStatus: null,
        consensusScore: null,
        twapPrice: null,
        volatility: null,
      };
    }
    for (const c of d.consensusScores ?? []) {
      const f = (feeds[Number(c.feedId)] ??= { price: null, timestamp: null, consensusStatus: null, consensusScore: null, twapPrice: null, volatility: null });
      f.consensusStatus = typeof c.consensusStatus === "string" ? c.consensusStatus : null;
      f.consensusScore = num(c.consensusScore);
      f.twapPrice = num(c.twapPrice);
      f.volatility = num(c.priceVolatility);
    }
    return { ok: true, configured: true, feeds, payload: d.payload, signature: d.signature, magicMarker: d.magicMarker };
  } catch (e) {
    return { ok: false, configured: true, feeds: {}, error: e instanceof Error ? e.message.slice(0, 160) : "request failed" };
  }
}

// ---------- CoinMarketCap: market quotes (CEX + DEX aggregate) and the BNB Chain DEX view ----------

export interface CmcQuote {
  price: number | null;
  volume24h: number | null;
  marketCap: number | null;
  marketPairs: number | null;
  lastUpdated: string | null;
}

export interface CmcDex {
  price: number | null;
  liquidityUsd: number | null;
  high24h: number | null;
  low24h: number | null;
}

export interface CmcRead {
  ok: boolean;
  configured: boolean;
  quotes: Record<number, CmcQuote>;
  dex: Record<string, CmcDex>;
  error?: string;
}

async function cmc(path: string, key: string) {
  const res = await fetch(`https://pro-api.coinmarketcap.com${path}`, {
    headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: { revalidate: CMC_REVALIDATE_S },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.status?.error_message ?? String(res.status));
  return body;
}

export async function readCmc(): Promise<CmcRead> {
  const key = process.env.CMC_API_KEY;
  if (!key) return { ok: false, configured: false, quotes: {}, dex: {} };
  const quotes: Record<number, CmcQuote> = {};
  const dex: Record<string, CmcDex> = {};
  const errors: string[] = [];

  try {
    const ids = BNB_STOCKS.map((s) => s.cmcId).join(",");
    const body = await cmc(`/v2/cryptocurrency/quotes/latest?id=${ids}`, key);
    for (const s of BNB_STOCKS) {
      const x = body.data?.[String(s.cmcId)];
      const q = x?.quote?.USD;
      quotes[s.cmcId] = {
        price: num(q?.price),
        volume24h: num(q?.volume_24h),
        marketCap: num(q?.market_cap),
        marketPairs: num(x?.num_market_pairs),
        lastUpdated: typeof q?.last_updated === "string" ? q.last_updated : null,
      };
    }
  } catch (e) {
    errors.push(`quotes: ${e instanceof Error ? e.message : "failed"}`);
  }

  await Promise.all(
    BNB_STOCKS.map(async (s) => {
      try {
        const body = await cmc(`/v1/dex/token?address=${s.token}&platform=bsc`, key);
        const d = body.data ?? {};
        dex[s.token] = { price: num(d.p), liquidityUsd: num(d.liqUsd), high24h: num(d.ph24h), low24h: num(d.pl24h) };
      } catch (e) {
        errors.push(`dex ${s.symbol}: ${e instanceof Error ? e.message : "failed"}`);
      }
    })
  );

  const ok = Object.keys(quotes).length > 0 || Object.keys(dex).length > 0;
  return { ok, configured: true, quotes, dex, error: errors.length ? errors.join("; ").slice(0, 300) : undefined };
}

// ---------- The real share price and US market hours (Markets' own warden snapshot) ----------

export interface Reference {
  ok: boolean;
  observedAt: string | null;
  session: { state: string | null; anchored: boolean; hoursToNextOpen: number | null; etTime: string | null };
  prices: Record<string, number>;
  error?: string;
}

/** The same reading lab-venue serves: data/wrd-state-xlayer.json, written by the warden on its timer. */
export async function readReference(): Promise<Reference> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(process.cwd(), "data/wrd-state-xlayer.json"), "utf8"));
    const prices: Record<string, number> = {};
    for (const l of Array.isArray(raw.legs) ? raw.legs : []) {
      const p = num(l?.realPrice);
      if (typeof l?.underlying === "string" && p != null) prices[l.underlying] = p;
    }
    return {
      ok: true,
      observedAt: typeof raw.observedAt === "string" ? raw.observedAt : null,
      session: {
        state: raw.session?.state ?? null,
        anchored: raw.session?.anchored === true,
        hoursToNextOpen: num(raw.session?.hoursToNextOpen),
        etTime: raw.session?.etTime ?? null,
      },
      prices,
    };
  } catch (e) {
    return {
      ok: false,
      observedAt: null,
      session: { state: null, anchored: false, hoursToNextOpen: null, etTime: null },
      prices: {},
      error: e instanceof Error ? e.message : "read failed",
    };
  }
}

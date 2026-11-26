// The tokenized stocks the cat judges on BNB Chain: bStocks, the same six stocks it already judges as
// xStocks on X Layer and Solana, plus Anthropic. Each one is read from three sources that must agree:
//   - Atlas Oracle (CoinMarketCap's oracle): an on-chain feed on BNB Chain, and signed prices by API;
//   - CoinMarketCap: the market quote, and the DEX view (price and pool liquidity on BNB Chain);
//   - the real share price and US market hours, from CoAgentic Markets' public feed.
// Feed ids are Atlas's (atlasoracle.io/feeds/<id>); CMC ids from /v2/cryptocurrency/quotes/latest.

export interface BnbStock {
  /** The real share's ticker, as the CoAgentic feed names it. */
  ticker: string;
  /** The token's symbol on BNB Chain. */
  symbol: string;
  name: string;
  /** Atlas Oracle feed id (decimal), BNB Chain <symbol>/USD. */
  atlasFeed: number;
  /** CoinMarketCap id. */
  cmcId: number;
  /** BEP-20 token on BNB Smart Chain. */
  token: `0x${string}`;
}

export const BNB_STOCKS: BnbStock[] = [
  { ticker: "NVDA", symbol: "NVDAB", name: "NVIDIA", atlasFeed: 934, cmcId: 40215, token: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436" },
  { ticker: "TSLA", symbol: "TSLAB", name: "Tesla", atlasFeed: 933, cmcId: 40214, token: "0x5b1910eaad6450e50f816082aa078c41f10c292f" },
  { ticker: "SPCX", symbol: "SPCXB", name: "SpaceX", atlasFeed: 938, cmcId: 40217, token: "0xbe9d156892e55e7154bcd3cb0fea677f9d3103e1" },
  { ticker: "MSTR", symbol: "MSTRB", name: "Strategy", atlasFeed: 939, cmcId: 40536, token: "0xe87afb3076aeb0f9b14e368de8145ae6a2826a14" },
  { ticker: "CRCL", symbol: "CRCLB", name: "Circle", atlasFeed: 936, cmcId: 40213, token: "0x80f3d493ebce97e343c53d29a137942416b4ffc0" },
  { ticker: "AAPL", symbol: "AAPLB", name: "Apple", atlasFeed: 979, cmcId: 40927, token: "0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a" },
];

/** Atlas Oracle's push-mode MultiFeed contract on BNB Smart Chain (open read). */
export const ATLAS_MULTIFEED_BSC = "0xeace519ebb14fb8404fa6ddd23c3b34abade44aa" as const;

/** Atlas feed id as the contracts key it: 4 bytes, big-endian. */
export const feedKey = (id: number) => `0x${id.toString(16).padStart(8, "0")}` as `0x${string}`;

// The cat's rules (the same lines it uses on the other chains).
/** A fair price is within this of the real share. */
export const MAX_PREMIUM_PCT = 1;
/** The three price sources must agree within this, or nobody can say what the token is worth. */
export const MAX_SOURCE_SPREAD_PCT = 1;
/** Pool liquidity below this is not a market anyone can get out of. */
export const MIN_EXIT_LIQUIDITY_USD = 50_000;
/** An oracle price older than this is old food. */
export const MAX_ORACLE_AGE_S = 300;
/** The real share reading older than this is stale. */
export const MAX_REFERENCE_AGE_MIN = 120;

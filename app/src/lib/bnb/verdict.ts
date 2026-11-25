// The cat's verdict on one tokenized stock on BNB Chain. Pure: readings in, verdict out.
// The same verdicts as on the other chains: REFUSE (not fair food), WAIT (can't be proven yet),
// WATCH (fair, checked, nothing more to say). HUNT needs the engine's trend call, which this lane
// doesn't have, so the best a bStock gets here is WATCH.

import {
  MAX_ORACLE_AGE_S,
  MAX_PREMIUM_PCT,
  MAX_REFERENCE_AGE_MIN,
  MAX_SOURCE_SPREAD_PCT,
  MIN_EXIT_LIQUIDITY_USD,
  type BnbStock,
} from "./stocks";

export type BnbVerdict = "REFUSE" | "WAIT" | "WATCH";

export interface Check {
  label: string;
  /** null = no reading (counts as not passed). */
  ok: boolean | null;
  detail: string;
  source: string;
}

export interface Readings {
  /** Atlas on-chain feed (BNB Smart Chain). */
  atlasPrice: number | null;
  atlasOnchainTs: number | null;
  /** Atlas signed API: consensus status, or null when the key isn't set. */
  atlasConsensus: string | null;
  cmcPrice: number | null;
  cmcVolume24h: number | null;
  dexPrice: number | null;
  dexLiquidityUsd: number | null;
  realPrice: number | null;
  referenceAgeMin: number | null;
  marketOpen: boolean;
  marketState: string | null;
  hoursToNextOpen: number | null;
  nowS: number;
}

export interface StockVerdict {
  verdict: BnbVerdict;
  reason: string;
  /** Token price (Atlas) vs the real share, in percent. */
  premiumPct: number | null;
  /** Widest gap between the three token prices (Atlas, CMC, DEX), in percent. */
  sourceSpreadPct: number | null;
  checks: Check[];
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}k`);

function spreadPct(prices: (number | null)[]): number | null {
  const ps = prices.filter((p): p is number => p != null && p > 0);
  if (ps.length < 2) return null;
  return ((Math.max(...ps) - Math.min(...ps)) / Math.min(...ps)) * 100;
}

const STATE_LABEL: Record<string, string> = {
  us_extended: "in extended hours",
  us_closed: "closed",
  us_weekend: "closed for the weekend",
  us_holiday: "closed for a holiday",
};

export function bnbVerdict(stock: BnbStock, r: Readings): StockVerdict {
  const atlasAge = r.atlasOnchainTs == null ? null : r.nowS - r.atlasOnchainTs;
  const premiumPct = r.atlasPrice != null && r.realPrice ? (r.atlasPrice / r.realPrice - 1) * 100 : null;
  const sourceSpreadPct = spreadPct([r.atlasPrice, r.cmcPrice, r.dexPrice]);
  const sourcesSeen = [r.atlasPrice, r.cmcPrice, r.dexPrice].filter((p) => p != null).length;

  const fresh = atlasAge != null && atlasAge <= MAX_ORACLE_AGE_S && r.referenceAgeMin != null && r.referenceAgeMin <= MAX_REFERENCE_AGE_MIN;
  const agree = sourceSpreadPct == null ? null : sourceSpreadPct <= MAX_SOURCE_SPREAD_PCT;
  const healthy = r.atlasConsensus == null ? null : r.atlasConsensus === "HEALTHY";
  const liquid = r.dexLiquidityUsd == null ? null : r.dexLiquidityUsd >= MIN_EXIT_LIQUIDITY_USD;
  const fair = premiumPct == null ? null : Math.abs(premiumPct) <= MAX_PREMIUM_PCT;

  const checks: Check[] = [
    {
      label: "Readings are fresh",
      ok: atlasAge == null || r.referenceAgeMin == null ? null : fresh,
      detail:
        atlasAge == null
          ? "no on-chain oracle reading"
          : `oracle ${atlasAge}s old (limit ${MAX_ORACLE_AGE_S}s) · real share ${r.referenceAgeMin ?? "?"} min old`,
      source: "Atlas on-chain feed · CoAgentic",
    },
    {
      label: "Price sources agree",
      ok: agree,
      detail: sourceSpreadPct == null ? `only ${sourcesSeen} of 3 prices` : `${sourcesSeen} prices within ${sourceSpreadPct.toFixed(2)}% (limit ${MAX_SOURCE_SPREAD_PCT}%)`,
      source: "Atlas · CMC quote · CMC DEX",
    },
    {
      label: "Oracle consensus",
      ok: healthy,
      detail: r.atlasConsensus == null ? "no signed reading" : r.atlasConsensus.toLowerCase().replace("_", " "),
      source: "Atlas signed API",
    },
    {
      label: "Exit liquidity",
      ok: liquid,
      detail:
        r.dexLiquidityUsd == null
          ? "no pool reading"
          : `${usd(r.dexLiquidityUsd)} in BNB Chain pools (min ${usd(MIN_EXIT_LIQUIDITY_USD)})${r.cmcVolume24h != null ? ` · ${usd(r.cmcVolume24h)} traded 24h` : ""}`,
      source: "CMC DEX · CMC quote",
    },
    {
      label: "Price is fair",
      ok: fair,
      detail: premiumPct == null ? "no real share price" : `${pct(premiumPct)} vs ${r.marketOpen ? "the real share" : "the last real price"} (limit ±${MAX_PREMIUM_PCT}%)`,
      source: "Atlas vs CoAgentic",
    },
    {
      label: "Fair price provable",
      ok: r.marketOpen,
      detail: r.marketOpen ? "real share is trading now" : `real share ${STATE_LABEL[r.marketState ?? ""] ?? "not trading"}; the token trades 24/7`,
      source: "CoAgentic market hours",
    },
  ];

  const out = (verdict: BnbVerdict, reason: string): StockVerdict => ({ verdict, reason, premiumPct, sourceSpreadPct, checks });

  if (!fresh) return out("REFUSE", "A reading is old or missing. Not eating old food.");
  if (agree === false) return out("REFUSE", `The price sources disagree by ${sourceSpreadPct!.toFixed(2)}%. Nobody can say what it's worth.`);
  if (healthy === false) return out("REFUSE", `The oracle's own consensus is ${r.atlasConsensus!.toLowerCase()}. No bite.`);
  if (liquid === false) return out("REFUSE", `Only ${usd(r.dexLiquidityUsd!)} in the pools. Too thin to get out.`);
  if (fair === false) return out("REFUSE", `Priced ${pct(premiumPct!)} away from the real share. Not fair food.`);
  if (agree == null || liquid == null || fair == null) return out("REFUSE", "A check is missing a reading. No proof, no bite.");
  if (!r.marketOpen) {
    const next = r.hoursToNextOpen != null ? ` Next live reference in ${r.hoursToNextOpen.toFixed(1)}h.` : "";
    return out("WAIT", `Trades 24/7, but the real share is ${STATE_LABEL[r.marketState ?? ""] ?? "not trading"}, so a fair price can't be proven yet.${next}`);
  }
  return out("WATCH", `Real, fairly priced (${pct(premiumPct!)}), sources agree, enough liquidity to get out. Fair food.`);
}

import { promises as fs } from "fs";
import path from "path";

// The index screen, applied to bStocks: the same rule that decides which xStocks the Steward book may hold
// (config/tei-constituents.json → screen). A token qualifies on a day if its BNB Chain pools hold at least
// min_liquidity_usd and its BNB Chain DEX volume over 24h is at least min_volume24h_usd. It becomes eligible
// for the index only after persistence_days qualifying days running, so one good reading isn't enough.
//
// History: one row per token per UTC day (the day's latest reading), in data/bnb-screen-history.json. Only the
// record timer writes it (every 10 min); the public feed reads it and adds today's live reading.

export interface ScreenRule {
  minLiquidityUsd: number;
  minVolume24hUsd: number;
  persistenceDays: number;
  source: string;
}

export interface DayRow {
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  qualified: boolean;
  at: string;
}

type History = Record<string, Record<string, DayRow>>; // symbol → UTC date → row

export type IndexStatus = "eligible" | "qualifying" | "below_screen" | "no_reading";

export interface IndexScreen {
  qualifiesToday: boolean | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  streakDays: number;
  persistenceDays: number;
  status: IndexStatus;
  summary: string;
  days: { date: string; qualified: boolean }[];
}

const HISTORY = path.join(process.cwd(), "data/bnb-screen-history.json");
const DEFAULT_RULE: ScreenRule = { minLiquidityUsd: 100_000, minVolume24hUsd: 10_000, persistenceDays: 3, source: "default" };

export async function readScreenRule(): Promise<ScreenRule> {
  try {
    const cfg = JSON.parse(await fs.readFile(path.join(process.cwd(), "config/tei-constituents.json"), "utf8"));
    const s = cfg?.screen ?? {};
    return {
      minLiquidityUsd: Number(s.min_liquidity_usd) || DEFAULT_RULE.minLiquidityUsd,
      minVolume24hUsd: Number(s.min_volume24h_usd) || DEFAULT_RULE.minVolume24hUsd,
      persistenceDays: Number(s.persistence_days) || DEFAULT_RULE.persistenceDays,
      source: `Steward index screen (${cfg?.version ?? "tei"})`,
    };
  } catch {
    return DEFAULT_RULE;
  }
}

async function readHistory(): Promise<History> {
  try {
    return JSON.parse(await fs.readFile(HISTORY, "utf8"));
  } catch {
    return {};
  }
}

const utcDate = (d: Date) => d.toISOString().slice(0, 10);
const prevDate = (date: string) => utcDate(new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000));

export function qualifies(rule: ScreenRule, liq: number | null, vol: number | null): boolean | null {
  if (liq == null || vol == null) return null;
  return liq >= rule.minLiquidityUsd && vol >= rule.minVolume24hUsd;
}

const usd = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n / 1e3)}k`);

function screenFor(rule: ScreenRule, days: Record<string, DayRow>, today: string, liq: number | null, vol: number | null): IndexScreen {
  const q = qualifies(rule, liq, vol);
  const merged: Record<string, boolean> = Object.fromEntries(Object.entries(days).map(([d, r]) => [d, r.qualified]));
  if (q != null) merged[today] = q;
  let streak = 0;
  for (let d = today; merged[d] === true; d = prevDate(d)) streak++;
  const status: IndexStatus = q == null ? "no_reading" : !q ? "below_screen" : streak >= rule.persistenceDays ? "eligible" : "qualifying";
  const summary =
    q == null
      ? "No pool reading right now."
      : !q
        ? `Below the index screen: ${liq! < rule.minLiquidityUsd ? `pools ${usd(liq!)} (min ${usd(rule.minLiquidityUsd)})` : `BNB Chain volume ${usd(vol!)} (min ${usd(rule.minVolume24hUsd)})`}.`
        : status === "eligible"
          ? `Index-eligible: cleared the screen ${streak} days running.`
          : `Clears the screen today; day ${streak} of ${rule.persistenceDays} before it's index-eligible.`;
  const recent = Object.keys(merged).sort().slice(-7);
  return {
    qualifiesToday: q,
    liquidityUsd: liq,
    volume24hUsd: vol,
    streakDays: streak,
    persistenceDays: rule.persistenceDays,
    status,
    summary,
    days: recent.map((date) => ({ date, qualified: merged[date] })),
  };
}

export interface ScreenInput {
  symbol: string;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
}

/** Today's screen for each token, from the stored days plus the live reading. Read-only. */
export async function screenAll(inputs: ScreenInput[], now = new Date()): Promise<{ rule: ScreenRule; bySymbol: Record<string, IndexScreen> }> {
  const [rule, history] = await Promise.all([readScreenRule(), readHistory()]);
  const today = utcDate(now);
  const bySymbol: Record<string, IndexScreen> = {};
  for (const i of inputs) bySymbol[i.symbol] = screenFor(rule, history[i.symbol] ?? {}, today, i.liquidityUsd, i.volume24hUsd);
  return { rule, bySymbol };
}

/** Store today's reading for each token (the record timer calls this). Keeps the last 60 days. */
export async function storeScreenDay(inputs: ScreenInput[], now = new Date()): Promise<void> {
  const [rule, history] = await Promise.all([readScreenRule(), readHistory()]);
  const today = utcDate(now);
  for (const i of inputs) {
    const q = qualifies(rule, i.liquidityUsd, i.volume24hUsd);
    if (q == null) continue;
    const days = (history[i.symbol] ??= {});
    days[today] = { liquidityUsd: i.liquidityUsd, volume24hUsd: i.volume24hUsd, qualified: q, at: now.toISOString() };
    for (const d of Object.keys(days).sort().slice(0, -60)) delete days[d];
  }
  const tmp = `${HISTORY}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(history));
  await fs.rename(tmp, HISTORY);
}

import { promises as fs } from "fs";
import path from "path";

// What the Steward book's Council already thinks about each bStock's underlying share. The Council deliberates
// about the market (the stock), not the wrapper, so its read applies whichever token holds the share. The book
// holds the same six shares as xStocks on X Layer; this reads its existing outputs and maps each bStock to its
// xStock. Read-only: nothing here trades, and the Council has made no decision about BNB Chain.

export interface CouncilLeg {
  inBook: boolean;
  bookSymbol: string;
  weightPct: number | null;
  plan: "BUY" | "SELL" | "HOLD" | null;
  planUsd: number | null;
  entry: { release: boolean; why: string | null } | null;
  phase: { phase: string; bearing: string; widthPct: number | null } | null;
  risks: string[];
}

export interface CouncilView {
  ok: boolean;
  asof: string | null;
  model: string | null;
  stance: string | null;
  confidence: string | null;
  synthesis: string | null;
  /** The debate itself: each agent's case. */
  debate: { bull: string | null; bear: string | null; risk: string | null };
  gate: { decision: string | null; rationale: string[]; asof: string | null };
  phasesAsof: string | null;
  bySymbol: Record<string, CouncilLeg>;
  note: string;
}

async function readJson(rel: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), rel), "utf8"));
  } catch {
    return null;
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function readCouncil(stocks: { symbol: string; ticker: string }[]): Promise<CouncilView> {
  const [state, nav, delib] = await Promise.all([
    readJson("data/tei-state.json"),
    readJson("data/tei-nav.json"),
    readJson("data/tei-deliberation.json"),
  ]);
  const constituents: any[] = Array.isArray(state?.constituents) ? state.constituents : [];
  const swaps: any[] = Array.isArray(state?.swaps) ? state.swaps : [];
  const entryLegs: any[] = Array.isArray(state?.entry?.legs) ? state.entry.legs : [];
  const keyRisks: string[] = Array.isArray(delib?.key_risks) ? delib.key_risks.filter((r: unknown) => typeof r === "string") : [];

  const bySymbol: Record<string, CouncilLeg> = {};
  for (const s of stocks) {
    const x = `${s.ticker}x`;
    const c = constituents.find((k) => k?.symbol === x);
    const sw = swaps.find((k) => k?.symbol === x);
    const en = entryLegs.find((k) => k?.symbol === x);
    const ph = nav?.phases?.[x];
    bySymbol[s.symbol] = {
      inBook: !!c,
      bookSymbol: x,
      weightPct: num(c?.weightPct),
      plan: sw?.side === "BUY" || sw?.side === "SELL" ? sw.side : c ? "HOLD" : null,
      planUsd: num(sw?.usd),
      entry: en ? { release: en.release === true, why: typeof en.why === "string" ? en.why : null } : null,
      phase: ph ? { phase: String(ph.phase), bearing: String(ph.bearing), widthPct: num(ph.widthPct) } : null,
      risks: keyRisks.filter((r) => r.includes(x) || new RegExp(`\\b${s.ticker}\\b`).test(r)),
    };
  }

  return {
    ok: !!(state || delib),
    asof: typeof delib?.asof === "string" ? delib.asof : null,
    model: typeof delib?.model === "string" ? delib.model : null,
    stance: typeof delib?.stance === "string" ? delib.stance : null,
    confidence: typeof delib?.confidence === "string" ? delib.confidence : null,
    synthesis: typeof delib?.synthesis === "string" ? delib.synthesis : null,
    debate: {
      bull: typeof delib?.bull === "string" ? delib.bull : null,
      bear: typeof delib?.bear === "string" ? delib.bear : null,
      risk: typeof delib?.risk === "string" ? delib.risk : null,
    },
    gate: {
      decision: typeof state?.verdict?.decision === "string" ? state.verdict.decision : null,
      rationale: Array.isArray(state?.verdict?.rationale) ? state.verdict.rationale.filter((r: unknown) => typeof r === "string") : [],
      asof: typeof state?.asof === "string" ? state.asof : null,
    },
    phasesAsof: typeof nav?.asof === "string" ? nav.asof : null,
    bySymbol,
    note: "The Steward book's Council on the underlying shares (held there as X Layer xStocks). Advisory; the deterministic gate governs the book. It has made no decision about BNB Chain tokens.",
  };
}

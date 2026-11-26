"use client";

import { useEffect, useState } from "react";

// /bnb: the cat on BNB Chain's tokenized stocks. Catfooding is the client: the readings, verdicts and on-chain
// attestations come from CoAgentic Markets (tv.coagentic.markets/api/public/bnb). Public, read-only, every 30 s.

type Verdict = "REFUSE" | "WAIT" | "WATCH";
interface Check { label: string; ok: boolean | null; detail: string; source: string }
interface Stock {
  ticker: string; symbol: string; name: string; atlasFeed: number; token: string;
  verdict: Verdict; reason: string; premiumPct: number | null; sourceSpreadPct: number | null; checks: Check[];
  readings: {
    atlasPrice: number | null; cmcPrice: number | null; dexPrice: number | null; realPrice: number | null;
    dexLiquidityUsd: number | null; cmcVolume24h: number | null; atlasConsensus: string | null;
  };
  links: { atlasFeed: string; cmc: string; token: string };
  /** While the real share is closed: drift from the last real price and the open risk (a reading, never a verdict). */
  offHours?: { driftPct: number | null; lastRealPrice: number | null; openRisk: "low" | "elevated" | "high" | null; hoursToNextOpen: number | null } | null;
}
interface Data {
  ok: boolean; observedAt: string;
  session: { state: string | null; anchored: boolean; hoursToNextOpen: number | null; etTime: string | null };
  sources: {
    atlasOnchain: { ok: boolean; contract: string; block: number | null; error?: string };
    atlasSigned: { ok: boolean; configured: boolean; error?: string };
    cmc: { ok: boolean; configured: boolean; error?: string };
    reference: { ok: boolean; observedAt: string | null; error?: string };
  };
  stocks: Stock[];
  verdictsContract: Contract | null;
}
interface Contract { address: string; chain: string; explorer: string }
interface Recorded {
  symbol: string; verdict: Verdict; recordedAt: number; oracleTimestamp: number; premiumBps: number;
  failedChecks: number; oraclePrice: number; realPrice: number; count: number;
}

/** The latest verdict per stock as the CatVerdicts contract holds it, with the price it verified itself. */
function OnChain({ contract }: { contract: Contract | null }) {
  const [rows, setRows] = useState<Recorded[] | null>(null);
  useEffect(() => {
    if (!contract) return;
    let live = true;
    const load = () =>
      fetch("/api/bnb/record", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => live && setRows(d.recorded ?? []))
        .catch(() => live && setRows([]));
    load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [contract]);

  return (
    <div className="chunky-border-acid bg-ink-raised rounded-2xl p-4">
      <h2 className="font-display text-lg font-bold">Recorded on-chain</h2>
      <p className="mt-1 text-sm">
        Every 10 minutes CoAgentic Markets writes its verdicts to a contract on BNB Chain testnet, each next to Atlas&apos;s signed price for the token.
        The contract checks Atlas&apos;s signature and the price&apos;s age itself, works out the gap to the real share, and refuses a
        &ldquo;fair&rdquo; verdict that the verified price contradicts.
      </p>
      {!contract ? (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">Contract not deployed yet.</p>
      ) : (
        <>
          <a href={contract.explorer} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all font-mono text-[11px] underline decoration-dotted hover:text-[var(--acid)]">
            CatVerdicts {contract.address} · {contract.chain}
          </a>
          {rows == null ? (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">Reading…</p>
          ) : rows.length === 0 ? (
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full font-mono text-[11px]">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-normal">Token</th>
                    <th className="py-1 pr-3 font-normal">Verdict</th>
                    <th className="py-1 pr-3 font-normal">Verified price</th>
                    <th className="py-1 pr-3 font-normal">Real share</th>
                    <th className="py-1 pr-3 font-normal">Gap</th>
                    <th className="py-1 pr-3 font-normal">Recorded</th>
                    <th className="py-1 font-normal">Times</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.symbol} className="border-t border-border">
                      <td className="py-1 pr-3">{r.symbol}</td>
                      <td className="py-1 pr-3">{STYLE[r.verdict].icon} {r.verdict}</td>
                      <td className="py-1 pr-3">{price(r.oraclePrice)}</td>
                      <td className="py-1 pr-3">{price(r.realPrice)}</td>
                      <td className="py-1 pr-3">{pct(r.premiumBps / 100)}</td>
                      <td className="py-1 pr-3">{new Date(r.recordedAt * 1000).toLocaleTimeString()}</td>
                      <td className="py-1">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const STYLE: Record<Verdict, { icon: string; chip: string; pose: string }> = {
  REFUSE: { icon: "🙅", chip: "border-[var(--bad)]/60 bg-[var(--bad)]/10 text-[#ff9d9d]", pose: "refuse" },
  WAIT: { icon: "⏳", chip: "border-[var(--warn)]/60 bg-[var(--warn)]/10 text-[var(--warn)]", pose: "waiting" },
  WATCH: { icon: "👀", chip: "border-[var(--good)]/60 bg-[var(--good)]/10 text-[var(--good)]", pose: "watch" },
};
const MARKET_STATE: Record<string, string> = {
  off_hours: "closed for the night",
  us_extended: "in extended hours",
  us_closed: "closed",
  us_weekend: "closed for the weekend",
  us_holiday: "closed for a holiday",
  holiday: "closed for a holiday",
  weekend: "closed for the weekend",
};
const mark = (ok: boolean | null) => (ok == null ? "·" : ok ? "✓" : "✕");
const markColor = (ok: boolean | null) => (ok == null ? "text-muted-foreground" : ok ? "text-[var(--good)]" : "text-[#ff9d9d]");
const price = (v: number | null) => (v == null ? "—" : `$${v.toFixed(2)}`);
const pct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);

function catPose(stocks: Stock[], session?: Data["session"]): { pose: string; line: string } {
  const n = (v: Verdict) => stocks.filter((s) => s.verdict === v).length;
  const refused = n("REFUSE");
  const waiting = n("WAIT");
  const closed = MARKET_STATE[session?.state ?? ""] ?? "closed";
  if (n("WATCH")) return { pose: "watch", line: `${n("WATCH")} of ${stocks.length} pass every check. Fair food.` };
  if (refused && waiting)
    return {
      pose: refused >= waiting ? "refuse" : "waiting",
      line: `Refusing ${refused} of ${stocks.length}. The other ${waiting} pass every check but one: the real shares are ${closed}, so there's no live price to prove them fair yet.`,
    };
  if (waiting) return { pose: "waiting", line: `All ${waiting} pass every check but one: the real shares are ${closed}, so there's no live price to prove them fair yet.` };
  if (stocks.length) return { pose: "refuse", line: `Refusing all ${stocks.length} right now.` };
  return { pose: "sleep", line: "No readings yet." };
}

function Source({ ok, label, detail, href }: { ok: boolean | null; label: string; detail: string; href?: string }) {
  const body = (
    <>
      <span className={markColor(ok)}>{mark(ok)}</span> <span className="text-foreground">{label}</span>
      <span className="block text-muted-foreground">{detail}</span>
    </>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="block rounded-lg border border-border bg-ink p-2 hover:border-[var(--acid)]">{body}</a>
  ) : (
    <div className="rounded-lg border border-border bg-ink p-2">{body}</div>
  );
}

function StockCard({ s }: { s: Stock }) {
  const st = STYLE[s.verdict];
  const r = s.readings;
  return (
    <div className="chunky-border-acid bg-ink-raised rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-lg font-bold">{s.symbol}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{s.name} · real share {s.ticker}</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-xs ${st.chip}`}>{st.icon} {s.verdict}</span>
      </div>
      <p className="mt-2 text-sm">{s.reason}</p>
      <div className="mt-3 grid grid-cols-4 gap-1 font-mono text-[11px]">
        {[
          ["Real share", price(r.realPrice)],
          ["Atlas", price(r.atlasPrice)],
          ["CMC", price(r.cmcPrice)],
          ["DEX", price(r.dexPrice)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-border bg-ink px-1.5 py-1">
            <div className="text-muted-foreground">{k}</div>
            <div>{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 font-mono text-[11px] text-muted-foreground">
        gap to real {pct(s.premiumPct)} · sources within {s.sourceSpreadPct == null ? "—" : `${s.sourceSpreadPct.toFixed(2)}%`}
      </div>
      {s.offHours && s.offHours.driftPct != null && (
        <div className="mt-1 font-mono text-[11px] text-[var(--warn)]">
          market closed: {pct(s.offHours.driftPct)} since the last real price {price(s.offHours.lastRealPrice)}
          {s.offHours.openRisk ? ` · open risk ${s.offHours.openRisk}` : ""}
        </div>
      )}
      <ul className="mt-3 space-y-1 font-mono text-[11px]">
        {s.checks.map((c) => (
          <li key={c.label} className="flex gap-2">
            <span className={`w-3 shrink-0 ${markColor(c.ok)}`}>{mark(c.ok)}</span>
            <span>
              <span className="text-foreground">{c.label}</span> <span className="text-muted-foreground">· {c.detail}</span>
              <span className="block text-[10px] text-muted-foreground/70">{c.source}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-3 font-mono text-[10px]">
        <a className="underline decoration-dotted hover:text-[var(--acid)]" href={s.links.atlasFeed} target="_blank" rel="noreferrer">Atlas feed {s.atlasFeed}</a>
        <a className="underline decoration-dotted hover:text-[var(--acid)]" href={s.links.cmc} target="_blank" rel="noreferrer">CoinMarketCap</a>
        <a className="underline decoration-dotted hover:text-[var(--acid)]" href={s.links.token} target="_blank" rel="noreferrer">Token on BscScan</a>
      </div>
    </div>
  );
}

export default function BnbPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/bnb", { cache: "no-store" })
        .then((res) => res.json() as Promise<Data>)
        .then((d) => {
          if (!live) return;
          setData(d);
          setError(d.ok ? null : "Some sources didn't answer. Showing what came back.");
        })
        .catch(() => live && setError("Couldn't reach the readings. Trying again shortly."));
    load();
    const t = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const stocks = data?.stocks ?? [];
  const cat = catPose(stocks, data?.session);
  const src = data?.sources;
  const session = data?.session;

  return (
    <div className="room-skin min-h-screen px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between font-mono text-xs">
          <a href="https://catfooding.com" className="hover:text-[var(--acid)]">← Catfooding</a>
          <span className="text-muted-foreground">BNB Chain · tokenized stocks</span>
        </div>

        <div className="chunky-border-acid bg-ink-raised flex flex-col items-center gap-4 rounded-2xl p-5 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/cat/${cat.pose}.gif`} alt={`The cat: ${cat.pose}`} width={176} height={176} style={{ imageRendering: "pixelated" }} />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold">Is it fair food?</h1>
            <p className="mt-1 text-sm">
              The cat reads CoAgentic Markets&apos; checks on tokenized US stocks on BNB Chain. Three independent prices must agree,
              the pools must be deep enough to get out, and the price must sit within 1% of the real share while that share is trading.
            </p>
            <p className="mt-2 font-display text-lg">{cat.line}</p>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {session ? (session.anchored ? "US market open: the real share is a live reference." : `US market ${MARKET_STATE[session.state ?? ""] ?? "closed"} (${session.etTime ?? ""} ET)`) : "…"}
              {data ? ` · read ${new Date(data.observedAt).toLocaleTimeString()}` : ""}
            </p>
          </div>
        </div>

        {src && (
          <div className="grid gap-2 font-mono text-[11px] sm:grid-cols-4">
            <Source
              ok={src.atlasOnchain.ok}
              label="Atlas Oracle, on-chain"
              detail={src.atlasOnchain.ok ? `BNB Chain feed contract, block ${src.atlasOnchain.block?.toLocaleString()}` : src.atlasOnchain.error ?? "no reading"}
              href={`https://bscscan.com/address/${src.atlasOnchain.contract}#readContract`}
            />
            <Source
              ok={src.atlasSigned.configured ? src.atlasSigned.ok : null}
              label="Atlas Oracle, signed"
              detail={src.atlasSigned.configured ? (src.atlasSigned.ok ? "consensus health per feed" : src.atlasSigned.error ?? "no reading") : "not connected yet"}
            />
            <Source
              ok={src.cmc.configured ? src.cmc.ok : null}
              label="CoinMarketCap"
              detail={src.cmc.configured ? (src.cmc.ok ? "market quote + BNB Chain DEX pools" : src.cmc.error ?? "no reading") : "not connected"}
            />
            <Source
              ok={src.reference.ok}
              label="Real share + market hours"
              detail={src.reference.ok ? "CoAgentic Markets" : src.reference.error ?? "no reading"}
              href="https://coagentic.markets"
            />
          </div>
        )}

        {error && <p className="font-mono text-xs text-[var(--warn)]">{error}</p>}

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {stocks.map((s) => (
            <StockCard key={s.symbol} s={s} />
          ))}
        </div>

        <OnChain contract={data?.verdictsContract ?? null} />

        <p className="font-mono text-[10px] text-muted-foreground">
          Readings, not advice. The cat places no trades here. Engine: CoAgentic Markets, reading the Atlas Oracle feed on BNB Smart Chain, Atlas&apos;s signed prices and the CoinMarketCap Pro API.
        </p>
      </div>
    </div>
  );
}

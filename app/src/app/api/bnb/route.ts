import { NextResponse } from "next/server";

// GET /api/bnb: the BNB Chain lane as the cat sees it. Catfooding is a client here: CoAgentic Markets reads Atlas
// Oracle and CoinMarketCap, checks the tokenized stocks against the real share, gives the verdicts and attests them
// on BNB Chain (tv.coagentic.markets/api/public/bnb). This route reads that public feed server-side (it sends no
// CORS header) and passes it on, with the attestation contract where the page expects it.

const FEED_BASE = process.env.COAGENTIC_FEED_BASE ?? "https://tv.coagentic.markets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${FEED_BASE}/api/public/bnb`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const feed = await res.json();
    return NextResponse.json(
      { ...feed, verdictsContract: feed.attestation?.contract ?? null },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "CoAgentic Markets didn't answer. Try again in a minute.", stocks: [], verdictsContract: null },
      { status: 503, headers: { "Cache-Control": "public, s-maxage=15" } }
    );
  }
}

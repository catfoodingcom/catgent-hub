import { NextResponse } from "next/server";

// GET /api/bnb/record: what CoAgentic Markets has attested on BNB Chain testnet (CatVerdicts), from its public feed.
// The engine records a batch every 10 minutes on its own timer; the cat only reads.

const FEED_BASE = process.env.COAGENTIC_FEED_BASE ?? "https://tv.coagentic.markets";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${FEED_BASE}/api/public/bnb`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const feed = await res.json();
    return NextResponse.json(
      { ok: true, contract: feed.attestation?.contract ?? null, recorded: feed.attestation?.recorded ?? [] },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch {
    return NextResponse.json({ ok: false, contract: null, recorded: [] }, { status: 503 });
  }
}

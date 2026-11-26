// GET /api/public/bnb: CoAgentic Markets' BNB Chain lane. Tokenized US stocks on BNB Chain (bStocks), each read
// from Atlas Oracle (on-chain feed + signed API) and CoinMarketCap (quote + DEX pools), checked against the real
// share and US market hours, with a verdict (REFUSE / WAIT / WATCH) and every reading behind it, plus what the
// engine has attested on BNB Chain testnet (CatVerdicts). Clients such as Catfooding's cat read this.
// Read-only, no keys in the response, no trading.
import { takeSnapshot } from "@/lib/bnb/snapshot";
import { readRecorded, verdictsContract } from "@/lib/bnb/record";

export const dynamic = "force-dynamic";

export async function GET() {
  const [{ signed: _signed, ...snapshot }, recorded] = await Promise.all([takeSnapshot(), readRecorded().catch(() => null)]);
  void _signed;
  return Response.json(
    { ...snapshot, engine: "CoAgentic Markets", attestation: { contract: verdictsContract(), recorded } },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
  );
}

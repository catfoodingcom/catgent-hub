import { NextResponse } from "next/server";
import { takeSnapshot } from "@/lib/bnb/snapshot";
import { verdictsContract } from "@/lib/bnb/record";

// GET /api/bnb: the cat's verdicts on tokenized stocks on BNB Chain, with every reading behind them.
// Public and read-only: no sign-in, no keys in the response, nothing here can move funds.
// Shared at the CDN for 30 s, so a busy page doesn't spend the CoinMarketCap budget.

export const dynamic = "force-dynamic";

export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signed, ...snapshot } = await takeSnapshot();
  return NextResponse.json(
    { ...snapshot, verdictsContract: verdictsContract() },
    { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
  );
}

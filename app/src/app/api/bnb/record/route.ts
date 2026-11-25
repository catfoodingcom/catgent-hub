import { NextResponse } from "next/server";
import { recordVerdicts, readRecorded, verdictsContract } from "@/lib/bnb/record";

// GET /api/bnb/record: what's recorded on-chain (public).
// POST /api/bnb/record (or GET from Vercel Cron): record a fresh batch. Needs CRON_SECRET as a bearer
// token; without the secret set, recording is off, so nobody can spend the attester's gas.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (authorized(req)) return NextResponse.json(await recordVerdicts(), { headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json(
      { ok: true, contract: verdictsContract(), recorded: await readRecorded() },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, contract: verdictsContract(), recorded: [], error: e instanceof Error ? e.message.slice(0, 160) : "read failed" }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  return NextResponse.json(await recordVerdicts({ force }), { headers: { "Cache-Control": "no-store" } });
}

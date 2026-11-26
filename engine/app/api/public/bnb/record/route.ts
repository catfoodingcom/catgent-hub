// POST /api/public/bnb/record: attest a fresh batch of BNB Chain verdicts on BNB Smart Chain testnet.
// Called by the engine server's coagentic-bnb-record.timer every 10 minutes with BNB_RECORD_SECRET; refused without it, so
// nobody else can spend the attester's gas. Skips if the last batch is under 10 minutes old (?force=1 overrides).
import { recordVerdicts } from "@/lib/bnb/record";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.BNB_RECORD_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ ok: false, error: "Not allowed." }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  return Response.json(await recordVerdicts({ force }), { headers: { "Cache-Control": "no-store" } });
}

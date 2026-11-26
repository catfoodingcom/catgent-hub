import { concat, createPublicClient, createWalletClient, encodeFunctionData, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";
import { BNB_STOCKS, MAX_PREMIUM_PCT, feedKey } from "./stocks";
import { takeSnapshot } from "./snapshot";
import { storeScreenDay } from "./screen";

// CoAgentic Markets attests its BNB Chain verdicts on BNB Smart Chain testnet (CatVerdicts), each next to Atlas's
// signed price, which the contract verifies itself. The attester key is a testnet-only key kept on the engine.

const RPC = process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-rpc.publicnode.com";
/** Don't record again within this long (each record costs testnet gas, and verdicts don't move that fast). */
export const MIN_RECORD_INTERVAL_S = 10 * 60;

export const VERDICT_CODE = { REFUSE: 0, WAIT: 1, WATCH: 2 } as const;
const CODE_VERDICT = ["REFUSE", "WAIT", "WATCH"] as const;

export const catVerdictsAbi = [
  {
    type: "function",
    name: "recordBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "feedIds", type: "bytes4[]" },
      { name: "verdicts", type: "uint8[]" },
      { name: "realPrices", type: "uint256[]" },
      { name: "failedChecks", type: "uint16[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "latest",
    stateMutability: "view",
    inputs: [{ name: "feedId", type: "bytes4" }],
    outputs: [
      { name: "verdict", type: "uint8" },
      { name: "recordedAt", type: "uint64" },
      { name: "oracleTimestamp", type: "uint64" },
      { name: "premiumBps", type: "int32" },
      { name: "failedChecks", type: "uint16" },
      { name: "oraclePrice", type: "uint256" },
      { name: "realPrice", type: "uint256" },
    ],
  },
  { type: "function", name: "count", stateMutability: "view", inputs: [{ name: "feedId", type: "bytes4" }], outputs: [{ type: "uint256" }] },
] as const;

export function verdictsContract() {
  const address = (process.env.CAT_VERDICTS_ADDRESS || "0x0768597770EDF130B59a9661495d1cbAF8904bB4") as Hex;
  return { address, chainId: bscTestnet.id, chain: "BNB Smart Chain testnet", explorer: `https://testnet.bscscan.com/address/${address}` };
}

const client = createPublicClient({ chain: bscTestnet, transport: http(RPC, { timeout: 10_000 }) });

export interface RecordedVerdict {
  symbol: string;
  verdict: (typeof CODE_VERDICT)[number];
  recordedAt: number;
  oracleTimestamp: number;
  premiumBps: number;
  failedChecks: number;
  oraclePrice: number;
  realPrice: number;
  count: number;
}

/** What the contract holds now: the latest verdict per stock. */
export async function readRecorded(): Promise<RecordedVerdict[]> {
  const c = verdictsContract();
  if (!c) return [];
  const out: RecordedVerdict[] = [];
  for (const s of BNB_STOCKS) {
    const [l, n] = await Promise.all([
      client.readContract({ address: c.address, abi: catVerdictsAbi, functionName: "latest", args: [feedKey(s.atlasFeed)] }),
      client.readContract({ address: c.address, abi: catVerdictsAbi, functionName: "count", args: [feedKey(s.atlasFeed)] }),
    ]);
    if (Number(n) === 0) continue;
    out.push({
      symbol: s.symbol,
      verdict: CODE_VERDICT[l[0]] ?? "REFUSE",
      recordedAt: Number(l[1]),
      oracleTimestamp: Number(l[2]),
      premiumBps: l[3],
      failedChecks: l[4],
      oraclePrice: Number(l[5]) / 1e18,
      realPrice: Number(l[6]) / 1e18,
      count: Number(n),
    });
  }
  return out;
}

const toE18 = (v: number) => BigInt(Math.round(v * 1e6)) * BigInt(1e12);

export type RecordResult =
  | { ok: true; txHash: Hex; recorded: { symbol: string; verdict: string; premiumPct: number }[]; explorer: string }
  | { ok: false; skipped?: boolean; error: string };

/** The attester key as pasted into a dashboard: tolerate quotes, spaces and a missing 0x. */
function attesterKey(): Hex | undefined {
  const raw = process.env.CAT_ATTESTER_KEY?.trim().replace(/^["']|["']$/g, "").trim();
  if (!raw) return undefined;
  const hex = raw.startsWith("0x") || raw.startsWith("0X") ? raw.slice(2) : raw;
  return /^[0-9a-fA-F]{64}$/.test(hex) ? (`0x${hex}` as Hex) : undefined;
}

/** Take a fresh reading and record every stock that has a real share price, in one transaction. */
export async function recordVerdicts({ force = false } = {}): Promise<RecordResult> {
  const c = verdictsContract();
  const key = attesterKey();
  if (!c) return { ok: false, error: "Recording isn't set up (contract address missing)." };
  if (!key) return { ok: false, error: "Recording isn't set up (attester key missing, or not 64 hex characters)." };

  if (!force) {
    const recorded = await readRecorded().catch(() => []);
    const last = Math.max(0, ...recorded.map((r) => r.recordedAt));
    if (Date.now() / 1000 - last < MIN_RECORD_INTERVAL_S) return { ok: false, skipped: true, error: "Recorded less than 10 minutes ago." };
  }

  const snap = await takeSnapshot();
  // The index screen's daily history rides on the same 10-minute reading (no extra API calls).
  await storeScreenDay(
    snap.stocks.map((s) => ({ symbol: s.symbol, liquidityUsd: s.readings.dexLiquidityUsd, volume24hUsd: s.readings.dexVolume24hUsd })),
  ).catch(() => undefined);
  const sg = snap.signed;
  if (!sg.ok || !sg.payload || !sg.signature || !sg.magicMarker) return { ok: false, error: `No signed Atlas price: ${sg.error ?? "not configured"}` };

  const rows = snap.stocks.flatMap((s) => {
    const real = s.readings.realPrice;
    const signedPrice = sg.feeds[s.atlasFeed]?.price;
    if (real == null || signedPrice == null) return [];
    let failed = 0;
    s.checks.forEach((ch, i) => {
      if (ch.ok !== true) failed |= 1 << i;
    });
    // The contract re-checks the price rule against the signed price; hold the verdict to it here too,
    // so one moved price can't make the whole batch revert.
    const signedPremiumPct = (signedPrice / real - 1) * 100;
    let verdict = s.verdict;
    if (verdict === "WATCH" && (Math.abs(signedPremiumPct) > MAX_PREMIUM_PCT || failed !== 0)) verdict = "REFUSE";
    return [{ symbol: s.symbol, feed: feedKey(s.atlasFeed), verdict, real, failed, signedPremiumPct }];
  });
  if (!rows.length) return { ok: false, error: "No stock had both a real share price and a signed oracle price." };

  const data = encodeFunctionData({
    abi: catVerdictsAbi,
    functionName: "recordBatch",
    args: [rows.map((r) => r.feed), rows.map((r) => VERDICT_CODE[r.verdict]), rows.map((r) => toE18(r.real)), rows.map((r) => r.failed)],
  });
  // Atlas's package rides at the end of the calldata: [packages][count][signature][marker].
  const calldata = concat([data, sg.payload as Hex, sg.signature as Hex, sg.magicMarker as Hex]);

  try {
    const account = privateKeyToAccount(key);
    const wallet = createWalletClient({ account, chain: bscTestnet, transport: http(RPC, { timeout: 15_000 }) });
    const gas = await client.estimateGas({ account, to: c.address, data: calldata });
    const txHash = await wallet.sendTransaction({ to: c.address, data: calldata, gas: (gas * BigInt(13)) / BigInt(10) });
    await client.waitForTransactionReceipt({ hash: txHash, timeout: 45_000 });
    return {
      ok: true,
      txHash,
      recorded: rows.map((r) => ({ symbol: r.symbol, verdict: r.verdict, premiumPct: Math.round(r.signedPremiumPct * 100) / 100 })),
      explorer: `https://testnet.bscscan.com/tx/${txHash}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.split("\n")[0].slice(0, 240) : "send failed" };
  }
}

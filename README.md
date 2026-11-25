# Is it fair food? A cat that checks tokenized stocks on BNB Chain

Tokenized US stocks trade 24/7 on BNB Chain. This cat checks each one against the real share before anyone buys:
- Do three independent prices agree?
- Is the oracle's own consensus healthy?
- Is there enough liquidity to sell again?
- Is the price within 1% of the real share, and is that share trading?

It answers **REFUSE**, **WAIT** or **WATCH**, and shows every check behind the answer. Then it records the verdicts on BNB Chain next to an oracle price that the contract verifies itself.

**Live:** https://preview.catfooding.com/bnb
**Contract (BNB Smart Chain testnet):** [`CatVerdicts` 0x0768597770EDF130B59a9661495d1cbAF8904bB4](https://testnet.bscscan.com/address/0x0768597770EDF130B59a9661495d1cbAF8904bB4)
**Built for:** BNB Bangkok hackathon (25–27 Nov 2026), Developer Track and the CoinMarketCap × Atlas Challenge. Write-up: [docs/WRITEUP.md](docs/WRITEUP.md).

## How it works

| Source | What the cat reads | Used for |
|---|---|---|
| **Atlas Oracle, on-chain** | the MultiFeed contract on BNB Smart Chain (`0xeace…44aa`, `fetchBatch`) | the token's price, read from the chain |
| **Atlas Oracle, signed API** | `POST /report/v1/price/latest` | consensus health (HEALTHY / DEGRADED…), and the signed prices the contract verifies |
| **CoinMarketCap Pro API** | `/v2/cryptocurrency/quotes/latest` | the market price, 24h volume and market cap |
| **CoinMarketCap DEX API** | `/v1/dex/token?platform=bsc` | the DEX price and pool liquidity on BNB Chain |
| **CoAgentic Markets** (public feed) | real share price and US market hours | the fairness reference |

The tokens are bStocks on BNB Smart Chain: NVDAB, TSLAB, SPCXB, MSTRB, CRCLB and AAPLB (Atlas feeds 934, 933, 938, 939, 936 and 979).

**The rules** (`app/src/lib/bnb/verdict.ts`):
- **REFUSE** if any of these hold:
  - a reading is old;
  - the three token prices differ by more than 1%;
  - Atlas reports anything but HEALTHY;
  - the pools hold less than $50k;
  - the price is more than 1% away from the real share.
- **WAIT** if all of that passes but the real share isn't trading, so a fair price can't be proven.
- **WATCH** if every check passes.

### On-chain: `CatVerdicts`

`contracts/src/CatVerdicts.sol` builds on [Atlas's pull-oracle consumer](https://github.com/oracle-atlas/pull-oracle-consumer):
- The app appends Atlas's signed price package to the transaction's calldata.
- The contract **recovers the signer** and accepts only Atlas's official key, `0x59eD…C600`.
- It **rejects stale prices** (over 5 minutes old).
- It works out the gap to the real share on-chain.
- It **refuses a WATCH ("fair") verdict that the verified price contradicts.** The cat can't claim more than the oracle supports.

Each record stores the verdict, the verified price and its timestamp, the real share price, the gap in basis points, and which checks failed. Only the cat's attester key can record. The owner can rotate Atlas's signer and change the rule. The contract holds no funds.

The real share price is the cat's input: US stocks have no on-chain feed here. The token price is not an input; the contract verifies it.

## Run it

**The app** (Next.js):

```bash
cd app
cp .env.example .env    # add CMC_API_KEY and ATLAS_API_KEY
npm install
npm run dev             # http://localhost:3000/bnb
```

- Without keys, the page still runs on the Atlas on-chain feed and marks the other sources as not connected.
- To record verdicts on-chain, set `CAT_ATTESTER_KEY` (a testnet key) and `CRON_SECRET`, then:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/bnb/record
```

- `GET /api/bnb` returns every reading and verdict as JSON. `GET /api/bnb/record` returns what the contract holds.
- API keys stay server-side and never reach the browser.

**The contract** (Foundry):

```bash
git submodule update --init --recursive
cd contracts
forge test                                   # 10 tests: signatures, staleness, tampering, the price rule
BNB_TEST_KEY=0x... forge script script/DeployCatVerdicts.s.sol --rpc-url bsc_testnet --broadcast
```

## What's in this repo, and what isn't

This repo holds the BNB Chain lane, built at the hackathon:
- the page, the API routes, the data readers and the verdict rules (`app/`);
- the contract and its tests (`contracts/`);
- the write-up and the video script (`docs/`).

The wider Catfooding app (Catgents, the cat's room, Live mode on X Layer and Solana) is a separate codebase. So is the CoAgentic Markets engine behind the real share prices. Its public feed is all this repo reads.

## Licences

- Our code: MIT.
- Atlas's pull-oracle consumer (a submodule) is BUSL-1.1, under its own licence.
- The cat pixel art: © Catfooding, for showing with this project.

*Readings, not advice. The cat places no trades here.*

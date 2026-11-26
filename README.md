# Is it fair food? Checked tokenized stocks on BNB Chain

Tokenized US stocks trade 24/7 on BNB Chain. **CoAgentic Markets** checks each one against the real share before anyone buys:
- Do three independent prices agree?
- Is the oracle's own consensus healthy?
- Is there enough liquidity to sell again?
- Is the price within 1% of the real share, and is that share trading?

It answers **REFUSE**, **WAIT** or **WATCH**, publishes every reading behind the answer, and **attests its verdicts on BNB Chain** next to an oracle price that the contract verifies itself. **Catfooding's cat** is one client of that feed: it shows the verdicts as a picky cat that only eats checked food. Any other agent or app can read the same feed.

**Live**
- Engine page (CoAgentic Markets): https://coagentic.markets/research/bnb
- Cat client: https://preview.catfooding.com/bnb
- Engine feed (JSON, public): https://tv.coagentic.markets/api/public/bnb
- Contract (BNB Smart Chain testnet): [`CatVerdicts` 0x0768597770EDF130B59a9661495d1cbAF8904bB4](https://testnet.bscscan.com/address/0x0768597770EDF130B59a9661495d1cbAF8904bB4). The engine records a batch every 10 minutes.

**Built for:** the BNB Bangkok hackathon (25–27 Nov 2026), Developer Track and the CoinMarketCap × Atlas Challenge. Write-up: [docs/WRITEUP.md](docs/WRITEUP.md).

## How it fits together

Raw data goes into the engine, which turns it into checked data, which the cat reads:

| Layer | What it does | Where |
|---|---|---|
| **Raw data** | Atlas Oracle and CoinMarketCap: prices, volumes, pool liquidity, consensus scores | Atlas's BNB Chain feed contract and APIs, CMC Pro API |
| **CoAgentic Markets (engine)** | adds the real share price and US market hours, cross-checks the three prices, checks exit liquidity, gives the verdict, and attests it on-chain | [`engine/`](engine/): the BNB module as it runs inside CoAgentic Markets |
| **Proof** | `CatVerdicts` verifies Atlas's signed price and refuses a "fair" verdict that the price contradicts | [`contracts/`](contracts/) |
| **Client** | the cat page reads the engine's public feed and shows it | [`app/`](app/) |

### The sources the engine reads

| Source | What it reads | Used for |
|---|---|---|
| **Atlas Oracle, on-chain** | the MultiFeed contract on BNB Smart Chain (`0xeace…44aa`, `fetchBatch`) | the token's price, from the chain |
| **Atlas Oracle, signed API** | `POST /report/v1/price/latest` | consensus health (HEALTHY / DEGRADED…), and the signed prices the contract verifies |
| **CoinMarketCap Pro API** | `/v2/cryptocurrency/quotes/latest` | market price, 24h volume, market cap |
| **CoinMarketCap DEX API** | `/v1/dex/token?platform=bsc` | DEX price and pool liquidity on BNB Chain |
| **CoAgentic Markets** | the real share price and US market hours | the fairness reference |

The tokens are bStocks on BNB Smart Chain: NVDAB, TSLAB, SPCXB, MSTRB, CRCLB and AAPLB (Atlas feeds 934, 933, 938, 939, 936 and 979).

### The rules (`engine/lib/bnb/verdict.ts`)

- **REFUSE** if any of these hold:
  - a reading is old;
  - the three token prices differ by more than 1%;
  - Atlas reports anything but HEALTHY;
  - the pools hold less than $50k;
  - the price is more than 1% from the real share.
- **WAIT** if all of that passes but the real share isn't trading, so a fair price can't be proven.
- **WATCH** if every check passes.

### On-chain: `CatVerdicts`

`contracts/src/CatVerdicts.sol` builds on [Atlas's pull-oracle consumer](https://github.com/oracle-atlas/pull-oracle-consumer):
- The engine appends Atlas's signed price package to the transaction's calldata.
- The contract **recovers the signer** and accepts only Atlas's official key, `0x59eD…C600`.
- It **rejects stale prices** (over 5 minutes old).
- It works out the gap to the real share on-chain.
- It **refuses a WATCH ("fair") verdict that the verified price contradicts.** The engine can't claim more than the oracle supports.

Each record stores the verdict, the verified price and its timestamp, the real share price, the gap in basis points, and which checks failed. Only the engine's attester key can record. The owner can rotate Atlas's signer and change the rule. The contract holds no funds.

The real share price is the engine's input: US stocks have no on-chain feed here. The token price is not an input; the contract verifies it.

## Run it

**The client** (Next.js). It needs no keys, because it reads the public engine feed:

```bash
cd app
npm install
npm run dev             # http://localhost:3000/bnb
```

**The engine module.** [`engine/`](engine/) is the BNB module as deployed inside CoAgentic Markets:
- `lib/bnb/`: the sources, the rules, the snapshot and the on-chain recording;
- the two routes: `GET /api/public/bnb` serves the feed, `POST /api/public/bnb/record` attests a batch;
- `ops/`: the 10-minute systemd timer.

It needs:
- `CMC_API_KEY` and `ATLAS_API_KEY`;
- `CAT_ATTESTER_KEY`, a BSC testnet key;
- `BNB_RECORD_SECRET`;
- the engine's real-share snapshot.

The rest of CoAgentic Markets is a separate, private codebase; this module and its public feed are what the BNB lane uses.

**The contract** (Foundry):

```bash
git submodule update --init --recursive
cd contracts
forge test                                   # 10 tests: signatures, staleness, tampering, the price rule
BNB_TEST_KEY=0x... forge script script/DeployCatVerdicts.s.sol --rpc-url bsc_testnet --broadcast
```

## Licences

- Our code: MIT.
- Atlas's pull-oracle consumer (a submodule) is BUSL-1.1, under its own licence.
- The cat pixel art: © Catfooding, for showing with this project.

*Readings, not advice. Nothing here places trades.*

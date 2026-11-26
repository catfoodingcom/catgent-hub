# Is it fair food? Checked tokenized stocks on BNB Chain

**Team:** CoAgentic Markets (the engine) and Catfooding (the client): JC, Jessica · **Tracks:** Developer Track · CoinMarketCap × Atlas Challenge
**Live:** https://coagentic.markets/research/bnb (the engine's page) · https://preview.catfooding.com/bnb (the cat) · https://tv.coagentic.markets/api/public/bnb (the engine's feed) · **Code:** https://github.com/catfoodingcom/catgent-hub · **Contract (BSC testnet):** [`0x0768597770EDF130B59a9661495d1cbAF8904bB4`](https://testnet.bscscan.com/address/0x0768597770EDF130B59a9661495d1cbAF8904bB4)

## The problem, and who it's for

Tokenized US stocks now trade around the clock on BNB Chain: 97+ bStocks, from Tesla to SpaceX. A token is only worth buying if its price is close to the real share, if there's enough liquidity to sell it again, and if the market data can be trusted. Most buyers check none of this. Their wallets show one price and no warning.

It's for people buying tokenized stocks on BNB Chain, and for the agents buying on their behalf. They need a plain answer before buying: **fair food, or not?** They also need proof of what was said, and when.

## What we built

**CoAgentic Markets**, an agent engine, turns raw oracle and market data into checked verdicts and attests them on BNB Chain. **Catfooding's cat** is a client that reads the engine's public feed and shows the verdicts. Any other agent or app can read the same feed. Each stock gets a verdict, with the engine's working shown:
- **REFUSE:** not fair food.
- **WAIT:** can't be proven fair yet.
- **WATCH:** fair; every check passes.

Six checks per stock, each tied to a source:

| Check | Rule | Source |
|---|---|---|
| Readings are fresh | oracle ≤ 5 min old, real share ≤ 2 h | Atlas on-chain feed · CoAgentic |
| Price sources agree | 3 token prices within 1% | Atlas · CMC quote · CMC DEX |
| Oracle consensus | Atlas reports HEALTHY | Atlas signed API |
| Exit liquidity | ≥ $50k in BNB Chain pools | CMC DEX |
| Price is fair | within ±1% of the real share | Atlas vs real share |
| Fair price provable | the real share is trading now | US market hours |

**On-chain proof.** Every 10 minutes, the engine records its verdicts on BNB Chain testnet in a `CatVerdicts` contract:
- Each verdict carries **Atlas's signed price**. The contract verifies it itself: the signature must come from Atlas's official signer, and the price must be fresh.
- The contract works out the gap to the real share on-chain.
- It **rejects a "fair" verdict that the verified price contradicts.** The engine can't claim more than the oracle supports.

## Endpoints and feeds used, and why

**Atlas Oracle**
- **Push feeds on BNB Smart Chain**, MultiFeed `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa` (`fetchBatch`). The token's own price, read straight from the chain, so it's free and anyone can check it. Feeds 933 TSLAB, 934 NVDAB, 936 CRCLB, 938 SPCXB, 939 MSTRB, 979 AAPLB.
- **Pull API** `POST /report/v1/price/latest` (signed). This gives two things:
  - consensus health (HEALTHY, DEGRADED…), which the cat refuses on;
  - the signed price package that the contract verifies on-chain.

**CoinMarketCap Pro API**
- `/v2/cryptocurrency/quotes/latest`: the market price, 24h volume and market cap per bStock. The second price source, and the trading activity.
- `/v1/dex/token?platform=bsc`: the DEX price and pool liquidity on BNB Chain. The third price source, and the exit-liquidity check.

**Real share price and US market hours:** CoAgentic Markets' public feed. These are the same reference the cat already uses for xStocks on X Layer and Solana.

The API keys stay server-side. Each CMC and Atlas call is made with the team's key, so usage shows in their logs. The on-chain reads and records can be checked on BscScan.

## BNB Chain contracts and data

| What | Where |
|---|---|
| bStock tokens (BNB Smart Chain) | TSLAB `0x5b19…292f`, NVDAB `0x02fc…7436`, SPCXB `0xbe9d…03e1`, MSTRB `0xe87a…6a14`, CRCLB `0x80f3…ffc0`, AAPLB `0x431a…9b7a` |
| Atlas MultiFeed (read) | BNB Smart Chain `0xeace…44aa` |
| CatVerdicts (write) | BNB Smart Chain testnet `0x0768597770EDF130B59a9661495d1cbAF8904bB4` (first batch: tx `0xe386…de37`) |

**Intelligence beyond the price check.** A fair price on its own isn't enough to hold a stock, so the engine answers three questions for each bStock:

| Question | Who answers | How |
|---|---|---|
| What to hold? | **The Council** | It is the same council that runs the CoAgentic Steward book, which holds these six shares as xStocks on X Layer. Every day a bull, a bear and a risk agent argue over the plan, the trend phases and the macro calendar, and a synthesis weighs their cases. That's a view of the share, so it carries over to the bStock. The page shows the stance, the debate, and for each stock its weight, plan and trend phase. The Council has made no decision about BNB Chain; the engine only reads it. |
| Is this token good enough to hold it through? | **The index screen** | It is the book's own rule: at least $100k in the pools and at least $10k of 24h volume on BNB Chain itself, for 3 days running. CMC's quote volume also counts Binance, so the engine reads BNB Chain DEX volume on its own. NVDAB, for example, trades $3.5M a day on-chain, against $150M+ across every venue. |
| Is now a fair moment? | **The verdict** | The six checks above, attested on-chain. It's rule-based, so the contract can re-check it. |

The engine's page shows all three: https://coagentic.markets/research/bnb

## What we'd build next

- **All 97 bStocks**, plus Ondo's tokenized stocks on BNB Chain, side by side, so the same stock can be compared across issuers.
- **Verdicts as a precondition:** a vault or an agent that will only buy a token while the cat's latest on-chain verdict says it's fair.
- **Mainnet recording:** the contract is chain-agnostic, since it checks signatures rather than relying on chain state.
- **Catgents on BNB Chain:** each owner's cat watches the stocks they hold.

*Readings, not advice. The cat places no trades here.*

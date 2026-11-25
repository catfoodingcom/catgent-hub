# Is it fair food? A cat that checks tokenized stocks on BNB Chain

**Team:** Catfooding (JC, Jessica) · **Tracks:** Developer Track · CoinMarketCap × Atlas Challenge
**Live:** https://preview.catfooding.com/bnb · **Code:** https://github.com/catfoodingcom/catgent-bnb · **Contract (BSC testnet):** [`0x0768597770EDF130B59a9661495d1cbAF8904bB4`](https://testnet.bscscan.com/address/0x0768597770EDF130B59a9661495d1cbAF8904bB4)

## The problem, and who it's for

Tokenized US stocks now trade around the clock on BNB Chain: 97+ bStocks, from Tesla to SpaceX. A token is only worth buying if its price is close to the real share, if there's enough liquidity to sell it again, and if the market data can be trusted. Most buyers check none of this. Their wallets show one price and no warning.

It's for people buying tokenized stocks on BNB Chain, and for the agents buying on their behalf. They need a plain answer before buying: **fair food, or not?** They also need proof of what was said, and when.

## What we built

A cat that judges each tokenized stock and shows its working:
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

**On-chain proof.** Every few minutes, the cat records its verdicts on BNB Chain testnet in a `CatVerdicts` contract:
- Each verdict carries **Atlas's signed price**. The contract verifies it itself: the signature must come from Atlas's official signer, and the price must be fresh.
- The contract works out the gap to the real share on-chain.
- It **rejects a "fair" verdict that the verified price contradicts.** The cat can't claim more than the oracle supports.

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

## What we'd build next

- **All 97 bStocks**, plus Ondo's tokenized stocks on BNB Chain, side by side, so the same stock can be compared across issuers.
- **Verdicts as a precondition:** a vault or an agent that will only buy a token while the cat's latest on-chain verdict says it's fair.
- **Mainnet recording:** the contract is chain-agnostic, since it checks signatures rather than relying on chain state.
- **Catgents on BNB Chain:** each owner's cat watches the stocks they hold.

*Readings, not advice. The cat places no trades here.*

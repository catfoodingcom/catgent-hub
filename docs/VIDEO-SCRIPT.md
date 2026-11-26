# Demo video: about 2:45 (limit 3:00)

Record the screen at /bnb, with a voice-over. Times are rough.

**0:00–0:20 · The problem** (/bnb, top of the page, the cat visible)
> Tokenized US stocks trade 24/7 on BNB Chain. But is the token fairly priced against the real share? Can you get out again? Can you trust the price? Your wallet won't tell you. CoAgentic Markets will, and our cat shows you.

**0:20–0:55 · One stock, every check** (scroll to TSLAB, point at the four prices)
> Here's tokenized Tesla. The engine, CoAgentic Markets, reads three independent prices: Atlas Oracle's feed straight from BNB Chain, CoinMarketCap's market quote, and CoinMarketCap's DEX price from BNB Chain pools. They agree to within a few hundredths of a percent. Then it compares them with the real Tesla share.
> Six checks, each with its source: fresh readings, sources agree, the oracle's own consensus, exit liquidity, a fair price, and whether the real share is trading right now.

**0:55–1:20 · The verdicts** (a REFUSE card, then the WAIT or WATCH card)
> Right now the cat refuses most of them: they're 2 to 5% below the real share. Two feeds report a degraded oracle consensus from Atlas, and the cat won't eat a price the oracle itself isn't sure of. Apple is close, but the US market is shut, so a fair price can't be proven: it waits.

**1:20–2:10 · Proof on-chain** (scroll to "Recorded on-chain", open the contract on testnet BscScan, open a transaction)
> Saying it isn't enough. Every 10 minutes the engine records its verdicts on BNB Chain. Each one carries Atlas's signed price, and the contract checks that signature itself: the right signer, and fresh. It works out the gap to the real share on-chain. And if the engine ever called a token "fair" when the verified price says otherwise, the contract rejects it. It can't claim more than the oracle supports.

**2:10–2:40 · Why it matters, what's next** (show coagentic.markets/research/bnb, the engine's page, next to the cat; optionally tv.coagentic.markets/api/public/bnb, the feed any agent can read)
> The cat is one client. The same checked feed is open to any agent or app. For people and for agents buying tokenized stocks, this is a check they can rely on before they buy, and a record anyone can audit after. Next: all 97 bStocks, Ondo's stocks on BNB Chain alongside, and vaults that only buy while the cat's on-chain verdict says fair.

**2:40–2:45 · Close** (the cat)
> Catfooding. Is it fair food?

---

**Fallback for the live demo:** if a source is slow, the page shows what came back and marks the missing source. Point at that: the cat refuses when it can't prove something.

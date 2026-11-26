#!/bin/bash
# Attest the BNB Chain lane's verdicts on BSC testnet (CatVerdicts) every 10 minutes (coagentic-bnb-record.timer).
# Reads BNB_RECORD_SECRET from .env.local without printing it; logs one line per run.
cd /opt/coagentic-markets
S=$(grep "^BNB_RECORD_SECRET=" .env.local | cut -d= -f2-)
R=$(curl -s -m 90 -X POST -H "Authorization: Bearer $S" http://127.0.0.1:3999/api/public/bnb/record)
echo "$(date -u +%FT%TZ) $R" | cut -c1-600 >> logs/bnb-record.log

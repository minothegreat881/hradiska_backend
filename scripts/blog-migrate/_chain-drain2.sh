#!/usr/bin/env bash
# Auto-chain: počká, kým drain1 dopíše "DRAIN DONE", potom sám spustí drain2 (21–67).
# Vďaka tomu upload beží plne autonómne bez manuálneho reťazenia.
cd "C:/Users/milan/Desktop/Git-Projects/hradiska-strapi" || exit 1
LOG1="scripts/blog-migrate/_drain-uploads.log"
echo "[chain] $(date +%H:%M:%S) waiting for drain1 to finish..."
while ! grep -q "DRAIN DONE" "$LOG1" 2>/dev/null; do sleep 30; done
echo "[chain] $(date +%H:%M:%S) drain1 done → starting drain2 (21–67)"
bash scripts/blog-migrate/_drain2-uploads.sh
echo "[chain] $(date +%H:%M:%S) drain2 finished"

#!/bin/bash
for i in $(seq 1 20); do
  echo "=== ATTEMPT $i ===" >> zibrica_loop.log
  node upload.mjs --input=out/z-stegmann-rajtar-predbezne-vysledky-archeologickeho-vyskumu-na-zibrici-vyskumy-v-r-2002-2003-a-2005-2006.intermediate.json --category=xffbpfyel46l2xro9s7hwm8d --dry-run=false >> zibrica_loop.log 2>&1
  if grep -q "VERIFY" zibrica_loop.log; then
    echo "SUCCESS on attempt $i" >> zibrica_loop.log
    exit 0
  fi
  sleep 20
done
echo "ALL ATTEMPTS FAILED" >> zibrica_loop.log

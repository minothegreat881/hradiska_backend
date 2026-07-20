#!/bin/bash
# Batch runner for text-only-sync.mjs across the full Strážna a hospodárska funkcia
# category (all 40 slugs) — safe: no image/media operations, so no EBUSY risk.
cd "C:\Users\milan\Desktop\Git-Projects\hradiska-strapi" || exit 1

SLUGS=(
  bosaca-srniansky-haj
  bojnice-hradisko-a-centrum-dechtarstva-v-slovanskom-obdobi
  dolna-marikova-simunky
  dolne-vestenice-slovanske-hradisko
  hradec-prievidza
  hradiste-pri-partizanskom
  hradiste-pod-vratnom
  hronsky-benadik
  hradok-nad-vahom
  kamenec-pod-vtacnikom-bystricany
  klatova-nova-ves-siance
  kusin
  majcichov
  male-kozmalovce
  molpir
  moravany-nad-vahom-hradiste
  muzla-cenkov
  obisovce-straza
  podbranc-stary-hrad
  podturen-basta-velinok-varta
  pov-bystrica-dedovec-opevnene-sidlisko
  prasnik-hradok-osada-u-fajnorov
  prosiek-hradok
  pruzina-mesciska
  rybnik-krivin
  skalka-nad-vahom
  slovanske-hradiska-v-rakusku-a
  stary-konus
  trencianske-teplice-certova-skala
  turie-hradek
  vrsatecky-kovac-z-cias-velkej-moravy
  zemianske-podhradie-martakova-skala
  zemianske-podhradie-hradista
  zamcisko-modra
  zamcisko-nova-bana
  zeleznik-dolne-oresany
  zilina-zastranie-stranik
  detva-kalamarka
)

MODE="${1:-dry}"   # "dry" or "real"
LOG=/tmp/textonly_${MODE}.log
: > "$LOG"

for slug in "${SLUGS[@]}"; do
  echo "=== $slug ===" >> "$LOG"
  if [ "$MODE" = "real" ]; then
    node scripts/blog-migrate/text-only-sync.mjs --input="out/${slug}.intermediate.json" --dry-run=false >> "$LOG" 2>&1
  else
    node scripts/blog-migrate/text-only-sync.mjs --input="out/${slug}.intermediate.json" --dry-run=true >> "$LOG" 2>&1
  fi
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "SKIP: $slug" >> /tmp/textonly_skipped.log
  else
    echo "OK: $slug" >> /tmp/textonly_ok.log
  fi
done

echo "DONE mode=$MODE" >> "$LOG"

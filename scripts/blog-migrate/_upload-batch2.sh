#!/bin/bash
# Sequential upload of remaining Strážna a hospodárska funkcia articles.
cd "C:\Users\milan\Desktop\Git-Projects\hradiska-strapi" || exit 1

SLUGS=(
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

LOG=/tmp/batch2_progress.log
: > "$LOG"

ensure_strapi_healthy() {
  for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:1337/_health)
    if [ "$code" = "204" ]; then
      return 0
    fi
    sleep 5
  done
  return 1
}

restart_strapi() {
  echo "[$(date '+%H:%M:%S')] Restarting Strapi..." >> "$LOG"
  cd "C:\Users\milan\Desktop\Git-Projects\hradiska-strapi"
  nohup npm run develop > /tmp/strapi_batch2.log 2>&1 &
  disown
  ensure_strapi_healthy
}

for slug in "${SLUGS[@]}"; do
  echo "[$(date '+%H:%M:%S')] === $slug: start ===" >> "$LOG"

  attempt=1
  success=0
  while [ $attempt -le 3 ]; do
    ensure_strapi_healthy || restart_strapi

    node scripts/blog-migrate/upload.mjs --input="out/${slug}.intermediate.json" --dry-run=false > "/tmp/up_${slug}.log" 2>&1
    rc=$?

    if grep -q "✓ PUT OK\|✓ POST OK\|Vytvorené\|Aktualizované" "/tmp/up_${slug}.log" 2>/dev/null; then
      success=1
      break
    fi

    if grep -qi "EBUSY" "/tmp/up_${slug}.log" 2>/dev/null; then
      echo "[$(date '+%H:%M:%S')] $slug: EBUSY crash on attempt $attempt, restarting Strapi" >> "$LOG"
      restart_strapi
    else
      echo "[$(date '+%H:%M:%S')] $slug: attempt $attempt failed (rc=$rc), no clear EBUSY, retrying" >> "$LOG"
    fi
    attempt=$((attempt+1))
  done

  if [ $success -eq 1 ]; then
    echo "[$(date '+%H:%M:%S')] === $slug: SUCCESS ===" >> "$LOG"
  else
    echo "[$(date '+%H:%M:%S')] === $slug: FAILED after 3 attempts — check /tmp/up_${slug}.log ===" >> "$LOG"
  fi
done

echo "[$(date '+%H:%M:%S')] BATCH2 COMPLETE" >> "$LOG"

#!/usr/bin/env bash
# Sériový drain uploader pre aktuality (1 naraz, idempotentný cez nazov + SHA-256).
# Fotkové kusy cez --prefer=s1600 (disk I/O ~1 fotka/min, s0 by timeoutoval).
cd "C:/Users/milan/Desktop/Git-Projects/hradiska-strapi" || exit 1
run() {
  local slug="$1"; local prefer="$2"
  echo "===== $(date '+%H:%M:%S') START $slug ${prefer:+[$prefer]} ====="
  if [ -n "$prefer" ]; then
    node scripts/blog-migrate/_upload-aktuality.mjs --slug="$slug" --prefer="$prefer" --dry-run=false 2>&1
  else
    node scripts/blog-migrate/_upload-aktuality.mjs --slug="$slug" --dry-run=false 2>&1
  fi
  echo "===== $(date '+%H:%M:%S') END $slug ====="
}
run michalovce-zivot-na-velkej-morave s1600
run diskusna-skupina-hradiska
run bojna-zivot-slovanov-na-hradisku-v-zime
run brigada-oz-hradiska-dolna-marikova-siroka s1600
run krasa-pravekej-keramiky-vystava-v-ziline
run ziva-historia-v-juli
run zivy-starovek-na-havranku s1600
run zbornik-hradiska-svedkovia-davnych-cias
echo "===== DRAIN DONE $(date '+%H:%M:%S') ====="

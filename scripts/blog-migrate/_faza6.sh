#!/usr/bin/env bash
# Fáza 6 — dobehnúť zlyhania, doriešiť kolíziu, verifikovať. Spustiť AŽ po dobehnutí drain2.
cd "C:/Users/milan/Desktop/Git-Projects/hradiska-strapi" || exit 1

echo "===== Fáza 6 $(date +%H:%M:%S) ====="

echo "--- (1) retry FAIL #55 podcast-kelti (s1600) ---"
node scripts/blog-migrate/_upload-aktuality.mjs --slug=podcast-kelti-na-juznom-slovensku --prefer=s1600 --dry-run=false 2>&1

echo "--- (2) kolízia #22: force-new 'Darujte nám 2% z dane' (2016) ako samostatný záznam ---"
node scripts/blog-migrate/_upload-aktuality.mjs --slug=darujte-nam-2-z-dane-2016 --force-new --dry-run=false 2>&1

echo "--- (3) verifikácia všetkých 67 ---"
node scripts/blog-migrate/_verify-aktuality.mjs 2>&1

echo "===== Fáza 6 DONE $(date +%H:%M:%S) ====="

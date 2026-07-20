#!/usr/bin/env bash
cd "C:/Users/milan/Desktop/Git-Projects/hradiska-strapi" || exit 1
CAT=u2b10w6rht97aijttkdja2s2
echo "===== $(date +%H:%M:%S) [1/7] brigada-oz-hradiska-dolna-marikova-siroka ====="
timeout 3600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-03-brigada-oz-hradiska-dolna-marikova.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [2/7] vyroba-dosiek-pre-hradisko-bojna ====="
timeout 3600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2020-10-vyroba-dosiek-pre-hradisko-bojna.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [3/7] odhalovanie-tajomstiev-antickeho-rima-na-strednom-dunaji ====="
timeout 3600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-08-odhalovanie-tajomstiev-antickeho-rima.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [4/7] plavba-rimskou-lodou-po-dunaji-1-diel ====="
timeout 3600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-09-plavba-rimskou-lodou-po-dunaji-1-diel.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [5/7] plavba-rimskou-lodou-po-dunaji-2-diel ====="
timeout 3600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-09-plavba-rimskou-lodou-po-dunaji-2-diel.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [6/7] michalovce-zivot-na-velkej-morave ====="
timeout 3600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2014-06-michalovce-zivot-na-velkej-morave.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [7/7] zivy-starovek-na-havranku ====="
timeout 3600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-07-zivy-starovek-na-havranku.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== FINAL7-DONE $(date +%H:%M:%S) ====="

#!/usr/bin/env bash
cd "C:/Users/milan/Desktop/Git-Projects/hradiska-strapi" || exit 1
CAT=u2b10w6rht97aijttkdja2s2
echo "===== $(date +%H:%M:%S) [1/14] hladanie-bez-hranic-cesko-slovensky-dialog-archeologov-a-detektoristov (0 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2025-12-hladanie-bez-hranic-cesko-slovensky.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [2/14] historicky-festival-pozvanka-lh-2014 (1 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2014-04-blog-post.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [3/14] ako-zbierat-starozitnosti (9 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-06-ako-zbierat-starozitnosti-19-storocie.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [4/14] lodstvo-starovekeho-grecka (12 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-01-lodstvo-starovekeho-grecka.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [5/14] prednaska-o-keltoch-video (13 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-10-prednaska-o-kletoch-video.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [6/14] danuvina-alacris-opat-na-vodach-dunaja (15 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-05-danuvina-alacris-opat-na-vodach-dunaja.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [7/14] putovanie-za-rimskymi-pamiatkami-v-afrike (17 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-09-tisicky-rokov-pred-nasou-generaciou.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [8/14] brigada-oz-hradiska-dolna-marikova-siroka (20 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-03-brigada-oz-hradiska-dolna-marikova.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [9/14] vyroba-dosiek-pre-hradisko-bojna (20 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2020-10-vyroba-dosiek-pre-hradisko-bojna.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [10/14] odhalovanie-tajomstiev-antickeho-rima-na-strednom-dunaji (21 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-08-odhalovanie-tajomstiev-antickeho-rima.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [11/14] plavba-rimskou-lodou-po-dunaji-1-diel (22 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-09-plavba-rimskou-lodou-po-dunaji-1-diel.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [12/14] plavba-rimskou-lodou-po-dunaji-2-diel (29 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-09-plavba-rimskou-lodou-po-dunaji-2-diel.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [13/14] michalovce-zivot-na-velkej-morave (35 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2014-06-michalovce-zivot-na-velkej-morave.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== $(date +%H:%M:%S) [14/14] zivy-starovek-na-havranku (49 img) ====="
timeout 1200 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-07-zivy-starovek-na-havranku.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|UPLOAD FAILED|Upload incomplete" | tail -2
echo "===== MISSING2-DONE $(date +%H:%M:%S) ====="

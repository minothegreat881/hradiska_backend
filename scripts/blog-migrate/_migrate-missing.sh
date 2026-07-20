#!/usr/bin/env bash
cd "C:/Users/milan/Desktop/Git-Projects/hradiska-strapi" || exit 1
CAT=u2b10w6rht97aijttkdja2s2
echo "===== $(date +%H:%M:%S) [1/20] historicky-festival-pozvanka-lh-2014 ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2014-04-blog-post.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [2/20] michalovce-zivot-na-velkej-morave ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2014-06-michalovce-zivot-na-velkej-morave.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [3/20] brigada-oz-hradiska-dolna-marikova-siroka ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-03-brigada-oz-hradiska-dolna-marikova.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [4/20] zivy-starovek-na-havranku ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-07-zivy-starovek-na-havranku.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [5/20] vysiel-nas-zbornik-o-hradiskach ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2016-01-vysiel-nas-zbornik-o-hradiskach.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [6/20] ako-zbierat-starozitnosti ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-06-ako-zbierat-starozitnosti-19-storocie.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [7/20] kelti-v-malych-karpatoch ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-07-kelti-v-malych-karpatoch.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [8/20] prednaska-o-keltoch-video ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-10-prednaska-o-kletoch-video.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [9/20] knihy-o-slovanoch ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2018-11-knihy-o-slovanoch.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [10/20] skryte-poklady ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2019-03-skryte-poklady.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [11/20] vyroba-dosiek-pre-hradisko-bojna ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2020-10-vyroba-dosiek-pre-hradisko-bojna.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [12/20] prednaska-o-archeologii-na-zs-s-ms-dolne-oresany ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2021-07-prednaska-o-archeologii-na-zs-s-ms.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [13/20] podcast-kelti-na-juznom-slovensku ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-02-prinasame-vam-novinku-podcast-nasich.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [14/20] plavba-rimskou-lodou-po-dunaji-1-diel ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-09-plavba-rimskou-lodou-po-dunaji-1-diel.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [15/20] plavba-rimskou-lodou-po-dunaji-2-diel ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-09-plavba-rimskou-lodou-po-dunaji-2-diel.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [16/20] lodstvo-starovekeho-grecka ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-01-lodstvo-starovekeho-grecka.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [17/20] danuvina-alacris-opat-na-vodach-dunaja ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-05-danuvina-alacris-opat-na-vodach-dunaja.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [18/20] odhalovanie-tajomstiev-antickeho-rima-na-strednom-dunaji ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-08-odhalovanie-tajomstiev-antickeho-rima.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [19/20] putovanie-za-rimskymi-pamiatkami-v-afrike ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-09-tisicky-rokov-pred-nasou-generaciou.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== $(date +%H:%M:%S) [20/20] hladanie-bez-hranic-cesko-slovensky-dialog-archeologov-a-detektoristov ====="
timeout 600 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2025-12-hladanie-bez-hranic-cesko-slovensky.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete|media id=" | tail -3
echo "===== MISSING-DONE $(date +%H:%M:%S) ====="

#!/usr/bin/env bash
cd "C:/Users/milan/Desktop/Git-Projects/hradiska-strapi" || exit 1
CAT=u2b10w6rht97aijttkdja2s2
echo "===== $(date +%H:%M:%S) [9/67] podpalili-archologicky-skanzen ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2014-04-podpalili-archologicky-skanzen.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [10/67] anketa-2014-maj ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2014-05-anketa.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [11/67] michalovce-zivot-na-velkej-morave ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2014-06-michalovce-zivot-na-velkej-morave.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [12/67] anketa-2014-jul ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2014-07-anketa.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [13/67] diskusna-skupina-hradiska ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2014-11-diskusna-skupina-hradiska.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [14/67] bojna-zivot-slovanov-na-hradisku-v-zime ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-01-bojna-zivot-slovanov-na-hradisku-v-zime.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [15/67] brigada-oz-hradiska-dolna-marikova-siroka ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-03-brigada-oz-hradiska-dolna-marikova.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [16/67] tak-nam-zas-zamlciavaju-dejiny ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-03-tak-nam-zas-zamlciavaju-dejiny.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [17/67] krasa-pravekej-keramiky-vystava-v-ziline ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-04-krasa-pravekej-keramiky-vystava-v-ziline.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [18/67] ziva-historia-v-juli ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-07-ziva-historia-v-juli.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [19/67] zivy-starovek-na-havranku ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-07-zivy-starovek-na-havranku.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [20/67] zbornik-hradiska-svedkovia-davnych-cias ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2015-12-zbornik-hradiska-svedkovia-davnych-cias.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [21/67] vysiel-nas-zbornik-o-hradiskach ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2016-01-vysiel-nas-zbornik-o-hradiskach.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [22/67] darujte-nam-2-z-dane-2016 ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2016-02-darujte-nam-2-z-dane.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [23/67] ohlasit-archeologicky-nalez-sa-oplati-patri-vam-nalezne ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2016-08-ohlasit-archeologicky-nalez-sa-oplati.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [24/67] zrekonstruovali-ukradnutu-prilbu-z-bojnej ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2016-09-zrekonstruovali-ukradnutu-prilbu-z.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [25/67] bojna-v-zime ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2016-12-bojna-v-zime.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [26/67] pekne-sviatky ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2016-12-pekne-sviatky.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [27/67] hladajte-na-hradiskach-poklady ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-01-hladajte-na-hradiskach-poklady.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [28/67] 2-pre-hradiska ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-02-ak-ste-sa-este-nerozhodli-komu-venujete.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [29/67] ako-zbierat-starozitnosti ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-06-ako-zbierat-starozitnosti-19-storocie.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [30/67] patdesiate-vyrocie-umrtia-antona-petrovskeho-sichmana ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-06-patdesiate-vyrocie-umrtia-antona.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [31/67] kelti-v-malych-karpatoch ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-07-kelti-v-malych-karpatoch.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [32/67] kelti-v-tvrdosovciach ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-09-kelti-v-tvrdosovciach.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [33/67] prednaska-o-keltoch-video ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-10-prednaska-o-kletoch-video.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [34/67] vyuzitie-rozsirenej-reality-pri-popularizacii-archeologie ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-11-vyuzitie-rozsirenej-reality-pri.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [35/67] zbornik ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-12-pred-2-rokmi-sme-vydali-zbornik.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [36/67] casopis-o-hradiskach-v-tlacenej-podobe ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-12-priatelia-uvazujeme-nad-moznostou.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [37/67] ukradli-mec-z-puchovskej-skaly ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-12-ukradli-mec-z-puchovskej-skaly.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [38/67] vychadza-prvy-diel-nasho-casopisu-digitalne-hradiska ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2017-12-vychadza-prvy-diel-nasho-casopis.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [39/67] darujte-nam-2-z-dane-2018 ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2018-03-darujte-nam-2-z-dane.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [40/67] kniha-ozivena-archeologia ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2018-04-dwarf-digital-archeology-v-spolupraci-s.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [41/67] detektorovy-prieskum-hradiska ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2018-07-detektorovy-prieskum-hradiska.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [42/67] utgard-2018 ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2018-07-utgard-2018.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [43/67] stanovisko-k-takzvanym-slovansko-arijskym-vedam ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2018-10-stanovisko-k-takzvanym-slovansko.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [44/67] knihy-o-slovanoch ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2018-11-knihy-o-slovanoch.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [45/67] mapa-stredovekych-obchodnych-ciest ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2019-03-mapa-stredovekych-obchodnych-ciest.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [46/67] skryte-poklady ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2019-03-skryte-poklady.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [47/67] 2-pre-oz-hradiska ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2019-04-2-pre-oz-hradiska.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [48/67] starosloviensky-slovnik-online ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2019-04-starosloviensky-slovnik-online.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [49/67] zbornik-hradiska-svedkovia-davnych-cias-2 ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2019-09-nase-niekolkomesacne-usilie-bude-uz.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [50/67] zbornik-ii-uz-je-vytlaceny ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2019-11-zbornik-ii-uz-je-vytlaceny.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [51/67] zbornik-o-hradiskach-sa-rychlo-predava ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2019-12-zbornik-o-hradiskach-sa-rychlo-predava.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [52/67] 2-z-vasich-dani-nam-velmi-pomozu ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2020-03-2-z-vasich-dani-nam-velmi-pomozu.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [53/67] vyroba-dosiek-pre-hradisko-bojna ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2020-10-vyroba-dosiek-pre-hradisko-bojna.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [54/67] prednaska-o-archeologii-na-zs-s-ms-dolne-oresany ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2021-07-prednaska-o-archeologii-na-zs-s-ms.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [55/67] podcast-kelti-na-juznom-slovensku ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-02-prinasame-vam-novinku-podcast-nasich.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [56/67] podcast-praveke-mece ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-03-podcast-praveke-mece.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [57/67] plavba-rimskou-lodou-po-dunaji-1-diel ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-09-plavba-rimskou-lodou-po-dunaji-1-diel.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [58/67] plavba-rimskou-lodou-po-dunaji-2-diel ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2022-09-plavba-rimskou-lodou-po-dunaji-2-diel.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [59/67] lodstvo-starovekeho-grecka ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-01-lodstvo-starovekeho-grecka.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [60/67] danuvina-alacris-opat-na-vodach-dunaja ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-05-danuvina-alacris-opat-na-vodach-dunaja.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [61/67] rozhovor-o-hradiskach ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-06-rozhovor-o-hradiskach.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [62/67] odhalovanie-tajomstiev-antickeho-rima-na-strednom-dunaji ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-08-odhalovanie-tajomstiev-antickeho-rima.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [63/67] putovanie-za-rimskymi-pamiatkami-v-afrike ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2024-09-tisicky-rokov-pred-nasou-generaciou.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [64/67] 2-pre-hradiska-v-roku-2025 ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2025-02-2-pre-hradiska-v-roku-2025.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [65/67] hladanie-bez-hranic-cesko-slovensky-dialog-archeologov-a-detektoristov ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2025-12-hladanie-bez-hranic-cesko-slovensky.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [66/67] zakladne-zasady-obcianskeho-zdruzenia-hradiska ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2026-02-zakladne-zasady-obcianskeho-zdruzenia.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== $(date +%H:%M:%S) [67/67] oblik-vyskum-kultovej-hory ====="
timeout 240 node scripts/blog-migrate/upload.mjs --input=out/aktuality-2026-06-oblik-vyskum-kultovej-hory.intermediate.json --category=$CAT --prefer=s1600 --dry-run=false 2>&1 | grep -E "documentId:|REUSE by SHA|UPLOAD FAILED|Upload incomplete" | tail -4
echo "===== REST-DONE $(date +%H:%M:%S) ====="

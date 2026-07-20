#!/usr/bin/env bash
cd "C:/Users/milan/Desktop/Git-Projects/hradiska-strapi" || exit 1
run(){ echo "===== $(date +%H:%M:%S) START $1 ${2:+[$2]} ====="; if [ -n "$2" ]; then node scripts/blog-migrate/_upload-aktuality.mjs --slug="$1" --prefer="$2" --dry-run=false 2>&1; else node scripts/blog-migrate/_upload-aktuality.mjs --slug="$1" --dry-run=false 2>&1; fi; echo "===== $(date +%H:%M:%S) END $1 ====="; }
run vysiel-nas-zbornik-o-hradiskach s1600
run darujte-nam-2-z-dane-2016
run ohlasit-archeologicky-nalez-sa-oplati-patri-vam-nalezne
run zrekonstruovali-ukradnutu-prilbu-z-bojnej
run bojna-v-zime
run pekne-sviatky
run hladajte-na-hradiskach-poklady
run 2-pre-hradiska
run ako-zbierat-starozitnosti s1600
run patdesiate-vyrocie-umrtia-antona-petrovskeho-sichmana
run kelti-v-malych-karpatoch s1600
run kelti-v-tvrdosovciach
run prednaska-o-keltoch-video s1600
run vyuzitie-rozsirenej-reality-pri-popularizacii-archeologie
run zbornik
run casopis-o-hradiskach-v-tlacenej-podobe
run ukradli-mec-z-puchovskej-skaly
run vychadza-prvy-diel-nasho-casopisu-digitalne-hradiska
run darujte-nam-2-z-dane-2018
run kniha-ozivena-archeologia
run detektorovy-prieskum-hradiska
run utgard-2018
run stanovisko-k-takzvanym-slovansko-arijskym-vedam
run knihy-o-slovanoch s1600
run mapa-stredovekych-obchodnych-ciest
run skryte-poklady s1600
run 2-pre-oz-hradiska
run starosloviensky-slovnik-online
run zbornik-hradiska-svedkovia-davnych-cias-2
run zbornik-ii-uz-je-vytlaceny
run zbornik-o-hradiskach-sa-rychlo-predava s1600
run 2-z-vasich-dani-nam-velmi-pomozu
run vyroba-dosiek-pre-hradisko-bojna s1600
run prednaska-o-archeologii-na-zs-s-ms-dolne-oresany s1600
run podcast-kelti-na-juznom-slovensku
run podcast-praveke-mece
run plavba-rimskou-lodou-po-dunaji-1-diel s1600
run plavba-rimskou-lodou-po-dunaji-2-diel s1600
run lodstvo-starovekeho-grecka s1600
run danuvina-alacris-opat-na-vodach-dunaja s1600
run rozhovor-o-hradiskach
run odhalovanie-tajomstiev-antickeho-rima-na-strednom-dunaji s1600
run putovanie-za-rimskymi-pamiatkami-v-afrike s1600
run 2-pre-hradiska-v-roku-2025
run hladanie-bez-hranic-cesko-slovensky-dialog-archeologov-a-detektoristov
run zakladne-zasady-obcianskeho-zdruzenia-hradiska
run oblik-vyskum-kultovej-hory
echo "===== DRAIN2 DONE $(date +%H:%M:%S) ====="

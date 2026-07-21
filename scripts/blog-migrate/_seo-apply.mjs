/**
 * Aplikuje unikátne SEO (metaTitle ≤70, metaDescription ≤160) na 60 migrovaných článkov.
 * Text je bespoke z obsahu každého článku (viď _seo-digest.txt), štýl ako pôvodných 305.
 *   node _seo-apply.mjs            → len validácia dĺžok (nič nezapíše)
 *   node _seo-apply.mjs --commit   → PUT do Strapi (po jednom, throttle)
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '.env') }); // token je v hradiska-strapi/.env
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN;
const COMMIT = process.argv.includes('--commit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEO = {
  'nitra-v-9-storoci': ['Nitra v 9. storočí – kresba centrálneho hradiska kniežatstva', 'Kresba Tomáša Humaja rekonštruuje podobu hradiska na nitrianskom hradnom kopci v 9. storočí – centra Nitrianskeho kniežatstva – podľa pôdorysov a valov.'],
  '3d-rekonstrukcia-velmozskeho-dvorca-v-ducovom-kostolci': ['3D rekonštrukcia veľmožského dvorca v Ducovom (Kostolec)', 'Architekti V. Kyjovská a Š. Šuster v spolupráci s prof. Ruttkayom vytvorili prechádzkovú 3D rekonštrukciu veľmožského dvorca v Ducovom spred 1000 rokov.'],
  'janovce-machalovce': ['Jánovce–Machalovce – hradisko púchovskej kultúry a Kotíni', 'Hradisko na kopci nad Jánovcami: 3 ha akropola a 30 ha predhradie púchovskej kultúry so soškou Kelta so zlatými očami z laténu a staršej doby rímskej.'],
  'archeologicke-kultury-na-slovensku-datovanie': ['Archeologické kultúry na Slovensku – prehľadné datovanie', 'Prehľadná časová os archeologických kultúr na Slovensku od staršej doby kamennej po stredovek – lužická, halštat, laténska doba, Kelti, doba rímska a ďalšie.'],
  'markomani-a-kvadi': ['Markomani a Kvádi – germánske kmene na území Slovenska', 'Pôvod Markomanov a Kvádov, kráľovstvo Marobuda v Čechách, markomanské vojny s Rimanmi a zlatý náramok z kniežacieho hrobu v Zohore.'],
  'skalica-hradisko-na-kalvarii': ['Skalica – Hradisko na Kalvárii s rotundou sv. Juraja', 'Eliptické hradisko (120 × 40 m) s valom a priekopou pri starej Skalici, s dominantou románskej rotundy sv. Juraja; roku 1958 tu našli 1392 strieborných mincí.'],
  'bronzovy-poklad-z-hradiska-na-strednom-povazi': ['Bronzový poklad z hradiska na strednom Považí', 'Depot 12 bronzových šperkov lužickej kultúry (12.–11. stor. pred Kr.) z hradiska objaveného LIDARom na Považí – príklad spolupráce detektoristov a múzea.'],
  'zbrucsky-idol': ['Zbručský idol – štvorhranná socha slovanského boha', 'Kamenný stĺp z rieky Zbruč (1848) vysoký 2,67 m: tri pásy sveta bohov, ľudí a podsvetia a štyri postavy – buď štyria bohovia, alebo štvorhlavý Svantovít.'],
  'rekomberek-horne-oresany': ['Rekomberek – hradisko nad Hornými Orešanmi v tvare L', 'Hradisko Rekomberek nad riekou Parná: val v tvare L (obvod 390 m, 0,8 ha), pri ktorom sa našiel neskoroavarský poklad 86 predmetov a byzantský bronzový kríž.'],
  'trstin-novy-hradok': ['Trstín – Nový hrádok objavený lidarom v roku 2020', 'Malé opevnenie (72 × 38 m) nad Trstínom objavené lidarom roku 2020; výskum M. Sládka odkryl germánsku sponu typu A 45 Almgren z doby rímskej.'],
  'stary-plast-plavecky-mikulas': ['Starý plášť – hradisko v Plaveckom krase (Plavecký Mikuláš)', 'Malokarpatské hradisko Starý plášť (nad 640 m) pri Plaveckom Mikuláši: oválny areál 1,9 ha, drevozemný val a skalné steny; velatická až podolská kultúra.'],
  'stupava-draci-hradok': ['Stupava – Dračí hrádok nad veľkomoravským hradiskom', 'Ruina stredovekej pevnôstky s hranolovou vežou (10 × 10 m) z 13. storočia na výbežku Úboč, postavená na staršom predveľkomoravskom hradisku pri Stupave.'],
  'marianka-barania-luka-bazgovic': ['Mariánka – Barania lúka (Bazgovič), hradisko z doby bronzovej', 'Oválne hradisko velatickej kultúry (8 ha) na vrchu Bazgovič nad Mariankou s valom do 3 m a bránou kliešťového tvaru; výskum J. Paulíka 1986–1990.'],
  'okopanec-borinka': ['Okopanec (Borinka) – hradisko obopínajúce tri vrcholy', 'Rozsiahle hradisko (51 ha) na trojkopci Okopanec pri Borinke s nezvyčajným opevnením: valy obopínajú naraz tri vrcholy kopca v Malých Karpatoch.'],
  'dolne-oresany-vapenice-alebo-ako-sme-nasli-nove-hradisko': ['Dolné Orešany – Vápenice: ako sme našli nové hradisko', 'Príbeh objavu keltského hradiska Vápenice pri Dolných Orešanoch (2017): železná kopija, ostroha a zlatý drôt z polohy chránenej len palisádou a strmými svahmi.'],
  'turcianska-blatnica-plesovica': ['Turčianska Blatnica – Plešovica, kultové hradisko v Turci', 'Hradisko na ostrom hrebeni Plešovica (kóta 683) nad Blatnicou – zrejme kultové miesto; odtiaľ pochádza slávna prilba typu Berru a blatnický meč.'],
  'na-slovensku-objavili-novy-keltsky-symbol': ['Na Slovensku objavili nový keltský symbol', 'Hlinená figúrka „Furiorix" z Tvrdošoviec stará vyše 2000 rokov nesie dosiaľ neznámy keltský symbol – kosoštvorec v kruhu bez analógií vo východokeltskom svete.'],
  'ponicka-huta-na-klastore': ['Ponická Huta – Na kláštore, hradisko baníkov medi', 'Hradisko Na kláštore na masíve Učovník s valom ~400 m spájané s ťažbou a spracovaním medi; medzi nálezmi je bronzová figúrka nahého muža.'],
  'pezinok-stary-zamok-ii': ['Pezinok – Starý zámok II, stredoveký hrádok nad Cajlou', 'Úzky 200 m dlhý hrádok s drevenou vežou na hrebeni Malých Karpát nad Pezinkom z 13. storočia; zanikol ozbrojeným útokom a požiarom okolo roku 1300.'],
  'unin-zamcisko': ['Unín – Zámčisko, mohutné hradisko objavené Janšákom', 'Jedno z najkrajších hradísk západného Slovenska (17 ha) s valom 4–6 m a priekopou 8–10 m; objavil ho Štefan Janšák roku 1927, s bronzovým depotom a sponami.'],
  'drevenik-z-vtacej-perspektivy': ['Dreveník z vtáčej perspektívy – letecké zábery hradiska', 'Letecké zábery rozsiahleho slovanského hradiska Dreveník, ktorému odborná literatúra napriek jeho rozmerom venuje prekvapivo málo pozornosti.'],
  'voz-z-obdobia-eneolitu': ['Voz z obdobia eneolitu – 3D rekonštrukcia badenskej kultúry', 'Rekonštrukcia možnej podoby voza badenskej kultúry (3500–2600 pred Kr.) podľa hlinených modelov; nositelia tejto kultúry patria k prvým staviteľom hradísk.'],
  'velmozska-mohyla-holasky-2': ['Veľmožská mohyla Holásky 2 – halštatský hrob bojovníka', '3D rekonštrukcia veľmožskej mohyly horákovskej kultúry z Brna-Holások: dubová komora ~5 × 5 m s pohrebom bojovníka z doby halštatskej.'],
  'kedy-prisli-slovania-na-slovensko': ['Kedy prišli Slovania na Slovensko?', 'Kedy a odkiaľ prišli Slovania na naše územie: nositelia pražskej kultúry od severovýchodu Karpát v období od 70. rokov 5. do 1. polovice 6. storočia.'],
  'slepy-vrch-v-oresanoch-dobudovanie-naucneho-chodnika': ['Slepý vrch – dobudovanie náučného chodníka v Orešanoch', 'OZ Hradiská dobudovalo roku 2016 náučný chodník so smerovníkmi vedúci z Dolných Orešian na 2500 rokov staré keltské hradisko Slepý vrch.'],
  'vyskum-na-hradisku-simunky-v-dolnej-marikovej': ['Výskum na veľkomoravskom hradisku Šimunky (Dolná Mariková)', 'Archeologický výskum OZ Hradiská a Trenčianskeho múzea na brale Široká–Šimunky (2016) odkryl dve veľkomoravské motyky, kľúč, nože a púchovskú keramiku.'],
  'tollens-bitka-z-doby-bronzovej': ['Tollense – najstaršia známa bitka z doby bronzovej', 'Na rieke Tollense v severnom Nemecku sa okolo roku 1250 pred Kr. stretli tisíce bojovníkov; kosti najmenej 130 mužov menia pohľad na vojny doby bronzovej.'],
  'mohylnik-sverepec-podvrscie': ['Mohylník Sverepec-Podvrščie – hroby slovanských bojovníkov', 'Malý slovanský mohylník Podvrščie pri Sverepci s pochovanými bojovníkmi z 9.–10. storočia, ktorý OZ Hradiská roku 2015 vyčistilo a sprístupnilo verejnosti.'],
  'trzcinica-pl': ['Trzcinica – „Karpatská Trója" a najstaršie valy Malopoľska', 'Trzcinica pri Jasle, zvaná Karpatská Trója: valy do 10 m a 3,5 ha; jedno z najstarších slovanských hradísk s dokladmi väzieb na anatolijsko-balkánsku kultúru.'],
  't-humaj-slovania-prepadli-fransku-jednotku': ['Slovania prepadli franskú jednotku – kresba T. Humaja', 'Kresba T. Humaja podľa Maurikiovho opisu slovanskej taktiky: úklady v húštinách, dýchanie pod vodou cez trstinu a boj s oštepmi a otrávenými šípmi.'],
  'bojova-taktika-madarov-a-inych-kocovnikov': ['Bojová taktika Maďarov a iných kočovníkov', 'Streľba z jazdy a predstieraný ústup – taktika starých Maďarov a kočovníkov od Partov po Skýtov, ktorou porážali aj veľkomoravské a nitrianske vojská.'],
  'muzla-cenkov-nizinne-hradisko-na-brehu-dunaja': ['Mužla-Čenkov – kresba nížinného hradiska na Dunaji', 'Kresba Tomáša Humaja veľkomoravského nížinného hradiska Mužla-Čenkov s drevozemným valom, kamennou plentou a hypotetickou kruhovou svätyňou pri Dunaji.'],
  'lh': ['LH – pozvánka na historický festival (3. ročník)', 'Pozvánka na tretí ročník historického festivalu 3.–4. mája: šerm a bojové ukážky, exotické tance, hudba, sokoliarstvo a ohňová show mnohých skupín.'],
  'utok-frankov-na-hradisko': ['Útok Frankov na hradisko – obliehanie Devína roku 864', 'Ako Frankovia útočili na veľkomoravské hradiská: Fuldské anály opisujú obliehanie Rastislava v hrade Dowina (Devín) roku 864, sprevádza kresba T. Humaja.'],
  'gorazd-petresovicz-zamcisko': ['Zámčisko – báseň Gorazda Petresovicza o hradisku pri Modre', 'Báseň Gorazda Petresovicza o hradisku Zámčisko nad Modrou – o skaliskách hradieb, ktoré chráni Matka Zem, a o tajomstve predkov ukrytom pod pôdou.'],
  'frankovia-rokuju-s-moravanmi': ['Frankovia rokujú s Moravanmi – diplomacia Veľkej Moravy', 'O diplomacii medzi Frankmi a Moravanmi od Fredegara po Fuldské anály, s dobovým opisom pohrômy v Panónii; sprevádza kresba rokovania od T. Humaja.'],
  'nalezy-z-hradiska-dolna-marikova-simunky-siroka': ['Nálezy z hradiska Dolná Mariková – Šimunky (Široká)', 'Prvýkrát publikované fotografie nálezov z povrchového prieskumu J. Moravčíka (2000) na hradisku Šimunky–Široká: púchovská kultúra, Veľká Morava aj stredovek.'],
  'kocovni-pastevci-jakozto-najezdnici-od-vychodu': ['Kočovní pastieri – nájazdníci od východu v praveku', 'Článok Jána Padycha o vlnách kočovníkov od východu, ktorí od eneolitu ničili vyspelé hradiská strednej Európy – od ľudu bojových sekeromlatov po Skýtov.'],
  'vitazstvo': ['Víťazstvo – kresba a dobové správy o vpáde Maďarov (889)', 'Kresba doplnená dobovými citátmi o príchode Maďarov roku 889: ako ich Pečenehovia vyhnali zo skýtskych sídel a ako začali nájazdy na Moravanov a Korutáncov.'],
  'vyprava-polske-hradiska-3-gdansk-a-owidz': ['Výprava Poľské hradiská 3 – Gdansk a hradisko Owidz', 'Posledný deň výpravy OZ Hradiská 2022: staré mesto Gdansk, pobrežie Baltiku a návšteva zrekonštruovaného slovanského hradiska Owidz.'],
  'vyprava-polske-hradiska-2-biskupin-wenecja-wiszogrod-gora-zamkowa': ['Výprava Poľské hradiská 2 – Biskupin, Wenecja, Wyszogród', 'Druhá časť výpravy 2022 do Poľska: archeoskanzen Biskupin s lužickým hradiskom a slovanskou osadou, ďalej Wenecja, Wyszogród a Góra Zamkowa.'],
  'vyprava-polske-hradiska-krakow-a-bnin-den-1': ['Výprava Poľské hradiská – Krakov a Bnin (deň 1)', 'Prvý deň výpravy deviatich členov OZ Hradiská do Poľska (2022): archeologické múzeum v Krakove so slovanskou modlou a hradisko v Bnine.'],
  'vyprava-k-vikingom-2013-2-cast': ['Výprava k Vikingom 2013 – 2. časť (Gotland)', 'Druhá časť cestopisu Ľubky za Vikingami (2013): skanzen v Bildstenar, gotlandské runové kamene Hamar a skalné útvary rauky na Langhammars.'],
  'vyprava-k-vikingom-2013-1-cast': ['Výprava k Vikingom 2013 – 1. časť (Škandinávia)', 'Cestopis Ľubky z OZ Hradiská za históriou Vikingov (2013): lodné kamene Ale je Stones pri Kaseberge v južnom Švédsku a legenda o kráľovi Alem.'],
  'tabula-na-hradisku-holis-nimnica': ['Informačná tabuľa na hradisku Holíš (Nimnica)', 'OZ Hradiská osadilo roku 2020 novú informačnú tabuľu na výšinnom sídlisku púchovskej kultúry Holíš nad kúpeľmi v Nimnici.'],
  'informacne-tabule-predna-horka-a-klape': ['Informačné tabule Predná hôrka a Klape (Jasenica, Udiča)', 'Dve tabule OZ Hradiská na náučnom chodníku Jasenica–Udiča (2018) venované hrádkom púchovskej kultúry Predná hôrka a Klape.'],
  'socha-a-tabula-na-orgonovej-kycere': ['Socha a tabuľa na Orgoňovej Kýčere v Javorníkoch', 'Odhalenie 3-metrovej sochy Starého Orgoňa a informačnej tabule na Orgoňovej Kýčere (2018) s povesťou o poslednom pohanskom žrecovi v Javorníkoch.'],
  'oprava-tabule-v-pruzine': ['Oprava informačnej tabule v Pružine (Mesciská)', 'OZ Hradiská s podporou obce Pružina opravilo poškodenú informačnú tabuľu na slovanskom hradisku Mesciská; oprava stála 50 eur.'],
  'tabula-nosice-hradisko': ['Informačná tabuľa Nosice – hradisko púchovskej kultúry', 'Devätnásta informačná tabuľa OZ Hradiská osadená na sviatok Samhain na hradisku púchovskej kultúry v Nosiciach v spolupráci s mestom Púchov.'],
  'nase-tabule-visolaje-slovansky-mohylnik': ['Informačné tabule Visolaje – slovanský mohylník', 'OZ Hradiská osadilo roku 2017 vo Visolajoch tabule pri mohylovom pohrebisku z obdobia Veľkej Moravy; akciu podporili Slovania v dobovom tábore.'],
  'informacne-tabule-dolne-oresany-slepy-vrch': ['Informačné tabule Dolné Orešany – Slepý vrch', 'Osadenie dvoch informačných tabúľ ku keltskému hradisku Slepý vrch v Dolných Orešanoch (2015) s podporou obce a výkladom archeológa M. Sládka.'],
  'informacna-tabula-hradisko-maly-manin': ['Informačná tabuľa – hradisko Malý Manín', 'OZ Hradiská osadilo informačnú tabuľu na hradisku lužickej a púchovskej kultúry Malý Manín (Považská Teplá) s odbornou pomocou Považského múzea.'],
  'informacne-tabule-prosne-zlaty-kon-a-uhliska': ['Informačné tabule Prosné – Zlatý kôň a Uhliská', 'Osadenie dvoch tabúľ púchovskej kultúry (2014) – na hrádku Zlatý kôň a obetisku Uhliská – za účasti archeológov a keltskej skupiny Vae Victis.'],
  'informacna-tabula-hatne': ['Informačná tabuľa Hatné – hrádky Hatňanská Skala a Hrádek', 'OZ Hradiská osadilo roku 2013 informačnú tabuľu pri hrádkoch v Hatnom (Hatňanská Skala a Hrádek); text odborne skontroloval archeológ Jozef Moravčík.'],
  'informacna-tabula-modra-zamcisko': ['Informačná tabuľa Modra – Zámčisko', 'Odhalenie informačnej tabule na hradisku Zámčisko nad Modrou (2013) v spolupráci s mestom Modra; text konzultovaný s Dr. Zdenkom Farkašom.'],
  'informacna-tabula-pruzina': ['Informačná tabuľa Pružina – hradisko Mesciská', 'OZ Hradiská osadilo roku 2013 pri osade Ritka pod slovanským hradiskom Mesciská informačnú tabuľu; na akciu prišli objavitelia hradiska z 90. rokov.'],
  'informacna-tabula-marikova-simunky': ['Informačná tabuľa Mariková – Šimunky', 'Osadenie informačnej tabule pri slovanskom hradisku Šimunky v Dolnej Marikovej (2013) s Maticou slovenskou a objaviteľom hradiska Gašparom Zemančíkom.'],
  'kronika-dusi-roman-o-tatarskom-vpade': ['Kronika duší – román o tatárskom vpáde na stiahnutie', 'Historický román Pavla Satka zasadený do tatárskeho vpádu do Uhorska v rokoch 1241–1242, ktorý si možno zdarma stiahnuť; s autorovým úvodom.'],
  'skalka-zahadny-kostolik-na-hradisku': ['Skalka – záhadný kostolík na slovanskom hradisku Chochel', 'Vizualizácia záhadného kostolíka (loď 5,3 × 5,4 m s apsidou) na hradisku Chochel v Skalke nad Váhom, možno z čias Veľkej Moravy, s upírskym hrobom vo vnútri.'],
  'horne-plachtince-pohansky-vrch': ['Horné Plachtince – Pohanský vrch, centrálne hradisko', 'Deltoidné hradisko pilínskej a kyjatickej kultúry na Pohanskom vrchu (501 m) v Krupinskej vrchovine s jedným z najväčších valov a žiarovým pohrebiskom.'],
};

async function findDoc(slug) {
  // GET cez public (api-token nemá find právo → 401); documentId stačí na PUT
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slug)}&fields[0]=documentId`);
  const j = await r.json();
  return (j.data || [])[0] || null;
}

async function main() {
  const entries = Object.entries(SEO);
  console.log(`SEO záznamov: ${entries.length}  | režim: ${COMMIT ? 'COMMIT (PUT)' : 'iba VALIDÁCIA'}\n`);
  let over = 0;
  for (const [slug, [t, d]] of entries) {
    const tl = [...t].length, dl = [...d].length;
    const bad = tl > 70 || dl > 160;
    if (bad) { over++; console.log(`  ✗ ${slug}  T=${tl} D=${dl}  ${tl > 70 ? 'TITLE>70 ' : ''}${dl > 160 ? 'DESC>160' : ''}`); }
  }
  if (over) { console.log(`\n⛔ ${over} cez limit — oprav pred PUT.`); process.exit(1); }
  console.log('✓ všetkých 60 v limite (T≤70, D≤160).');
  if (!COMMIT) { console.log('\n(validácia OK — spusti s --commit na zápis)'); return; }

  let ok = 0, skip = 0, fail = 0;
  for (const [slug, [metaTitle, metaDescription]] of entries) {
    const doc = await findDoc(slug);
    if (!doc) { console.log(`⚠ ${slug}: nenájdený`); fail++; continue; }
    try {
      const r = await fetch(`${BASE}/api/blog-posts/${doc.documentId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ data: { metaTitle, metaDescription } }),
      });
      if (r.ok) { ok++; process.stdout.write('.'); }
      else { fail++; console.log(`\n❌ ${slug}: ${r.status} ${(await r.text()).slice(0, 120)}`); }
    } catch (e) { fail++; console.log(`\n❌ ${slug}: ${e.message}`); }
    await sleep(400);
  }
  console.log(`\n\n===== SEO HOTOVO: ${ok} zapísaných, ${skip} preskočených, ${fail} problém =====`);
}
main();

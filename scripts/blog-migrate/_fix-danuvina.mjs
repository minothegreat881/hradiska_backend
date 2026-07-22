/**
 * Korektúra danuvina-alacris-opat-na-vodach-dunaja.
 * ~46 gramatických/typografických opráv + zjednotenie názvu lode (Danuvina Alacris)
 * + odstránenie duplicitnej vety o Comagene + zmäkčenie faktu o Veltlínskom (CERTAINTY_LOST)
 * + strip zero-width znakov. Mení LEN text (telo + excerpt + meta). Obrázky/štruktúra zachované.
 *   node _fix-danuvina.mjs [--commit]
 *
 * NEMENÍ (flag pre používateľa):
 *   - „okolo roku 48" pri Rugioch — faktický rozpor, ale je to znenie zdroja (neoverujem/nemením).
 *   - h1 title — verzálky ostávajú len v nadpise.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '.env') });
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN;
const COMMIT = process.argv.includes('--commit');
const nfc = (s) => (s == null ? s : String(s).normalize('NFC'));

const LQ = '„'; // „
const RQ = '“'; // “  (slovenská zatváracia)
const EN = '–'; // –

const REPL = [
  // ── zjednotenie názvu lode (verzálky → normálne skloňovanie; verzálky len v h1) ──
  ['menom DANUVINA ALACRIS', 'menom Danuvina Alacris'],          // rt#0 + excerpt
  ['palubu DANUVINY ALACRIS', 'palubu Danuviny Alacris'],        // rt#7
  ['DANUVINA ALACRIS ostáva', 'Danuvina Alacris ostáva'],        // rt#12

  // ── rt#0 ──
  ['zo 4 storočia', 'zo 4. storočia'],                           // #1 (excerpt)
  ['Living Danube Limes".', 'Living Danube Limes' + RQ + '.'],   // #2 zlá zatváracia úvodzovka
  ['z Univerzity Friedricha-Alexandra v Erlangen-Norimberu.', 'z Univerzity Friedricha Alexandra v Erlangene a Norimbergu.'], // #3
  [' , skúma', ', skúma'],                                       // #4 medzera pred čiarkou (po linku)
  ['testovaním rímskych riečnych lodí', 'testovaním rímskych riečnych lodí.'], // #5 bodka na konci

  // ── rt#1 ──
  ['antického námorníctva ( ', 'antického námorníctva ('],       // #6a zátvorka
  [' . Museum für antike Schifffahrt ),', '. Museum für antike Schifffahrt),'], // #6b

  // ── rt#2 ──
  ['drevo zo stromu dub a smrekovec', 'drevo duba a smrekovca'], // #7

  // ── rt#3 ──
  ['Vetera I.', 'Vetera I'],                                     // konzist.: bodka za rím. číslicou preč
  ['Vetera II.', 'Vetera II'],
  ['rokov 13/12 pnl až r. 70', 'rokov 13/12 pred n. l. až do r. 70'], // #9
  ['do približne 3 storočia', 'do približne 3. storočia'],       // #10
  ['vzdialené cca 1500m', 'vzdialené cca 1 500 m'],              // #11
  ['v súčastnej dobe', 'v súčasnosti'],                          // #12
  // #13+#14+#15 + preklad + názov: prepis celej rozbitej vety
  ['DANUVINA ALACRIS z lat. v preklade ako živý Dunaj ' + EN + ' ako dostala meno replika veslice sa plavila z Nemecka ' + EN + ' z Ingolstatu do Rumunska v roku 2022 a preplávala cca 2400 km po Dunaji.',
   'Replika veslice, ktorá dostala meno Danuvina Alacris (z lat. ' + LQ + 'svižná dunajská' + RQ + '), sa plavila z Nemecka ' + EN + ' z Ingolstadtu do Rumunska v roku 2022 a preplávala cca 2 400 km po Dunaji.'],
  ['Dunaj a Dunajský Limes zohráva', 'Dunaj a dunajský limes zohráva'], // #16
  ['okolo 2850 km', 'okolo 2 850 km'],                           // typografia tisícov
  ['v Nemecku, Na hraniciach', 'v Nemecku a na hraniciach'],     // #17

  // ── rt#4 ──
  ['sme Vám priniesli', 'sme vám priniesli'],                    // #18
  ['(HU) ( nájdete ho tu: ', '(HU) ' + EN + ' nájdete ho tu: '], // #19a
  [') 18.4.2024 sa toto unikátne', '. 18. 4. 2024 sa toto unikátne'], // #19b + #20 dátum

  // ── rt#5 ──
  ['mali vždy chuť na jemné veci, pestovali', 'mali vždy záľubu v jemných veciach, pestovali'], // #22

  // ── rt#6 ──
  ['lichotí našim očiam, nosom a podnebím', 'lahodí našim očiam, nosu a podnebiu'], // #23
  // #4(fakt CERTAINTY_LOST) + #24: prepis vety o víne
  ['Rímski vinári pravdepodobne vytvorili Veltlínske zelené, viedenské domáce, farmárske a vidiecke víno.',
   'Rímski vinári pravdepodobne položili základy vinohradníctva, z ktorého neskôr vzišli miestne odrody.'],

  // ── rt#8 ──
  ['vyrazila loď dňa 19.04.2024 v ranných', 'vyrazila loď dňa 19. 4. 2024 v ranných'], // #20
  ['O 9.30 v nákladnom', 'O 9.30 h v nákladnom'],                // #26 (h)
  ['len okolo 6 až 7' + '°' + 'C', 'len okolo 6 až 7 ' + '°' + 'C'], // #27
  ['spred 2 rokov', 'spred dvoch rokov'],                        // #28

  // ── rt#9 ──
  ['komore Altenworth', 'komore Altenw' + 'ö' + 'rth'],     // #29 Altenwörth
  ['na 1979,8 km', 'na 1 979,8 km'],                             // #30
  ['plavebnú komoru bol silný zážitok', 'plavebnú komoru bolo silným zážitkom'], // #31
  ['pôsobilo trochu komicky na našich tunikách', 'na našich tunikách pôsobilo trochu komicky'], // #32
  ['mestu Tulln - mesto s 2000 ročnou históriou', 'mestu Tulln ' + EN + ' mestu s 2 000-ročnou históriou'], // #33

  // ── rt#11 ──
  ['Jeho posádka kontrolovala', 'Jej posádka kontrolovala'],     // #34
  ['ako sklad dreva a zeminy', 'ako pevnosť z dreva a zeminy'],  // #35
  ['Od doby jeho osídlenia', 'Od začiatku jej osídlenia'],       // #36
  // duplicita Comagena — vypustiť druhú vetu
  ['jednotky. Od neskorej antiky bola Comagena dokonca námornou základňou dunajskej flotily. Na západe',
   'jednotky. Na západe'],
  ['Na západe a juhu predhradia výskumy odhalili', 'Na západ a juh od pevnosti výskumy odhalili'], // #37
  ['s repopuláciou začiatkom 8. storočia', 's opätovným osídlením začiatkom 8. storočia'], // #38

  // ── rt#12 ──
  ['V auguste tohto roku by mala byť', 'V auguste 2024 by mala byť'], // #39
  ['Rímskej ríše".', 'Rímskej ríše' + RQ + '.'],                 // #40 (ak je rovná úvodzovka)
  ['by mala byť znovu späť prevezená', 'by mala byť prevezená späť'], // #41
  ['opustí 10.10.2024 a vydá', 'opustí 10. 10. 2024 a vydá'],    // #20

  // ── rt#14 (zoznam technických údajov) ──
  ['18 m dĺžka', '18 m ' + EN + ' dĺžka'],                       // #42
  ['2,8 m šírka v najširšej časti', '2,8 m ' + EN + ' šírka v najširšej časti'], // #42
  ['5-6 ton pohotovostná hmotnosť', '5 ' + EN + ' 6 ton ' + EN + ' pohotovostná hmotnosť'], // #43
  ['postavené výhradne galorímskymi', 'postavená výhradne galorímskymi'], // #44 rod (loď)
];

const applied = [];
function ap(t) {
  if (typeof t !== 'string') return t;
  let s = nfc(t).replace(/​/g, ''); // strip zero-width space (#21)
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } }
  return s;
}
// rekurzívny prechod (paragraph / link / list / list-item)
function walk(node) {
  if (node && typeof node.text === 'string') node.text = ap(node.text);
  if (node && Array.isArray(node.children)) node.children.forEach(walk);
}
function stripIds(o) {
  if (Array.isArray(o)) return o.map(stripIds);
  if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) { if (k === 'id') continue; r[k] = stripIds(o[k]); } return r; }
  return o;
}
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  return stripIds(b); // sources/embed/… — hlboký strip id (aj items)
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=danuvina-alacris-opat-na-vodach-dunaja&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=metaTitle&fields[2]=metaDescription&fields[3]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || ''), newMetaT = ap(d.metaTitle || ''), newMetaD = ap(d.metaDescription || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  const uniq = [...new Set(applied)];
  console.log('aplikovaných párov:', uniq.length, '/', REPL.length, '| celkom výskytov:', applied.length);
  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  if (miss.length) { console.log('\n⚠ NENÁJDENÉ (' + miss.length + '):'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m).slice(0, 90))); }
  else console.log('✓ všetkých ' + REPL.length + ' párov sa trafilo');
  const imgs = outBlocks.filter((b) => b.__component === 'content.image-block');
  console.log('blokov:', outBlocks.length, '| image-block:', imgs.length, '| s image.id:', imgs.filter((b) => b.image).length);

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, metaTitle: newMetaT, metaDescription: newMetaD, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

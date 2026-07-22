/**
 * Korektúra bronzovy-poklad-z-hradiska-na-strednom-povazi.
 * Doplnenie 3 orezaných miest z originálu + ~35 gramatických/typografických opráv.
 * Zachováva obrázky (image-block); mení len text (telo + excerpt + meta).
 *   node _fix-bronzovy-poklad.mjs [--commit]
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
const DOC = null; // doplní sa z GET

const Q1 = '„'; // „
const Q2 = '“'; // "

const REPL = [
  // — doplnenie orezaných častí (z originálneho blogu) —
  ['ľudia, …rovnaký cieľ', 'ľudia, ktorých spája rovnaký cieľ'],
  ['celkom pekný. …prvý signál', 'celkom pekný. Aj keď je to prvý signál'],
  ['príklad toho, …ak všetci ťaháme', 'príklad toho, ako sa veci robiť dajú, ak všetci ťaháme'],
  // — gramatika / typografia —
  ['Tak, ako je rozdelená celá spoločnosť', 'Tak ako je rozdelená celá spoločnosť'],                 // 1
  ['na trh, s vierou, že', 'na trh s vierou, že'],                                                     // 2
  ['ne-akademický', 'neakademický'],                                                                   // 3
  ['predpokladali, že lokalita by mohla mať', 'predpokladali, že by lokalita mohla mať'],              // 4
  ['Na druhej strane bol však predpoklad, že môže byť tiež ohrozená', 'Na druhej strane však bol predpoklad, že môže byť ohrozená aj'], // 5
  ['ktoré väčšinou bývajú', 'ktoré býva väčšinou'],                                                    // 6
  ['z LIDAR-u', 'z lidaru'], ['(LIDAR)', '(lidar)'], [Q1 + 'LIDAR', Q1 + 'lidar'],                     // 7 (zjednotenie)
  ['združenia ako sme my bez archeológa', 'združenia, ako sme my, bez archeológa'],                    // 8
  ['ráno, kedy sme plní očakávaní', 'ráno, keď sme plní očakávaní'],                                   // 10
  ['Peťo ešte počas môjho nastavovania mi hovorí krátko po nastavení svojej mašiny:', 'Peťo mi ešte počas môjho nastavovania hovorí:'], // 11
  [Q1 + 'Tu mám hneď' + Q2 + ' signál.', Q1 + 'Tu mám hneď signál.' + Q2],                             // 12
  ['Ja na to ' + Q1 + 'Jasne Peťo veď skús' + Q2 + '.', 'Ja na to: ' + Q1 + 'Jasne, Peťo, veď skús.' + Q2], // 13
  ['treba ho proste kopnúť', 'treba ho jednoducho kopnúť'],                                            // 14
  ['na kolenách a pomaly odkrýval', 'na kolenách, pomaly odkrýval'],                                   // 15
  ['pričom dohľadávačka ešte ani náznak signálu', 'pričom dohľadávačka nehlásila ešte ani náznak signálu'], // 16
  ['Šiel som stále hlbšie až som narazil', 'Šiel som stále hlbšie, až som narazil'],                   // 17
  ['že snáď som padol na bradaticu', 'že som azda padol na bradaticu'],                                // 18
  ['Čo to máme hoši?', 'Čo to máme, hoši?'],                                                           // 20
  ['Vzhľadom na to, že bolo evidentné, že sa jedná o veľký depot', 'Keďže bolo evidentné, že ide o veľký depot'], // 21
  ['12. – 11. stor. pred naším letopočtom', '12.–11. stor. pred n. l.'],                     // 22
  ['Nález bol nájdený vďaka', 'Nález sa podarilo objaviť vďaka'],                                       // 23
  ['štátneho orgánu a ochoty dobrovoľníkov', 'štátneho orgánu a ochote dobrovoľníkov'],                // 24
  ['spĺňa ako náročné požiadavky odbornosti, tak zákonnosti postupu', 'spĺňa tak náročné požiadavky odbornosti, ako aj zákonnosť postupu'], // 25
  ['Táto bola vykonávaná v spolupráci', 'Konzervácia sa vykonávala v spolupráci'],                     // 26
  ['nález, ktorý tu bol premiestnený v bloku hliny', 'nález, ktorý sem bol premiestnený v bloku hliny'], // 28
  ['celý proces so silným akcentom na interdisciplinárny prístup, bol (a priebežne je)', 'celý proces – so silným akcentom na interdisciplinárny prístup – bol (a priebežne je)'], // 29
  ['Depot bude publikovaný ako v odborných periodikách, tak v popularizačnej literatúre', 'Depot bude publikovaný tak v odborných periodikách, ako aj v popularizačnej literatúre'], // 30
  ['o otázky ochrany archeologických pamiatok a nálezov', 'o otázky ochrany archeologických pamiatok a nálezov.'], // 31
  ['múzejnej zbierke a tým, keď je bez', 'múzejnej zbierke, a tým, keď je bez'],                       // 32
  ['zdokumentovaný a preto bude zdrojom', 'zdokumentovaný, a preto bude zdrojom'],                      // 33
  ['buď z nelegálnych výkopov alebo boli nájdené', 'buď z nelegálnych výkopov, alebo boli nájdené'],   // 34
  ['v dobe bronzovej a teda aj jeho finálnej interpretácie', 'v dobe bronzovej, a teda aj jeho finálnej interpretácie'], // 35
  ['význam ktorého po jeho riadnom odbornom spracovaní', 'ktorého význam po riadnom odbornom spracovaní'], // 36
  ['z viacerých terénnych aktivít, cieľom ktorých je', 'z viacerých terénnych aktivít, ktorých cieľom je'], // 37
];

const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); for (const n of body) for (const c of n.children || []) { if (typeof c.text === 'string') c.text = ap(c.text); } return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=bronzovy-poklad-z-hradiska-na-strednom-povazi&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=metaTitle&fields[2]=metaDescription&fields[3]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || ''), newMetaT = ap(d.metaTitle || ''), newMetaD = ap(d.metaDescription || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  const uniq = [...new Set(applied)];
  console.log('aplikovaných párov:', uniq.length, '/', REPL.length, '| celkom výskytov:', applied.length);
  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  if (miss.length) { console.log('\n⚠ NENÁJDENÉ (' + miss.length + '):'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m).slice(0, 80))); }
  else console.log('✓ všetkých', REPL.length, 'párov sa trafilo');
  console.log('blokov:', outBlocks.length, '| image-block:', outBlocks.filter((b) => b.__component === 'content.image-block').length);

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, metaTitle: newMetaT, metaDescription: newMetaD, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 250));
}
main();

/**
 * Opravy tragedia-jedneho-uspesneho-obsadenia-vlasti (preklad z HU).
 * Aplikované body: 1,2,3,4,5,6,7,8,10,14,16,18,20,21,24,27,30,36,39,40,44.
 * #9 (rod „gesta" naprieč textom) a #32 (logika vety o Mosaburgu) NEmením — vecná/prekladová nejasnosť.
 * #14 zjednotené na „Šimon z Kézy". Ostatné „v poriadku" body bez zmeny.
 *   node _fix-tragedia.mjs [--commit]
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
const NBSP = ' ';
const stripIds = (o) => Array.isArray(o) ? o.map(stripIds) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)])) : o);

const REPL = [
  ['susedov, a ktoré pomaly', 'susedov a ktoré pomaly'],                                                       // #2
  ['Maď. akad. vied', 'Maďarská akadémia vied'],                                                                // #3
  ['medzi iným napísal', 'okrem iného napísal'],                                                                // #4
  ['To, že mesiac denne vychádza', 'To, že Mesiac denne vychádza'],                                             // #5
  ['s obsadením vlasti a k dejinám storočia', 's obsadením vlasti a s dejinami storočia'],                      // #6
  ['Nadarmo sú výsledky výskumov, keď ešte vždy platí', 'Márne sú výsledky výskumov, keď ešte stále platí'],    // #7
  ['Nestretávajú sa s odporom, a keď – s rozprávkovou ľahkosťou víťazia', 'Nestretávajú sa s odporom, a keď, tak s rozprávkovou ľahkosťou víťazia'], // #8
  ['dali preto Bonfini-mu vypracovať', 'dali preto Bonfinimu vypracovať'],                                      // #10
  ['Simona z Kézy', 'Šimona z Kézy'],                                                                           // #14 (3×)
  ['habsburgskej monarchie', 'habsburskej monarchie'],                                                          // #16
  ['spolčiť sa s okupujúcou Osmanskou', 'spolčiť s okupujúcou Osmanskou'],                                       // #18
  ['budúcnosť bude priam bezvýchodiskovou', 'budúcnosť bude priam bezvýchodisková'],                            // #20
  ['zahrňujúcu celú karpatskú kotlinu', 'zahŕňajúcu celú karpatskú kotlinu'],                                    // #24
  ['sa pravdepodobne chovali rovnako', 'sa pravdepodobne správali rovnako'],                                     // #27
  ['sa kto mohol, uchýlil sa do bezpečia', 'sa každý, kto mohol, uchýlil do bezpečia'],                          // #30
  ['si skôr-neskôr osvojili', 'si skôr či neskôr osvojili'],                                                     // #36
  ['feudálny hierarchistický systém', 'feudálny hierarchický systém'],                                           // #39
  ['princov Bela, Gejzu a Ladislava', 'princov Belu, Gejzu a Ladislava'],                                        // #40
  ['Preklad: Kveta M', 'Preklad: Kveta M.'],                                                                     // #44
];
// #21 popiska obrázka
const CAP_FROM = 'rimska pevnost na Sibrikovom vrsku vo Visegráde ktorá bola prestavaná';
const CAP_TO = 'Rímska pevnosť na Šibrikovom vŕšku vo Visegráde, ktorá bola prestavaná';

const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };

let nbspHit = false, capHit = false;
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = stripIds(JSON.parse(JSON.stringify(b.body || [])));
    body.forEach(walk);
    // #1 medzera pred odkazom archeologia.hu (text končí „…maďarskej stránke")
    for (const n of body) {
      const kids = n.children || [];
      for (let k = 0; k < kids.length; k++) {
        const c = kids[k];
        if (typeof c.text === 'string' && /maďarskej stránke$/.test(nfc(c.text)) && kids[k + 1]?.type === 'link') { c.text = nfc(c.text) + NBSP; nbspHit = true; }
      }
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') {
    const { id, image, ...rest } = b;
    if (nfc(rest.caption || '').includes(nfc(CAP_FROM))) { rest.caption = nfc(rest.caption).split(nfc(CAP_FROM)).join(CAP_TO); capHit = true; }
    if (nfc(rest.alt || '').includes(nfc(CAP_FROM))) { rest.alt = nfc(rest.alt).split(nfc(CAP_FROM)).join(CAP_TO); }
    return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image };
  }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=tragedia-jedneho-uspesneho-obsadenia-vlasti&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('REPL:', [...applied].length, '/', REPL.length, '| #1 NBSP:', nbspHit, '| #21 popiska:', capHit);
  REPL.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ NEAPLIKOVANÉ: ' + JSON.stringify(m).slice(0, 55)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

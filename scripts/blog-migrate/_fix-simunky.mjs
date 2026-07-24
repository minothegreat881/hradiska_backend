/**
 * Opravy simunky-siroka-hradiste-koscelisko (odborný text). 1. kolo — jednoznačné textové opravy.
 * #2 (Šimunky/Šimúnky) a #19 (rozhádzaný sources blok) sa riešia zvlášť po dohode.
 *   node _fix-simunky.mjs [--commit]
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
const stripIds = (o) => Array.isArray(o) ? o.map(stripIds) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)])) : o);

const REPL = [
  ['cesty, vedúcej popod hradisko', 'cesty vedúcej popod hradisko'],                            // #1
  [' predstavujú pozoruhodné krajinné', ', predstavujú pozoruhodné krajinné'],                   // #3 (za odkazom [2])
  ['s osídlení na Šimúnkach', 's osídlením na Šimúnkach'],                                        // #4
  ['archelologické nálezy', 'archeologické nálezy'],                                              // #5
  ['(ako toponimum), zatiaľ nie je známe', '(ako toponymum). Zatiaľ nie je známe'],               // #6
  ['môže byť zaznamená práve', 'môže byť zaznamenaná práve'],                                      // #7
  ['je zreteľne základ Rad-, býva častý', 'je zreteľne základ Rad-, ktorý býva častý'],            // #8
  ['v miestnej tradícií uchovávané', 'v miestnej tradícii uchovávané'],                            // #11
  ['s nábožnenským uctievaním', 's náboženským uctievaním'],                                       // #12
  ['Práve jazerá, alebo jazierka', 'Práve jazerá alebo jazierka'],                                 // #13
  [', alebo nepriamo', ' alebo nepriamo'],                                                         // #14 (za odkazom [6])
  ['Enciklopedie slovanských bohů', 'Encyklopedie slovanských bohů'],                              // #15
  ['Uhlár 1970 – V.: Dva vlastnícke názvy z hornej Nitry', 'Uhlár 1970 – V. Uhlár: Dva vlastné názvy z hornej Nitry'], // #16
  ['Slovenská Reč. Časopis pre výskum Slovenského jazyka', 'Slovenská reč. Časopis pre výskum slovenského jazyka'],    // #17
  ['ZM 1: 10 000', 'ZM 1 : 10 000'],                                                              // #18
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = stripIds(JSON.parse(JSON.stringify(b.body || []))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.sources') { const { id, ...rest } = b; const items = (rest.items || []).map(it => { const { id, ...r } = it; return { ...r, text: ap(r.text) }; }); return { __component: 'content.sources', ...stripIds({ ...rest, items: undefined }), items }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=simunky-siroka-hradiste-koscelisko-mozne-suvislosti&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('aplikovaných:', [...applied].length, '/', REPL.length);
  REPL.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ NEAPLIKOVANÉ: ' + JSON.stringify(m).slice(0, 50)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

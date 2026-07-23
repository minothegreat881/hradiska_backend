/**
 * Opravy vyskum-na-hradisku-simunky-v-dolnej-marikovej (telo + časová os).
 * Obnova 2 stratených kusov zo zdroja + 11 gram./typo. Sources blok zachovaný (stripIds).
 *   node _fix-simunky-vyskum.mjs [--commit]
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
  ['Našim cieľom preto bolo', 'Naším cieľom preto bolo'],                                   // #2
  ['s našim združením', 's naším združením'],                                               // #1
  ['Severozápadného Považia', 'severozápadného Považia'],                                    // #3
  ['páni Štefan Meliš ( vo svojich', 'páni Štefan Meliš (vo svojich'],                        // #4
  ['strelky zo šípov', 'hroty šípov'],                                                        // #5
  ['ataše z vedierok', 'atašé z vedierok'],                                                   // #6
  ['prelomu letopočtov (Púchovská kultúra) môžem', 'prelomu letopočtov (púchovská kultúra), môžem'], // #7
  ['Púchovská kultúra', 'púchovská kultúra'],                                                 // #8 (časová os)
  ['Martausovej - Trúchlej', 'Martausovej-Trúchlej'],                                         // #10
  ['na facebooku', 'na Facebooku'],                                                           // #11
];
const RX = [
  [/[…]+o rozmeroch 1/gu, 'vykopali jednu sondu o rozmeroch 1'],                         // obnova rt#6
  [/[…]+v obdob/gu, 'osídlené prinajmenšom v obdob'],                                     // obnova rt#10
  [/deň D [—–-] \(resp\. dva dni D\) [—–-] a to/gu, 'deň D (resp. dva dni D) a to'], // #9
];
const applied = new Set();
function ap(t) {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } }
  for (const [rx, b] of RX) { if (rx.test(s)) { s = s.replace(rx, b); applied.add(rx.source.slice(0, 12)); } }
  return s;
}
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = stripIds(JSON.parse(JSON.stringify(b.body || []))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyskum-na-hradisku-simunky-v-dolnej-marikovej&populate[blocks][populate]=*&populate[timeline]=true&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  const newTimeline = (d.timeline || []).map(t => ({ year: ap(t.year), title: ap(t.title), description: ap(t.description), type: t.type }));
  console.log('aplikovaných:', [...applied].length, '/', REPL.length + RX.length);
  const miss = [...REPL.map(([a]) => a), ...RX.map(([r]) => r.source.slice(0, 12))].filter(a => !applied.has(a));
  if (miss.length) miss.forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 45)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks, timeline: newTimeline } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

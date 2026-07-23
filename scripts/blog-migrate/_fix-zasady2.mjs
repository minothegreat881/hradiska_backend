/**
 * Korektúra + zjednotenie členenia zakladne-zasady-oz-hradiska (po re-migrácii).
 * 15 opráv + povýšenie sekcií 3/5/8 na nadpisy (konzistencia s 1/2/4/6/7).
 *   node _fix-zasady2.mjs [--commit]
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
const EN = '–', LQ = '„', RQ = '“';

const REPL = [
  ['(ďalej len "združenie"), je predovšetkým', '(ďalej len ' + LQ + 'združenie' + RQ + ') je predovšetkým'], // #1
  ['jeho usmerneniu', 'jeho usmerňovaniu'],                                                    // #2
  ['rozvoju turizmu na hradištné lokality', 'rozvoju turizmu do hradištných lokalít'],          // #3
  ['národných dejín - včasný stredovek', 'národných dejín ' + EN + ' včasný stredovek'],        // #4
  ['populárno náučných', 'populárno-náučných'],                                                 // #5
  ['Za týmto účelom', 'Na tento účel'],                                                         // #6
  ['hradiská na slovensku', 'hradiská na Slovensku'],                                           // #7
  ['a viery Slovanov a Keltov', 'a viery Slovanov a Keltov.'],                                  // #9 bod 5 bodka
  ['napĺňaní cieľov občianskeho združenia', 'napĺňaní cieľov občianskeho združenia.'],          // #9 bod 6 bodka
  ['nie len na detektorovaní', 'nielen na detektorovaní,'],                                     // #10
  ['o prebiehajúcich výskumoch.Rovnako platí', 'o prebiehajúcich výskumoch. Rovnako platí'],    // #11
  ['bez povolenia archeologov', 'bez povolenia archeológov'],                                    // #12
  ['Detektorovnie s nami', 'Detektorovanie s nami'],                                            // #13
  ['ktorí nie sú členmi združenia nepreberá združenie', 'ktorí nie sú členmi združenia, nepreberá združenie'], // #14
  ['trestného činu poškodzovanie a znehodnocovanie archeologického dedičstva', 'trestného činu poškodzovania a znehodnocovania archeologického dedičstva'], // #15
];
const SECTION_HEADS = new Set([
  '3. Zákaz detektorovania bez súhlasu a vedomosti archeológa',
  '5. Mlčanlivosť',
  '8. Detektorovanie s nami bez členstva v OZ Hradiská',
]);
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
let promoted = 0;
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = stripIds(JSON.parse(JSON.stringify(b.body || [])));
    body.forEach(walk);
    for (const n of body) {
      if (n.type === 'paragraph') { const t = nfc((n.children || []).map(c => c.text || '').join('')).trim(); if (SECTION_HEADS.has(t)) { n.type = 'heading'; n.level = 2; n.children = [{ type: 'text', text: t }]; promoted++; } }
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=zakladne-zasady-obcianskeho-zdruzenia-hradiska&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  const heads = outBlocks.flatMap(b => (b.body || []).filter(n => n.type === 'heading').map(n => (n.children || []).map(c => c.text).join('')));
  console.log('aplikovaných párov:', [...applied].length, '/', REPL.length, '| povýšených na nadpis:', promoted);
  console.log('nadpisy:', JSON.stringify(heads));
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  if (miss.length) miss.forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 50)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

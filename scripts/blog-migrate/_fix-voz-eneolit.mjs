/**
 * Opravy voz-z-obdobia-eneolitu (telo + perex). Embed a meno v odkaze zachované.
 * #3 (Nikollou) NEMENÍM — dvojité „l" potvrdené FB handle nikollh1 aj zdrojom (zámerný zápis).
 *   node _fix-voz-eneolit.mjs [--commit]
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

const REPL = [
  ['Dwarf digital archeology', 'Dwarf Digital Archeology'],            // #1
  ['sa pokúsili o rekonštrukciu', 'sa pokúsil o rekonštrukciu'],       // #2 zhoda j. č.
  ['prvých budovateľov hradísk...', 'prvých budovateľov hradísk.'],    // #5 (3 bodky)
  ['prvých budovateľov hradísk…', 'prvých budovateľov hradísk.'],      // #5 (…)
];
const RX = [
  [/pred Kr\. [—–-] eneolit\)/gu, 'pred Kr. – eneolit)'], // #4 em → en pomlčka
];
const applied = new Set();
function ap(t) {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } }
  for (const [rx, b] of RX) { if (rx.test(s)) { s = s.replace(rx, b); applied.add('#4'); } }
  return s;
}
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=voz-z-obdobia-eneolitu&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('aplikovaných:', [...applied].join(', '), '| embed:', outBlocks.some(b => b.__component === 'content.embed'));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 250));
}
main();

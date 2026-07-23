/**
 * Opravy stanovisko-k-takzvanym-slovansko-arijskym-vedam (titulok + telo autora + perex).
 * NEMENÍ citát Žiarislava (rt#2, rt#3) — chránená zóna; páry cielia len na „Slovansko-Árij…".
 *   node _fix-stanovisko.mjs [--commit]
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
  ['Mor, zvaný Slovansko-Árijské védy už registrujeme', 'Mor zvaný Slovansko-árijské védy už registrujeme'], // #1 + #2
  ['Slovansko-Árijské', 'Slovansko-árijské'],                                               // #2
  ['Slovansko-Árijským', 'Slovansko-árijským'],                                             // #2 (titulok, rt#1)
  ['Ich teórie sú tak hlúpe', 'Ich teórie sú také hlúpe'],                                  // #3
  ['ktoré hlásajú a môj čas je na to príliš drahý', 'ktoré hlásajú, a môj čas je na to príliš drahý'], // #4
  ['jeho postojov, vyjadrených v predmetnom stanovisku', 'jeho postojov vyjadrených v predmetnom stanovisku'], // #5
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=stanovisko-k-takzvanym-slovansko-arijskym-vedam&populate[blocks][populate]=*&fields[0]=title&fields[1]=excerpt&fields[2]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newTitle = ap(d.title || ''), newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('title:', JSON.stringify(newTitle));
  console.log('aplikovaných párov:', [...applied].length, '/', REPL.length);
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  if (miss.length) miss.forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 55)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { title: newTitle, excerpt: newExcerpt, blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 250));
}
main();

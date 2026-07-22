/**
 * Opravy kelti-v-malych-karpatoch (perex + telo). Úvodzovky okolo názvu, „h", fotografií,
 * synchronizácia perexu; odstránenie osamoteného podpisu „Orgoň". Link (Lukáš Ilavský) zachovaný.
 *   node _fix-kelti.mjs [--commit]
 *
 * #6 (meno starostky) NEDOPĹŇAM — v texte nie je a je to „voliteľné, ak nemáš, nechaj".
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
const LQ = '„', RQ = '“';

const REPL = [
  ['s našim OZ', 's naším OZ'],                                                           // #1 (perex)
  ['28.7.2017', '28. 7. 2017'],                                                           // #2 (perex)
  ['s názvom Kelti v Malých Karpatoch.', 's názvom ' + LQ + 'Kelti v Malých Karpatoch' + RQ + '.'], // #3 (perex+telo)
  ['o 17.00 v Dolných', 'o 17.00 h v Dolných'],                                           // #4 (perex+telo)
  ['Ako vidieť z fotiek,', 'Ako vidieť z fotografií,'],                                    // #5 (telo)
];

const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
const blockText = (b) => nfc((b.body || []).map((n) => (n.children || []).map((c) => c.text || '').join('')).join('')).trim();
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=kelti-v-malych-karpatoch&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || [])
    .filter((b) => !(b.__component === 'content.rich-text' && blockText(b) === 'Orgoň')) // #7 podpis preč
    .map(cleanBlock);

  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  console.log('aplikovaných:', [...new Set(applied)].length, '/', REPL.length, '| blokov po:', outBlocks.length, '(bolo', (d.blocks || []).length + ')');
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m))); } else console.log('✓ všetko');

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

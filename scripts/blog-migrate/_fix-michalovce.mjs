/**
 * Opravy michalovce-zivot-na-velkej-morave (perex + telo + alt obrázka). Obrázok zachovaný.
 *   node _fix-michalovce.mjs [--commit]
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
const LQ = '„', RQ = '“', EN = '–';

const REPL = [
  ['28.6.2014', '28. 6. 2014'],                                                              // #1 (perex)
  ['s názvom Život na Veľkej Morave.', 's názvom ' + LQ + 'Život na Veľkej Morave' + RQ + '.'], // #2 (perex+telo)
  ['postavená minulý rok', 'postavená v roku 2013'],                                          // #3 (perex+telo)
  ['Siváci z Košíc, ale viacerí prišli zo vzdialených kútov republiky',
   'Siváci z Košíc, hoci viacerí prišli aj zo vzdialených kútov Slovenska'],                  // #5+#6
  ['a mohli sme vyskúšať, ako chutili.', 'a mohli sme ich aj ochutnať.'],                     // #7 opakovanie
  ['pre deti bolo tiež pripravených množstvo lákavých atrakcií', 'pre deti bolo pripravené aj množstvo lákavých atrakcií'], // #8
  ['Prinášame Vám krátku fotoreportáž', 'Prinášame vám krátku fotoreportáž'],                 // #9
  ['Michalovce - Život na Veľkej Morave', 'Michalovce ' + EN + ' Život na Veľkej Morave'],   // #10 alt obrázka
];

const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; if (typeof rest.alt === 'string') rest.alt = ap(rest.alt); if (typeof rest.caption === 'string') rest.caption = ap(rest.caption); return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=michalovce-zivot-na-velkej-morave&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  console.log('aplikovaných:', [...new Set(applied)].length, '/', REPL.length, '| výskytov:', applied.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m))); } else console.log('✓ všetko');
  console.log('image-block:', outBlocks.filter((b) => b.__component === 'content.image-block').map((b) => 'alt=' + JSON.stringify(b.alt)).join(', '));

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

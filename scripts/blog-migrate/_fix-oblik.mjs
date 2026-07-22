/**
 * Opravy oblik-vyskum-kultovej-hory (perex + telo). Embed (YouTube) zachovaný.
 *   node _fix-oblik.mjs [--commit]
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

const S_OLD = 'V tomto rozhovore sa s archeológmi Mgr. Erikou Makarovou, Ph.D. a PhD., Mgr. Petrom Bistákom venuje Pár praslenov jedinečnej archeologickej lokalite Oblík na východnom Slovensku.';
const S_NEW = 'V tomto rozhovore sa podcast ' + LQ + 'Pár praslenov' + RQ + ' venuje s archeológmi Mgr. Erikou Makarovou, PhD., a Mgr. Petrom Bistákom jedinečnej archeologickej lokalite Oblík na východnom Slovensku.';

const REPL = [
  [S_OLD, S_NEW],                                                                                  // #1+#2+#3
  ['Predstavujeme polohu a charakter lokality', 'Predstavíme si polohu a charakter lokality'],     // #4 zjednotenie perspektívy
  ['Dozvieme sa aj širšie súvislosti osídlenia', 'Dozvieme sa aj o širších súvislostiach osídlenia'], // #5 väzba
  ['spolu s kamošmi z Archeo Moravia', 'spolu s kolegami zo spolku Archeo Moravia.'],              // #6+#7
];

const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=oblik-vyskum-kultovej-hory&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  console.log('aplikovaných:', [...new Set(applied)].length, '/', REPL.length, '| výskytov:', applied.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m).slice(0, 90))); } else console.log('✓ všetko');
  console.log('embed zachovaný:', outBlocks.some((b) => b.__component === 'content.embed'));

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

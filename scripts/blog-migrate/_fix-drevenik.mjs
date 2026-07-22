/**
 * Opravy drevenik-z-vtacej-perspektivy (telo + perex). Len text; embed a link zachované.
 *   node _fix-drevenik.mjs [--commit]
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
  ['Preto sa oň radi podelíme s Vami.', 'Radi sa o ne s vami podelíme.'], // #1 väzba (o ne) + malé v + bez „Preto"
];
const RX = [
  [/obchádzajú[.…]{2,}/g, 'obchádzajú.'],                            // #2 „....“ → jedna bodka
];

const applied = [];
function ap(t) {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } }
  for (const [rx, b] of RX) { if (rx.test(s)) { s = s.replace(rx, b); applied.push(rx.source); } }
  return s;
}
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest; // embed: zachovaj provider/url/embedId/caption
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=drevenik-z-vtacej-perspektivy&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  console.log('aplikovaných:', [...new Set(applied)].length, '| výskytov:', applied.length);
  const all = [...REPL.map(([a]) => a), ...RX.map(([r]) => r.source)];
  const miss = all.filter((a) => !applied.includes(a));
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + m)); } else console.log('✓ všetko');

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

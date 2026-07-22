/**
 * Opravy kniha-ozivena-archeologia (perex + telo). Odkaz (ozivena-archeologia.sk) zachovaný.
 *   node _fix-kniha.mjs [--commit]
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
  ['Dwarf digital archeology', 'Dwarf Digital Archeology'],                                       // #1 vlastné meno
  ['s hradiska.sk vydávajú', 's hradiska.sk vydáva'],                                              // #2 zhoda čísla
  ['Cena je 15 Eur', 'Cena je 15 eur'],                                                            // #3 mena malým
  ['prečítať info o našej', 'prečítať informácie o našej'],                                        // #4 skratka
  ['Po zaslaní objednávky ju zapracujeme', 'Po prijatí objednávky ju spracujeme'],                // #6 perspektíva/väzba
  ['pošleme Vám informačný email a následne knižku poštou', 'pošleme vám informačný e-mail a následne knihu poštou'], // #5+#7
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
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=kniha-ozivena-archeologia&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=metaTitle&fields[2]=metaDescription&fields[3]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || ''), newMetaT = ap(d.metaTitle || ''), newMetaD = ap(d.metaDescription || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  console.log('aplikovaných:', [...new Set(applied)].length, '/', REPL.length, '| výskytov:', applied.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m))); } else console.log('✓ všetko');

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, metaTitle: newMetaT, metaDescription: newMetaD, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

/**
 * Opravy skryte-poklady (telo + perex). Zhoda j. č., zlúčenie viet, prestavba, odkaz malými + bodka.
 *   node _fix-skryte-poklady.mjs [--commit]
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
  // #1 zhoda (podieľalo) + #2 zlúčenie dvoch viet
  ['sa podieľali na tvorbe a vydaní novej knihy o najnovších archeologických nálezoch na rozsiahlom sídlisku v obci Tvrdošovce. Tohto výskumu sa zúčastnili aj členovia nášho združenia.',
   'sa podieľalo na tvorbe a vydaní novej knihy o najnovších archeologických nálezoch na rozsiahlom sídlisku v obci Tvrdošovce, na ktorého výskume sa zúčastnili aj členovia nášho združenia.'],
  // #4 prestavba väzby + #5 slovosled „čo najskôr navštívil"
  ['odporúčam, aby ten, kto túto výnimočnú knihu chce získať, navštívil čo najskôr náš',
   'odporúčam každému, kto túto výnimočnú knihu chce získať, aby čo najskôr navštívil náš'],
  ['výnimočnú knihu chce získať, aby čo najskôr navštívil náš  ', 'výnimočnú knihu chce získať, aby čo najskôr navštívil náš '], // dvojmedzera
  ['OBJEDNÁVKOVÝ FORMULÁR', 'objednávkový formulár'], // #5 verzálky (text odkazu)
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = JSON.parse(JSON.stringify(b.body || []));
    body.forEach(walk);
    // #5: bodka za odkazom, ak veta končí odkazom „objednávkový formulár"
    for (const n of body) {
      if (n.type !== 'paragraph' || !n.children?.length) continue;
      const last = n.children[n.children.length - 1];
      if (last?.type === 'link' && (last.children || []).map(c => c.text).join('') === 'objednávkový formulár') { n.children.push({ type: 'text', text: '.' }); applied.add('bodka'); }
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=skryte-poklady&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('aplikovaných:', [...applied].length, '| páry:', REPL.filter(([a]) => applied.has(a)).length + '/' + REPL.length, '| bodka:', applied.has('bodka'));

  if (!COMMIT) { console.log('\n(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 250));
}
main();

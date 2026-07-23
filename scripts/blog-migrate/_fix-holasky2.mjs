/**
 * Opravy velmozska-mohyla-holasky-2 (7 pol., z toho #5 = rekonštrukcia odrezaného bloku z feedu).
 * Zdroj odrezaného textu: data/halstatska-mohyla-holasky.json → „2 hrobové komory z dubového dreva s rozmermi".
 *   node _fix-holasky2.mjs [--commit]
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

// #4 + #5 spolu: bohemizmus + chýbajúce sloveso „boli" + odrezané „komory z dubového dreva"
const RX_SENT = /bol zahájený výskum a objavené počas neho v 2 mohylách 2 hrobové\s*(?:…|\.{3})?\s*s rozmermi/u;
const SENT_TO = 'sa začal výskum a boli počas neho objavené v 2 mohylách 2 hrobové komory z dubového dreva s rozmermi';

const REPL = [
  ['pred n. l.) Kultúru', 'pred n. l.). Kultúru'],                 // #1 koncová bodka
  ['svojim bohatstvom sa zaraďujú', 'svojím bohatstvom sa zaraďujú'], // #2 svojím
  ['archeologa Martina Goleca', 'archeológa Martina Goleca'],       // #3 dĺžeň
  ['po ľavom dve bronzové vytepávané misy', 'po ľavom boku dve bronzové vytepávané misy'], // #6 elipsa „boku"
];
const applied = new Set(); let sentDone = false;
const ap = (t) => {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  if (RX_SENT.test(s)) { s = s.replace(RX_SENT, SENT_TO); sentDone = true; }
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } }
  return s;
};
function walk(n) { if (n && typeof n.text === 'string') n.text = ap(n.text); if (n && Array.isArray(n.children)) n.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = stripIds(JSON.parse(JSON.stringify(b.body || []))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=velmozska-mohyla-holasky-2&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('#4+#5 veta:', sentDone, '| ostatné páry:', [...applied].length, '/', REPL.length);
  REPL.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 45)));
  const sent = outBlocks.flatMap(b => (b.body || [])).map(n => (n.children || []).map(c => c.text || '').join('')).join(' ');
  const mm = sent.match(/sa začal výskum[^.]*\./); if (mm) console.log('  → ' + mm[0]);

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

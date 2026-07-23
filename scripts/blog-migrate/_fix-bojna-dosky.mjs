/**
 * Oprava vyroba-dosiek-pre-hradisko-bojna: spojovník → pomlčka v tele.
 * + titulok iného článku bojna-vyznamne-velkomoravske-centrum (Veľkomoravské → veľkomoravské, pomlčka).
 *   node _fix-bojna-dosky.mjs [--commit]
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
const EN = '–';
const stripIds = (o) => Array.isArray(o) ? o.map(stripIds) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)])) : o);

const FROM = 'experimentálnu archeológiu - streľbu', TO = 'experimentálnu archeológiu ' + EN + ' streľbu';
let hit = 0;
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = stripIds(b.body || []); const w = (n) => { if (typeof n.text === 'string' && nfc(n.text).includes(FROM)) { n.text = nfc(n.text).split(FROM).join(TO); hit++; } (n.children || []).forEach(w); }; body.forEach(w); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  // 1) telo tohto článku
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyroba-dosiek-pre-hradisko-bojna&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('#1 spojovník→pomlčka zásahov:', hit);

  // 2) titulok iného článku
  const r2 = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=bojna-vyznamne-velkomoravske-centrum&fields[0]=title&fields[1]=documentId`);
  const d2 = (await r2.json()).data?.[0];
  const newTitle2 = nfc(d2.title || '').replace(' - ', ' ' + EN + ' ').split('Veľkomoravské').join('veľkomoravské');
  console.log('#2 titulok:', JSON.stringify(d2.title), '→', JSON.stringify(newTitle2));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ telo PUT OK' : '❌ telo ' + put.status + ': ' + (await put.text()).slice(0, 200));
  const put2 = await fetch(`${BASE}/api/blog-posts/${d2.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { title: newTitle2 } }) });
  console.log(put2.ok ? '✓ titulok PUT OK' : '❌ titulok ' + put2.status);
}
main();

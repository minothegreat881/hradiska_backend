/**
 * Opravy zbornik-hradiska-svedkovia-davnych-cias-2 (telo + alt + media popisok).
 *   node _fix-zbornik2.mjs [--commit]
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
const EN = '–';
const CUR = /(\d)\s+Eur\b/gu;                                     // #1 (aj NBSP)
const ALT_FROM = 'Zborník Hradiská-Svedkovia dávnych čias 2', ALT_TO = 'Zborník Hradiská ' + EN + ' Svedkovia dávnych čias 2'; // #2

let hitCur = 0, hitAlt = false, hitTU = false;
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = stripIds(JSON.parse(JSON.stringify(b.body || [])));
    for (const n of body) for (const c of n.children || []) {
      if (typeof c.text === 'string') { const s2 = nfc(c.text).replace(CUR, '$1 eur'); if (s2 !== c.text) { c.text = s2; hitCur++; } }
      if (c.type === 'link' && (c.children || []).map(x => x.text).join('') === 'TU') { c.children = [{ type: 'text', text: 'tu' }]; hitTU = true; }
    }
    // bodka za odkazom „tu"
    for (const n of body) {
      if (n.type === 'paragraph' && n.children?.length) {
        const last = n.children[n.children.length - 1];
        if (last?.type === 'link' && (last.children || []).map(x => x.text).join('') === 'tu') n.children.push({ type: 'text', text: '.' });
      }
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') {
    const { id, image, ...rest } = b;
    if (nfc(rest.alt || '') === nfc(ALT_FROM)) { rest.alt = ALT_TO; hitAlt = true; }
    if (nfc(rest.caption || '') === nfc(ALT_FROM)) rest.caption = ALT_TO;
    return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image };
  }
  return stripIds(b);
}
async function fixMedia(fileId) {
  const cur = await (await fetch(`${BASE}/api/upload/files/${fileId}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  const cap = nfc(cur.caption || '').split(nfc(ALT_FROM)).join(ALT_TO);
  const alt = nfc(cur.alternativeText || '').split(nfc(ALT_FROM)).join(ALT_TO);
  console.log('  media ' + fileId + ': caption=' + JSON.stringify(cur.caption) + ' alt=' + JSON.stringify(cur.alternativeText));
  if (!COMMIT || (cap === (cur.caption || '') && alt === (cur.alternativeText || ''))) return;
  const form = new FormData(); form.append('fileInfo', JSON.stringify({ caption: cap, alternativeText: alt }));
  const up = await fetch(`${BASE}/api/upload?id=${fileId}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form });
  console.log('   ', up.ok ? '✓ media OK' : '❌ media ' + up.status);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=zbornik-hradiska-svedkovia-davnych-cias-2&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('#1 currency zásahov:', hitCur, '| #2 alt:', hitAlt, '| #4 TU→tu:', hitTU);
  console.log('media 5100:'); await fixMedia(5100);

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ blog-post PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 250));
}
main();

/**
 * Opravy simunky 2. kolo:
 *  #2 „Šimunky" → „Šimúnky" (zjednotenie na autorov tvar, vrátane intra)
 *  #19 zo sources bloku odstrániť rozhádzané útržky poznámok ([1], ďalej píšem…, Zbora…, atď.);
 *      správne číslované poznámky [1]–[11] zostávajú v tele (blok #14). Ponechať bibliografiu + autorské bio.
 *   node _fix-simunky2.mjs [--commit]
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

let simCount = 0;
const tx = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); const before = s; s = s.replace(/Šimunky/g, 'Šimúnky'); if (s !== before) simCount++; return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = tx(n.text); (n?.children || []).forEach(walk); };

// #19 útržky poznámok na odstránenie zo sources bloku
const REMOVE = ['[1]', 'ďalej píšem len Šimúnky', 'Zbora je miestnou časťou obce Dohňany', 'v dolnej časti Marikovskej doliny', 'podľa mapových podkladov ZM', 'kóty Hradište, Hrebienok, Kohútky', 'jazierko mohlo prirodzene zaniknúť'];
const shouldRemove = (t) => { const s = nfc(t || '').trim(); return REMOVE.some(r => s === nfc(r) || s.startsWith(nfc(r))); };
let removed = 0;

function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = stripIds(JSON.parse(JSON.stringify(b.body || []))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.sources') {
    const { id, ...rest } = b;
    const kept = (rest.items || []).filter(it => { if (shouldRemove(it.text)) { removed++; return false; } return true; }).map(it => { const { id, ...r } = it; return { ...r, text: tx(r.text) }; });
    return { __component: 'content.sources', ...stripIds({ ...rest, items: undefined }), items: kept };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; if (rest.caption) rest.caption = tx(rest.caption); if (rest.alt) rest.alt = tx(rest.alt); return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=simunky-siroka-hradiste-koscelisko-mozne-suvislosti&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  const src = outBlocks.find(b => b.__component === 'content.sources');
  console.log('#2 Šimunky→Šimúnky zásahov (uzlov/položiek):', simCount, '| #19 odstránených útržkov:', removed);
  console.log('sources po úprave:'); (src?.items || []).forEach(it => console.log('   • ' + it.text.slice(0, 70)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

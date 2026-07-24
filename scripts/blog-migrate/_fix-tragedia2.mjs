/**
 * Opravy tragedia (2. kolo): konzistencia naprieč telom + metadátami.
 *  #1 „karpatská kotlina" → „Karpatská kotlina" (telo + timeline + keyFacts)
 *  #2 odstrániť „ ... " v „Maďarská akadémia vied ... a Múzeum" (nie autorská výpustka)
 *  #3 čiarka pred „a to" (maďarskej histórie)
 *  #5 timeline: „Simona z Kézy" → „Šimona z Kézy" (dorovnať s telom)
 *  #6 zjednotiť autorské výpustky „..." → „…"
 *  #7 „Visegrad" → „Visegrád" (telo + popisky obrázkov)
 * #4 už opravené (caption+alt image-bloku).
 *   node _fix-tragedia2.mjs [--commit]
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

const REPL = [
  ['Maďarská akadémia vied ... a Múzeum', 'Maďarská akadémia vied a Múzeum'],  // #2 (pred normalizáciou výpustiek!)
  ['maďarskej histórie a to nás vedie', 'maďarskej histórie, a to nás vedie'], // #3
  ['karpatskej kotline', 'Karpatskej kotline'],                                // #1
  ['karpatskú kotlinu', 'Karpatskú kotlinu'],                                  // #1
  ['karpatská kotlina', 'Karpatská kotlina'],                                  // #1
  ['karpatskej kotliny', 'Karpatskej kotliny'],                               // #1
  ['Simona z Kézy', 'Šimona z Kézy'],                                          // #5 (timeline)
];
const counts = {};
function tx(s) {
  if (typeof s !== 'string') return s;
  let t = nfc(s);
  for (const [a, b] of REPL) { const na = nfc(a); if (t.includes(na)) { t = t.split(na).join(b); counts[a] = (counts[a] || 0) + 1; } }
  const before = t;
  t = t.replace(/\.{3,}/g, '…');                 // #6 autorské výpustky
  if (t !== before) counts['…'] = (counts['…'] || 0) + 1;
  const before2 = t;
  t = t.replace(/Visegrad(?!á)/g, 'Visegrád');   // #7
  if (t !== before2) counts['Visegrád'] = (counts['Visegrád'] || 0) + 1;
  return t;
}
const walk = (n) => { if (n && typeof n.text === 'string') n.text = tx(n.text); (n?.children || []).forEach(walk); };
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = stripIds(JSON.parse(JSON.stringify(b.body || []))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; if (rest.caption) rest.caption = tx(rest.caption); if (rest.alt) rest.alt = tx(rest.alt); return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=tragedia-jedneho-uspesneho-obsadenia-vlasti&populate[blocks][populate]=*&populate[timeline]=true&populate[keyFacts]=true&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const blocks = (d.blocks || []).map(cleanBlock);
  const timeline = (d.timeline || []).map(t => { const { id, ...rest } = t; return { ...rest, title: tx(rest.title), description: tx(rest.description) }; });
  const keyFacts = (d.keyFacts || []).map(k => { const { id, ...rest } = k; return { ...rest, label: tx(rest.label), value: tx(rest.value) }; });

  console.log('zmeny:', JSON.stringify(counts));
  // sanity: žiadne „..." nemá zostať, žiadne „karpatská/ej/ú kotlin" malým, žiadne Visegrad bez dĺžňa
  const bodyAll = blocks.filter(b => b.__component === 'content.rich-text').map(b => (b.body || []).map(n => (n.children || []).map(c => c.text || '').join('')).join(' ')).join(' ');
  console.log('zvyšné ...:', (bodyAll.match(/\.{3,}/g) || []).length, '| malé karpatsk*kotlin:', (bodyAll.match(/[a-z]arpatsk\S* kotlin/g) || []).length, '| Visegrad bez á:', (bodyAll.match(/Visegrad(?!á)/g) || []).length);
  console.log('timeline[8].title:', JSON.stringify(timeline[8]?.title));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks, timeline, keyFacts } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

/**
 * Otomanska — reštrukturalizácia podnadpisov katalógu (veľké písmeno + samostatný odsek)
 * + rozdelenie zlepeného „KATALÓG LOKALÍTNižná Myšľa".
 * Reálne výskyty (4 lokality, 9 podnadpisov): poloha ×3, chronológia ×4, komplex ×2.
 *   node _fix-otomanska-headings.mjs [--commit]
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

const SUB = [
  { low: 'poloha, rozloha a stav výskumu', cap: 'Poloha, rozloha a stav výskumu' },
  { low: 'chronológia – vznik osady, počet horizontov a zánik', cap: 'Chronológia – vznik osady, počet horizontov a zánik' },
  { low: 'komplex osady, opevnenie, vnútorná zástavba a objekty', cap: 'Komplex osady, opevnenie, vnútorná zástavba a objekty' },
];
const para = (t) => ({ type: 'paragraph', children: [{ type: 'text', text: t }] });
function splitPre(s) {
  const m = s.match(/^(KATALÓG LOKAL[IÍ]T)\s*(.+)$/s);
  if (m) return ['KATALÓG LOKALÍT', m[2].trim()];
  return [s];
}
let subFixed = 0, katSplit = false;
function restructure(T) {
  T = nfc(T);
  const phrase = SUB.find(p => T.includes(p.low));
  const parts = [];
  if (phrase) {
    const idx = T.indexOf(phrase.low);
    const pre = T.slice(0, idx).trim();
    const post = T.slice(idx + phrase.low.length).trim();
    if (pre) { const pp = splitPre(pre); if (pp.length > 1) katSplit = true; parts.push(...pp); }
    parts.push(phrase.cap); subFixed++;
    if (post) parts.push(post);
  } else {
    const pp = splitPre(T.trim()); if (pp.length > 1) katSplit = true; parts.push(...pp);
  }
  return parts.map(para);
}
const needs = (b) => b.__component === 'content.rich-text' && (b.body || []).length === 1 && b.body[0].type === 'paragraph' && (() => { const t = nfc((b.body[0].children || []).map(c => c.text || '').join('')); return SUB.some(p => t.includes(p.low)) || /KATALÓG LOKAL[IÍ]T/.test(t); })();

function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    if (needs(b)) { const T = (b.body[0].children || []).map(c => c.text || '').join(''); return { __component: 'content.rich-text', body: restructure(T) }; }
    return { __component: 'content.rich-text', body: stripIds(b.body || []) };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=sidliska-otomanskej-kultury-na-vychodnom-slovensku&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('podnadpisov opravených:', subFixed, '| KATALÓG rozdelený:', katSplit, '| blokov:', d.blocks.length, '→', outBlocks.length);

  if (!COMMIT) {
    // náhľad okolia katalógu
    outBlocks.forEach((b, i) => { if (b.__component === 'content.rich-text') { const t = (b.body || []).map(n => (n.children || []).map(c => c.text || '').join('')).join(' ⏎ '); if (/KATALÓG|^(Poloha|Chronológia|Komplex)/.test(nfc(t))) console.log('  ' + JSON.stringify(t.slice(0, 90))); } });
    console.log('(náhľad — --commit)'); return;
  }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

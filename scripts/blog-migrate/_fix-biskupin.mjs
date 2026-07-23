/**
 * Opravy vyprava-polske-hradiska-2-biskupin-... (titulok + telo).
 * Rozdelenie 4 zlepených tučných nadpisov (Biskupin/Wenecja/Wyszogrod/Gora Zamkowa),
 * medzery, čiarka, bodka za odkazom, zjednotenie Wyszogród / Bydgoszcz / Góra Zamkowa.
 *   node _fix-biskupin.mjs [--commit]
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

const REPL = [
  ['1.hrozba', '1. hrozba'],                                     // #1
  ['priestorov.V súčasnosti', 'priestorov. V súčasnosti'],       // #2
  ['informáciu že na hradisku', 'informáciu, že na hradisku'],   // #5
  ['Bydogoscz', 'Bydgoszcz'], ['Bydogoszcy', 'Bydgoszczi'],      // #7
  ['Wiszogrod', 'Wyszogród'], ['Wyszogrod', 'Wyszogród'],        // #8
  ['Gora Zamkowa', 'Góra Zamkowa'],                              // #9
  ['hradiská 2 - Biskupin', 'hradiská 2 ' + EN + ' Biskupin'],   // titulok spojovník
];
const SECTIONS = new Set(['Biskupin', 'Wenecja', 'Wyszogrod', 'Gora Zamkowa']);
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }

function splitSections(body) {
  const out = []; let cur = null, afterHead = false;
  const flush = () => { if (cur && cur.some(c => (c.text || '').trim() || c.type === 'link')) out.push({ type: 'paragraph', children: cur }); cur = null; };
  for (const n of body) {
    if (n.type !== 'paragraph') { flush(); out.push(n); continue; }
    for (const c of n.children || []) {
      if (c.bold && SECTIONS.has((c.text || '').trim())) {
        flush(); out.push({ type: 'heading', level: 2, children: [{ type: 'text', text: (c.text || '').trim() }] }); afterHead = true;
      } else {
        if (!cur) cur = [];
        const cc = { ...c };
        if (afterHead && typeof cc.text === 'string') { cc.text = cc.text.replace(/^[\s\n]+/, ''); afterHead = false; }
        cur.push(cc);
      }
    }
    flush();
  }
  return out;
}
const stripIds = (o) => Array.isArray(o) ? o.map(stripIds) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)])) : o);
let headCount = 0, cenwood = false;
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    let body = stripIds(JSON.parse(JSON.stringify(b.body || [])));
    body = splitSections(body);          // rozdel tučné nadpisy
    body.forEach(walk);                  // textové opravy (aj v nadpisoch → Wyszogród/Góra)
    for (const n of body) {              // #6 bodka za odkazom Cenwood
      if (n.type === 'paragraph' && n.children?.length) {
        const last = n.children[n.children.length - 1];
        if (last?.type === 'link' && /Cenwood/.test((last.children || []).map(c => c.text).join(''))) { n.children.push({ type: 'text', text: '.' }); cenwood = true; }
      }
      if (n.type === 'heading') headCount++;
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b); // sources/embed… — hlboký strip id (aj items)
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyprava-polske-hradiska-2-biskupin-wenecja-wiszogrod-gora-zamkowa&populate[blocks][populate]=*&fields[0]=title&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newTitle = ap(d.title || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);
  const heads = outBlocks.flatMap(b => (b.body || []).filter(n => n.type === 'heading').map(n => (n.children || []).map(c => c.text).join('')));
  console.log('title:', JSON.stringify(newTitle));
  console.log('nadpisy:', JSON.stringify(heads), '| Cenwood bodka:', cenwood);
  console.log('aplikovaných párov:', [...applied].length, '/', REPL.length);
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  if (miss.length) miss.forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 45)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { title: newTitle, blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

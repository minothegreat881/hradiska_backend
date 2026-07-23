/**
 * Opravy vyprava-polske-hradiska-3-gdansk-a-owidz (titulok + telo + téma).
 *   node _fix-gdansk.mjs [--commit]
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
const EN = '–', LQ = '„', RQ = '“';

const REPL = [
  ['prioritne preto že sme', 'prioritne preto, že sme'],                                  // #1
  ['a fungovala až do 12. storočia', 'a fungovalo až do 12. storočia'],                    // #2 rod
  ['počas XVII storočia', 'počas 17. storočia'],                                            // #3
  ["aj v'daka tomu", 'aj vďaka tomu'],                                                      // #4
  ['poslednú ale o to dôležitejšiu zastávku', 'poslednú, ale o to dôležitejšiu zastávku'],  // #5
  ['"Tento rituál', LQ + 'Tento rituál'], ['duchov domu,"', 'duchov domu,' + RQ],           // #6a/b
  ['"záverečnej"', LQ + 'záverečnej' + RQ],                                                  // #6c
  ['hradiská 3 - Gdansk', 'hradiská 3 ' + EN + ' Gdansk'],                                   // titulok spojovník
];
const SECTIONS = new Set(['GDANSK', 'OWIDZ']);
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
const stripIds = (o) => Array.isArray(o) ? o.map(stripIds) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)])) : o);
function splitSections(body) {
  const out = []; let cur = null, afterHead = false;
  const flush = () => { if (cur && cur.some(c => (c.text || '').trim() || c.type === 'link')) out.push({ type: 'paragraph', children: cur }); cur = null; };
  for (const n of body) {
    if (n.type !== 'paragraph') { flush(); out.push(n); continue; }
    for (const c of n.children || []) {
      if (c.bold && SECTIONS.has((c.text || '').trim())) { flush(); out.push({ type: 'heading', level: 2, children: [{ type: 'text', text: (c.text || '').trim() }] }); afterHead = true; }
      else { if (!cur) cur = []; const cc = { ...c }; if (afterHead && typeof cc.text === 'string') { cc.text = cc.text.replace(/^[\s\n]+/, ''); afterHead = false; } cur.push(cc); }
    }
    flush();
  }
  return out;
}
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { let body = splitSections(stripIds(JSON.parse(JSON.stringify(b.body || [])))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyprava-polske-hradiska-3-gdansk-a-owidz&populate[blocks][populate]=*&fields[0]=title&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newTitle = ap(d.title || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);
  const heads = outBlocks.flatMap(b => (b.body || []).filter(n => n.type === 'heading').map(n => (n.children || []).map(c => c.text).join('')));
  console.log('title:', JSON.stringify(newTitle), '| nadpisy:', JSON.stringify(heads));
  console.log('aplikovaných párov:', [...applied].length, '/', REPL.length);
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  if (miss.length) miss.forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 45)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { title: newTitle, blocks: outBlocks } }) });
  console.log(put.ok ? '✓ blog-post PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
  // téma poľské → Poľské
  const tp = await fetch(`${BASE}/api/blog-tags/krmfsff06awwficiquwtgfh1`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { name: 'Výprava Poľské hradiská 3 Gdansk' } }) });
  console.log(tp.ok ? '✓ téma PUT OK' : '❌ téma ' + tp.status);
}
main();

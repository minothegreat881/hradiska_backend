/**
 * Opravy 3d-rekonstrukcie:
 *  #2 „za týmto účelom" → „na tento účel" (bohemizmus)
 *  #3 „TU:" → „tu: " (malé, NBSP medzera pred odkazom), bodka za odkazom „Dwarf digital archeology",
 *     rozdelenie zlepeného odseku (\n) na samostatné.
 *   node _fix-3d-rekonstrukcie.mjs [--commit]
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
const NBSP = ' ';
const stripIds = (o) => Array.isArray(o) ? o.map(stripIds) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)])) : o);

const REPL = [
  ['za týmto účelom bola nadviazaná spolupráca', 'na tento účel bola nadviazaná spolupráca'],  // #2
  ['môžete pozrieť TU:', 'môžete pozrieť tu:' + NBSP],                                          // #3a malé tu + NBSP pred odkazom
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };

let splits = 0, dotAdded = false;
function splitParagraph(node) {
  const groups = [[]];
  for (const child of node.children || []) {
    if (typeof child.text === 'string' && /[ \t]*\n[ \t]*/.test(child.text)) {
      const segs = child.text.split(/[ \t]*\n[ \t]*/);
      segs.forEach((seg, si) => { if (si > 0) groups.push([]); groups[groups.length - 1].push({ ...child, text: seg }); });
    } else {
      groups[groups.length - 1].push(child);
    }
  }
  if (groups.length > 1) splits += groups.length - 1;
  const paras = groups
    .map((g) => {
      if (g.length && typeof g[0].text === 'string') g[0] = { ...g[0], text: g[0].text.replace(/^[ \t\n]+/, '') };
      if (g.length && typeof g[g.length - 1].text === 'string') g[g.length - 1] = { ...g[g.length - 1], text: g[g.length - 1].text.replace(/[ \t\n]+$/, '') };
      return g.filter((c) => c.type === 'link' || (typeof c.text === 'string' && c.text !== ''));
    })
    .filter((g) => g.length > 0)
    .map((g) => ({ type: 'paragraph', children: g }));
  // bodka za odkazom „Dwarf digital archeology" na konci odseku
  for (const p of paras) {
    const last = p.children[p.children.length - 1];
    if (last?.type === 'link' && nfc((last.children || []).map(x => x.text).join('')) === 'Dwarf digital archeology') { p.children.push({ type: 'text', text: '.' }); dotAdded = true; }
  }
  return paras;
}

function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = stripIds(JSON.parse(JSON.stringify(b.body || [])));
    body.forEach(walk);
    const out = [];
    for (const n of body) { if (n.type === 'paragraph') out.push(...splitParagraph(n)); else out.push(n); }
    return { __component: 'content.rich-text', body: out };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=3d-rekonstrukcie&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('#2/#3a páry:', [...applied].length, '/', REPL.length, '| #3 splits:', splits, '| bodka za odkazom:', dotAdded);
  REPL.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 40)));
  const linkBlock = outBlocks.find(b => (b.body || []).some(n => (n.children || []).some(c => c.type === 'link' && (c.children || []).map(x => x.text).join('') === 'Dwarf digital archeology')));
  if (linkBlock) linkBlock.body.forEach((n, i) => console.log('  odsek[' + i + ']: ' + (n.children || []).map(c => c.type === 'link' ? '[[' + (c.children || []).map(x => x.text).join('') + ']]' : c.text).join('').slice(0, 70)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

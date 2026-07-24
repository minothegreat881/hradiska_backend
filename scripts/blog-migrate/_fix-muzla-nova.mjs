/**
 * Opravy muzla-cenkov-nova-rekonstrukcia:
 *  #1 „Slovanské" → „slovanské" (všeob. príd. meno)
 *  #2 zhoda rodu — podmet Lokalita (ž.r.): „bolo osídlené…nadobudlo" → „bola osídlená…nadobudla"
 *  #3 „software ale" → „softvér, ale" (bohemizmus + čiarka pred ale)
 *  #4 „…prípade, snažíme sa" → „…prípade sa snažíme" (čiarka + slovosled)
 *  #5 rozdeliť odsek na hranici \n\n — odkaz „VIRTUÁLNA PREHLIADKA" oddeliť od „Priebeh opevnenia"
 *   node _fix-muzla-nova.mjs [--commit]
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
  ['rozprestieralo Slovanské hradisko', 'rozprestieralo slovanské hradisko'],  // #1
  ['Pre výhodnú polohu bolo osídlené už v praveku, avšak najväčší význam nadobudlo',
   'Pre výhodnú polohu bola osídlená už v praveku, avšak najväčší význam nadobudla'],  // #2
  ['technika, software ale najmä skúsenosti', 'technika, softvér, ale najmä skúsenosti'],  // #3
  ['Ako v predchádzajúcom prípade, snažíme sa priniesť', 'Ako v predchádzajúcom prípade sa snažíme priniesť'],  // #4
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };

// #5 rozdel paragraf na hranici dvojitého zalomenia, zachovaj inline uzly (odkazy)
let splits = 0;
function splitParagraph(node) {
  const groups = [[]];
  for (const child of node.children || []) {
    if (typeof child.text === 'string' && /\n\s*\n/.test(child.text)) {
      const segs = child.text.split(/\n\s*\n/);
      segs.forEach((seg, si) => {
        if (si > 0) groups.push([]);
        groups[groups.length - 1].push({ ...child, text: seg.replace(/\n/g, ' ') });
      });
    } else if (typeof child.text === 'string') {
      groups[groups.length - 1].push({ ...child, text: child.text.replace(/\n/g, ' ') });
    } else {
      groups[groups.length - 1].push(child);
    }
  }
  if (groups.length > 1) splits += groups.length - 1;
  return groups
    .map((g) => {
      if (g.length && typeof g[0].text === 'string') g[0] = { ...g[0], text: g[0].text.replace(/^\s+/, '') };
      if (g.length && typeof g[g.length - 1].text === 'string') g[g.length - 1] = { ...g[g.length - 1], text: g[g.length - 1].text.replace(/\s+$/, '') };
      return g.filter((c) => c.type === 'link' || (typeof c.text === 'string' && c.text !== ''));
    })
    .filter((g) => g.length > 0)
    .map((g) => ({ type: 'paragraph', children: g }));
}

function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = stripIds(JSON.parse(JSON.stringify(b.body || [])));
    body.forEach(walk);
    const out = [];
    for (const n of body) {
      if (n.type === 'paragraph') out.push(...splitParagraph(n));
      else out.push(n);
    }
    return { __component: 'content.rich-text', body: out };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=muzla-cenkov-nova-rekonstrukcia&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('#1-#4 páry:', [...applied].length, '/', REPL.length, '| #5 nové odseky (splits):', splits);
  REPL.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 45)));
  // ukáž odseky bloku s odkazom
  const withLink = outBlocks.find(b => (b.body || []).some(n => (n.children || []).some(c => c.type === 'link')));
  if (withLink) withLink.body.forEach((n, i) => console.log('  odsek[' + i + ']: ' + (n.children || []).map(c => c.type === 'link' ? '[[' + (c.children || []).map(x => x.text).join('') + ']]' : c.text).join('').slice(0, 60)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

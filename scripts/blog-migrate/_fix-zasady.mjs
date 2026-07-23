/**
 * Opravy zakladne-zasady-obcianskeho-zdruzenia-hradiska.
 * Rozdelenie zlepeného nadpisu (1. Poslanie… | 1. Základným cieľom…) + čiarka/väzba/bohemizmus.
 *   node _fix-zasady.mjs [--commit]
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
  ['), je predovšetkým', ') je predovšetkým'],                                    // #1
  ['rozvoju turizmu na hradištné lokality', 'rozvoju turizmu do hradištných lokalít'], // #3
  ['jeho usmerneniu', 'jeho usmerňovaniu'],                                       // #4
  ['Za týmto účelom', 'Na tento účel'],                                           // #5
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }

let pending = null, split = false, merged = false;
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = stripIds(JSON.parse(JSON.stringify(b.body || [])));
    body.forEach(walk);
    // #2 rozdel nadpis
    for (const n of body) {
      if (n.type === 'heading') {
        const t = nfc((n.children || []).map(c => c.text || '').join(''));
        const m = t.match(/^(1\. Poslanie a ciele združenia)\s+(1\..*)$/);
        if (m) { n.children = [{ type: 'text', text: m[1] }]; pending = m[2].trim() + ' '; split = true; }
      }
    }
    // pripoj chvost k prvému odseku (rt#2)
    if (pending && body[0]?.type === 'paragraph') {
      const first = (body[0].children || []).find(c => typeof c.text === 'string');
      if (first) { first.text = pending + first.text; pending = null; merged = true; }
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=zakladne-zasady-obcianskeho-zdruzenia-hradiska&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('nadpis rozdelený:', split, '| chvost pripojený:', merged, '| REPL:', [...applied].length, '/', REPL.length);
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  if (miss.length) miss.forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 45)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

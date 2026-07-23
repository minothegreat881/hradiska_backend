/**
 * Opravy starosloviensky-slovnik-online: odkaz malými + čiarka za vzťažnou vetou, nadbytočná čiarka.
 *   node _fix-slovnik.mjs [--commit]
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

const REPL = [
  ['TOMTO ODKAZE', 'tomto odkaze'],                                       // #2
  ['mnohé slová, súvisiace s bojom', 'mnohé slová súvisiace s bojom'],     // #3
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = JSON.parse(JSON.stringify(b.body || []));
    body.forEach(walk);
    // #1: čiarka za odkazom „tomto odkaze"
    for (const n of body) {
      if (n.type !== 'paragraph' || !Array.isArray(n.children)) continue;
      for (let i = 0; i < n.children.length - 1; i++) {
        const c = n.children[i], nx = n.children[i + 1];
        if (c.type === 'link' && (c.children || []).map(x => x.text).join('') === 'tomto odkaze' && typeof nx.text === 'string' && /^\s/.test(nx.text)) {
          nx.text = ', ' + nx.text.replace(/^\s+/, ''); applied.add('čiarka za odkazom');
        }
      }
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=starosloviensky-slovnik-online&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('aplikovaných:', [...applied].join(', '));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 250));
}
main();

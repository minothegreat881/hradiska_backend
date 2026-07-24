/**
 * Opravy liptovsky-hrad:
 *  #1 prepis syntakticky rozbitej vety o pôvode názvu (Ľubota → Ľubtov → Liptov)
 *  #2 zjednotenie bibliografie (Slámka) do štandardného formátu
 *  #3 „Orgoň" je omylom h2 nadpis → demotovať na normálny odsek (podpis)
 *   node _fix-liptovsky-hrad.mjs [--commit]
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
  // #1
  ['Za svoje meno vďačí pravdepodobne pôvodnému majiteľovi Ľubota - Ľubtov hrad, pomaďarčením sa zmenil Ľubtov, neskôr na Liptov.',
   'Za svoje meno vďačí pravdepodobne pôvodnému majiteľovi Ľubotovi – Ľubtov hrad; pomaďarčením sa zmenil na Ľubtov a neskôr na Liptov.'],
  // #2
  ['Miroslav Slámka a kol., Kamenní strážcovia II. Slovenský skauting, Bratislava. 2011.',
   'Miroslav Slámka a kol.: Kamenní strážcovia II. Bratislava: Slovenský skauting, 2011.'],
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };

let demoted = false;
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = stripIds(JSON.parse(JSON.stringify(b.body || [])));
    body.forEach(walk);
    for (const n of body) {
      if (n.type === 'heading' && nfc((n.children || []).map(c => c.text || '').join('').trim()) === 'Orgoň') {
        n.type = 'paragraph'; delete n.level; demoted = true;  // #3
      }
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=liptovsky-hrad&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('#1/#2 páry:', [...applied].length, '/', REPL.length, '| #3 Orgoň heading→paragraph:', demoted);
  REPL.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 50)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

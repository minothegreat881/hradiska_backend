/**
 * Opravy velkomoravske-hradisko-zvolen-motova-3d:
 *  #1 preformulovanie rozbitej vety (potvrdené feedom — nič nevypadlo, len neobratná stavba)
 *  #2 čiarka za „Podľa našich informácií" preč
 *  #3 zlepený podpis „Orgoň" + veta „Niekoľko pohľadov…" → samostatné odseky
 *   node _fix-zvolen-motova.mjs [--commit]
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
  // #1 rekonštrukcia zámeru
  ['len nie na informovanie o hradisku, oplotené, zatvorená brána a na hradisko majú prístup iba záhradkári',
   'len nie na informovanie o hradisku. Hradisko je oplotené, brána zatvorená a prístup naň majú iba záhradkári'],
  // #2 čiarka preč
  ['Podľa našich informácií, jeden zo záhradkárov', 'Podľa našich informácií jeden zo záhradkárov'],
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };

let split3 = 0;
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = stripIds(JSON.parse(JSON.stringify(b.body || [])));
    body.forEach(walk);
    // #3 rozdel paragraf s viacnásobným zalomením (napr. „…páčiť.\n\nOrgoň\n\nNiekoľko…") na samostatné odseky
    const out = [];
    for (const n of body) {
      const single = n.type === 'paragraph' && (n.children || []).length === 1 && typeof n.children[0].text === 'string';
      if (single && /\n/.test(n.children[0].text)) {
        const parts = n.children[0].text.split(/\n+/).map(x => x.trim()).filter(Boolean);
        if (parts.length > 1) { split3 += parts.length - 1; parts.forEach(p => out.push({ type: 'paragraph', children: [{ type: 'text', text: p }] })); continue; }
        out.push({ ...n, children: [{ ...n.children[0], text: n.children[0].text.replace(/\n+/g, ' ').trim() }] }); continue;
      }
      out.push(n);
    }
    return { __component: 'content.rich-text', body: out };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=velkomoravske-hradisko-zvolen-motova-3d&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('#1/#2 páry:', [...applied].length, '/', REPL.length, '| #3 nové odseky:', split3);
  REPL.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 55)));
  const tail = outBlocks[outBlocks.length - 1];
  console.log('posledný blok odseky:', JSON.stringify((tail.body || []).map(n => (n.children || []).map(c => c.text).join('').slice(0, 55))));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

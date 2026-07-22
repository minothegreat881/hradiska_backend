/**
 * Opravy na-slovensku-objavili-novy-keltsky-symbol (perex + telo + alt + obnova strateného odkazu).
 *   node _fix-keltsky-symbol.mjs [--commit]
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
const LQ = '„', RQ = '“';

const REPL = [
  [', známe Taranisovo koleso, či keltský kríž', ', známe Taranisovo koleso či keltský kríž'],   // #1 čiarka pred či
  ['V minulom roku sa však podaril na Slovensku (Tvrdošovce) unikátny nález',
   'V roku 2018 sa však na Slovensku (v Tvrdošovciach) podaril unikátny nález'],                  // #2+#3 deixa+slovosled
  ['starej viac ako 2000 rokov', 'starej viac ako 2 000 rokov'],                                  // #4 tisíce
  ['ktorá dostala meno ' + LQ + 'Furiorix' + RQ + ' a ktorá má priamo na hrudníku',
   'ktorá dostala meno ' + LQ + 'Furiorix' + RQ + ' a má priamo na hrudi'],                       // #5
  ['v kruhu, vyrobenom ryhou', 'v kruhu vytvorenom ryhou'],                                       // #6
  ['po každej jeho stene sú plastické', 'pri každej jeho strane sú plastické'],                   // #7
  ['absolútne unikátnu vec', 'absolútne unikátny nález'],                                          // #8
  ['ktorú ešte je možné získať', 'ktorú je ešte možné získať'],                                    // #9 slovosled
];

const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
const cleanUrl = (u) => { let s = String(u).replace(/[?&](fbclid|gclid)=[^&#]*/gi, ''); if (!s.includes('?') && s.includes('&')) s = s.replace('&', '?'); return s.replace(/\?&/, '?').replace(/[?&]$/, '').replace(/#$/, ''); };

let linkRestored = false, altFixed = false;
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = JSON.parse(JSON.stringify(b.body || []));
    body.forEach(walk);
    // #10: obnov stratený odkaz za „na tejto adrese:"
    for (const n of body) {
      if (n.type !== 'paragraph' || !Array.isArray(n.children) || !n.children.length) continue;
      const last = n.children[n.children.length - 1];
      if (last?.type === 'text' && /na tejto adrese:\s*$/.test(nfc(last.text || ''))) {
        last.text = nfc(last.text).replace(/\s*$/, ' ');
        n.children.push({ type: 'link', url: 'http://www.skrytepoklady.sk/about/', children: [{ type: 'text', text: 'www.skrytepoklady.sk/about' }] });
        linkRestored = true;
      }
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') {
    const { id, image, ...rest } = b;
    if (typeof rest.alt === 'string') { const fixed = nfc(rest.alt).replace(/Keltský/g, 'keltský').replace(/\s*!+\s*$/, '').trim(); if (fixed !== rest.alt) altFixed = true; rest.alt = fixed; } // #11
    return { __component: 'content.image-block', ...rest, image: image?.id ?? image };
  }
  if (b.__component === 'content.sources') { // vyčisti fbclid v zdrojoch
    const strip = (o) => Array.isArray(o) ? o.map(strip) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, strip(v)])) : o);
    const s = strip(b); s.items = (s.items || []).map((it) => ({ ...it, url: it.url ? cleanUrl(it.url) : it.url, text: it.text ? cleanUrl(it.text) : it.text })); return s;
  }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=na-slovensku-objavili-novy-keltsky-symbol&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  console.log('aplikovaných:', [...new Set(applied)].length, '/', REPL.length, '| výskytov:', applied.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m).slice(0, 90))); } else console.log('✓ všetky páry');
  console.log('#10 odkaz obnovený:', linkRestored, '| #11 alt opravený:', altFixed);
  const imgs = outBlocks.filter((b) => b.__component === 'content.image-block');
  console.log('image-block:', imgs.map((b) => 'alt=' + JSON.stringify(b.alt)).join(', '));

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
}
main();

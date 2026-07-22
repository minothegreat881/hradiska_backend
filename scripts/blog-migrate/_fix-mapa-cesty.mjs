/**
 * Opravy mapa-stredovekych-obchodnych-ciest (perex + telo + odkaz). Čistí aj fbclid v URL.
 *   node _fix-mapa-cesty.mjs [--commit]
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
  ['Merchant machine', 'Merchant Machine'],                                        // #1 názov stránky (link text + perex)
  [' zaujímavú mapu. Je to', ' zverejnil zaujímavú mapu. Je to'],                  // #1 chýbajúce sloveso (telo + perex)
  ['storočí, ktoré sú k dispozícii', 'storočí, ktorá je k dispozícii'],            // #2 zhoda (perex)
  ['námorné cesty, kanály a cesty', 'námorné trasy, kanály a cesty'],              // #3 tautológia
  ['stojí za bližšie pozretie', 'stojí za bližšie preskúmanie'],                    // #4 väzba
  ['pomerne chaotické názvy miest', 'pomerne nekonzistentné názvy miest'],          // #5 štýl
];

const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function cleanUrl(u) { let s = String(u).replace(/[?&](fbclid|gclid)=[^&#]*/gi, ''); if (!s.includes('?') && s.includes('&')) s = s.replace('&', '?'); return s.replace(/\?&/, '?').replace(/[?&]$/, '').replace(/#$/, ''); }
function walk(node) {
  if (node && typeof node.text === 'string') node.text = ap(node.text);
  if (node && node.type === 'link' && node.url) node.url = cleanUrl(node.url);
  if (node && Array.isArray(node.children)) node.children.forEach(walk);
}
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=mapa-stredovekych-obchodnych-ciest&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  console.log('aplikovaných:', [...new Set(applied)].length, '/', REPL.length, '| výskytov:', applied.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m))); } else console.log('✓ všetko');
  const url = JSON.stringify(outBlocks).match(/merchantmachine[^"\\]*/);
  console.log('URL:', url ? url[0] : '(?)', '| fbclid preč:', !/fbclid/.test(JSON.stringify(outBlocks)));

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

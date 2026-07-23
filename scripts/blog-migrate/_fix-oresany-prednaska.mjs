/**
 * Opravy prednaska-o-archeologii-na-zs-s-ms-dolne-oresany (telo + perex). Obrázok zachovaný.
 *   node _fix-oresany-prednaska.mjs [--commit]
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
const LQ = '„', RQ = '“', EM = '—';

const REPL = [
  // #1 (rozdelenie súvetia) + #2 (pamiatkarčina → pamiatkarská práca) — telo + perex
  ['Osvetu považujem za dôležitú súčasť pamiatkarčiny a archeológie, intenzívne sa jej venujem, pozitívne výsledky ma povzbudzujú v ďalšej takejto práci a som aj veľmi rád, keď sa do nej zapája stále viac archeológov.',
   'Osvetu považujem za dôležitú súčasť pamiatkarskej práce a archeológie. Intenzívne sa jej venujem a pozitívne výsledky ma povzbudzujú v ďalšej takejto práci. Som aj veľmi rád, keď sa do nej zapája stále viac archeológov.'],
  // #3 dvojbodka + úvodzovky okolo názvov kapitol
  ['Prednáška bola rozdelená do kapitol Čo je to archeológia, Čo je to archeologické dedičstvo a Čo sú to pamiatky.',
   'Prednáška bola rozdelená do kapitol: ' + LQ + 'Čo je to archeológia' + RQ + ', ' + LQ + 'Čo je to archeologické dedičstvo' + RQ + ' a ' + LQ + 'Čo sú to pamiatky' + RQ + '.'],
  // #4 čiarka pred zlučovacím „a"
  ['zobrať informačné letáky, a vyskúšať nástroje', 'zobrať informačné letáky a vyskúšať nástroje'],
  // #5 + #6 prepis rozbitej vety
  ['informujte ich o nás a ak sa ozvú so záujmom, buď ja alebo ak to bude zo vzdialenejšieho regiónu, tak niektorý kolega aj u vás spraví prednášku.',
   'informujte ich o nás. Ak sa ozvú so záujmom, prednášku u vás spravím buď ja, alebo ' + EM + ' ak to bude zo vzdialenejšieho regiónu ' + EM + ' niektorý kolega.'],
];

const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=prednaska-o-archeologii-na-zs-s-ms-dolne-oresany&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  console.log('aplikovaných:', applied.size, '/', REPL.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach(m => console.log('  - ' + JSON.stringify(m).slice(0, 80))); } else console.log('✓ všetko');

  if (!COMMIT) { console.log('\n(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }) });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

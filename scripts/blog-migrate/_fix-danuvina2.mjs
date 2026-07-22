/**
 * Doťahovacie opravy danuvina-alacris (2. kolo): rok 480, zhody/spojky, malé „dunajského limesu",
 * em-pomlčka v zozname (value — label), sekcia zdrojov (dátum prednášky).
 *   node _fix-danuvina2.mjs [--commit]
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
const EN = '–', EM = '—';

const REPL = [
  ['okolo roku 48 nášho letopočtu', 'okolo roku 480 nášho letopočtu'],          // #1 Rugiovia (potvrdené 480)
  ['lode boli ručne kované', 'lode, bolo ručne kované'],                        // #2 čiarka + zhoda (náradie j.č.)
  ['Po kontrole, nutných malých opravách', 'Po kontrole a nutných malých opravách'], // #3 spojka
  ['Dunajského limesu', 'dunajského limesu'],                                   // #4 konzistencia malé písmeno
  ['dunajský limes zohráva v projekte', 'dunajský limes zohrávajú v projekte'], // #7 dvojitý podmet → mn. č.
  // #6 + konzistencia: value — label em-pomlčkou (rozpätie ostáva en-pomlčkou)
  ['18 m ' + EN + ' dĺžka', '18 m ' + EM + ' dĺžka'],
  ['2,8 m ' + EN + ' šírka v najširšej časti', '2,8 m ' + EM + ' šírka v najširšej časti'],
  ['5 ' + EN + ' 6 ton ' + EN + ' pohotovostná hmotnosť', '5 ' + EN + ' 6 ton ' + EM + ' pohotovostná hmotnosť'],
];
// sekcia zdrojov (item text)
const SRC_REPL = [
  ['Prednáška prof. Dreyera 19.04.2024 Tulln', 'Prednáška prof. Dreyera, 19. 4. 2024, Tulln'], // #5
];

const applied = [];
const apWith = (t, pairs) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of pairs) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
const ap = (t) => apWith(t, REPL);
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function stripIds(o) { if (Array.isArray(o)) return o.map(stripIds); if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) { if (k === 'id') continue; r[k] = stripIds(o[k]); } return r; } return o; }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  if (b.__component === 'content.sources') { const s = stripIds(b); s.items = (s.items || []).map((it) => ({ ...it, text: apWith(it.text, SRC_REPL) })); return s; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=danuvina-alacris-opat-na-vodach-dunaja&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);

  const all = [...REPL, ...SRC_REPL].map(([a]) => a);
  const miss = all.filter((a) => !applied.includes(a));
  console.log('aplikovaných:', [...new Set(applied)].length, '/', all.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m).slice(0, 80))); }
  else console.log('✓ všetko sa trafilo');
  const imgs = outBlocks.filter((b) => b.__component === 'content.image-block');
  console.log('blokov:', outBlocks.length, '| image-block:', imgs.length, '| s image.id:', imgs.filter((b) => b.image).length);

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

/**
 * Opravy hladanie-bez-hranic-cesko-slovensky-dialog... (nadpis + SK prepis + CZ typografia + perex).
 *   node _fix-hladanie.mjs [--commit]
 *
 * Video (YouTube G2ywrFLlys8) je prítomné — nič sa nestratilo.
 * Prechod SK→CZ (uvádzacia veta) NEDOPĹŇAM — inštrukcia bola useknutá; flag pre používateľa.
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

const SK_OLD = 'OZ Hradiská sa spolupodieľali na veľmi zaujímavom projekte s Archeologickým ústavom v Brne, Pamiatkovým úradom SR a Archeo Moravia, ktorého prvým výsledkom je táto zaujímavá diskusia archeológov a laikov na tému vzájomnej spolupráce. Budeme zvedaví na vaše reakcie. Ďakujeme za super prístup Balážovi Komoroczymu, Petrovi Bistákovi, Jiřímu Ráčilovi a Tomášovi Mertovi.';
const SK_NEW = 'OZ Hradiská sa spolupodieľalo s Archeologickým ústavom v Brne, Pamiatkovým úradom SR a spolkom Archeo Moravia na veľmi zaujímavom projekte, ktorého prvým výsledkom je táto diskusia archeológov a laikov na tému vzájomnej spolupráce. Budeme zvedaví na vaše reakcie. Ďakujeme za ústretový prístup Balázsovi Komoróczymu, Petrovi Bistákovi, Jiřímu Ráčilovi a Tomášovi Mertovi.';
const NEW_EXCERPT = 'OZ Hradiská sa spolupodieľalo s Archeologickým ústavom v Brne, Pamiatkovým úradom SR a spolkom Archeo Moravia na veľmi zaujímavom projekte, ktorého prvým výsledkom je táto diskusia archeológov a laikov na tému vzájomnej spolupráce. Budeme zvedaví na vaše reakcie.';

const REPL = [
  ['Česko-Slovenský dialóg', 'česko-slovenský dialóg'],                                          // #1 titulok
  [SK_OLD, SK_NEW],                                                                               // #2/#3/#5/#6 SK prepis
  // #8 (CZ, rt#2) — názov programu do úvodzoviek
  ['program Společnými silami za poznáním společného archeologického dědictví Jihomoravského kraje, který',
   'program ' + LQ + 'Společnými silami za poznáním společného archeologického dědictví Jihomoravského kraje' + RQ + ', který'],
  // #9 (CZ, rt#2) — druhá čiarka za „Brno"
  ['AV ČR, Brno a Jihomoravský kraj', 'AV ČR, Brno, a Jihomoravský kraj'],
  // #8 (CZ, rt#3) — názov projektu do úvodzoviek
  ['projektu Integrovaný model občanské vědy v archeologii: odborná spolupráce, aplikace a transfer poznatků v Jihomoravském kraji, podpořeného',
   'projektu ' + LQ + 'Integrovaný model občanské vědy v archeologii: odborná spolupráce, aplikace a transfer poznatků v Jihomoravském kraji' + RQ + ', podpořeného'],
  // #7 (CZ, rt#3) — bodka na konci
  ['Akademie věd ČR v roce 2025', 'Akademie věd ČR v roce 2025.'],
];

const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest; // embed atď. zachovaj
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=hladanie-bez-hranic-cesko-slovensky-dialog-archeologov-a-detektoristov&populate[blocks][populate]=*&fields[0]=title&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newTitle = ap(d.title || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  console.log('title:', JSON.stringify(newTitle));
  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  console.log('aplikovaných párov:', [...new Set(applied)].length, '/', REPL.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m).slice(0, 90))); } else console.log('✓ všetko');
  console.log('embed zachovaný:', outBlocks.some((b) => b.__component === 'content.embed'));

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { title: newTitle, excerpt: NEW_EXCERPT, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
}
main();

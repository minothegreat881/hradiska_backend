/**
 * Opravy otomanska — 2. dávka: katalóg #16–24 + hlavný text #25–31 (REPL).
 * Reštrukturalizácia nadpisov katalógu (#1–15) je zvlášť.
 *   node _fix-otomanska2.mjs [--commit]
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
  ['veľkosti lokality 10ha', 'veľkosti lokality 10 ha'],                                              // 16
  ['Z časti vykazujú známky', 'Sčasti vykazujú známky'],                                              // 17
  ['boli postavané pri sebe', 'boli postavené pri sebe'],                                             // 18
  ['rázovitosť terénu, stačilo opevniť', 'rázovitosť terénu stačilo opevniť'],                         // 19
  ['7 chát bolo situovaných', 'Sedem chát bolo situovaných'],                                         // 20
  ['ktorá bolo široká asi 2,5 metra', 'ktorá bola široká asi 2,5 metra'],                              // 21
  ['charakteru domov a koncentrácii špecifických nálezov', 'charakteru domov a koncentrácie špecifických nálezov'], // 22
  ['s rozlohou poľa plánu asi 8 000 m²', 's rozlohou podľa plánu asi 8 000 m²'],                       // 23
  ['Krośnie 2011', 'Krosno 2011'],                                                                    // 24
  ['na Východnom Slovensku', 'na východnom Slovensku'],                                               // 25
  ['že vznikli dokladá istú', 'že vznikli, dokladá istú'],                                             // 26
  ['miesta kde sídlila elita respektíve vyššie postavení obyvatelia', 'miesta, kde sídlila elita, respektíve vyššie postavení obyvatelia'], // 27
  ['kovových výrobkov, naznačujú', 'kovových výrobkov naznačujú'],                                     // 28
  ['Na základe štúdije konštatujem', 'Na základe štúdie konštatujem'],                                // 29
  ['akým spôsobom sa jej prislúchajúce roľnícke zázemie', 'akým spôsobom jej prislúchajúce roľnícke zázemie'], // 30a
  ['sídliská v okolí zodpovedali', 'sídliská v okolí zodpovedalo'],                                    // 30b
  ['o ktorej pojednávam nižšie a sústredenie špecifických nálezov', 'o ktorej pojednávam nižšie, a na sústredenie špecifických nálezov'], // 31
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = stripIds(JSON.parse(JSON.stringify(b.body || []))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=sidliska-otomanskej-kultury-na-vychodnom-slovensku&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('aplikovaných:', [...applied].length, '/', REPL.length);
  REPL.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ NEAPLIKOVANÉ: ' + JSON.stringify(m).slice(0, 55)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

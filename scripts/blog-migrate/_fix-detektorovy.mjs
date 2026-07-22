/**
 * Gramatické/štylistické opravy detektorovy-prieskum-hradiska (telo + perex). Len text.
 *   node _fix-detektorovy.mjs [--commit]
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

// Poradie dôležité: #1 (dlhé súvetie) musí bežať PRED perexovým „železných šípov".
const REPL = [
  // #1 rozdelenie dlhého súvetia na 3 vety + #2 terminológia (hroty šípov)
  ['Našli sme napríklad množstvo stredovekých železných šípov, všetky boli orientované v rovnakom smere, mali rovnaký tvar, vďaka presnému zameraniu má archeológ zdokumentované ich rozmiestnenie v ploche hradiska a z toho vidí, že sa koncentrovali na pomerne malom priestore, takže sa dá predpokladať, odkiaľ útočníci strieľali a na čo sústredili útok.',
   'Našli sme napríklad množstvo stredovekých železných hrotov šípov. Všetky boli orientované v rovnakom smere a mali rovnaký tvar. Vďaka presnému zameraniu má archeológ zdokumentované ich rozmiestnenie v ploche hradiska a z toho vidí, že sa koncentrovali na pomerne malom priestore, takže sa dá predpokladať, odkiaľ útočníci strieľali a na čo sústredili útok.'],
  // #8 opakovanie/význam
  ['Už len toto vytvára doposiaľ neznámy príbeh', 'Už to samo osebe odkrýva doposiaľ neznámy príbeh'],
  // #7 vypchávka
  ['Prispeli sme tak svojím dielom k poznaniu', 'Prispeli sme tak k poznaniu'],
  // #3 + #4 + #5 kondicionál v celom súvetí + vrecko + za kus
  ['nahádžu ich do sáčku a niekde na burze popredajú po 10 eur/kus a celý príbeh by bol navždy stratený',
   'nahádzali by ich do vrecka, niekde na burze popredali po 10 eur za kus a celý príbeh by bol navždy stratený'],
  // #6 čiarka pri odporovacom „a nie"
  ['treba s detektormi pomáhať a nie robiť škody', 'treba s detektormi pomáhať, a nie robiť škody'],
  // perex (#2 terminológia — po #1, ktoré už telo zmenilo)
  ['stredovekých železných šípov', 'stredovekých železných hrotov šípov'],
];

const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=detektorovy-prieskum-hradiska&populate[blocks][populate]=*&fields[0]=title&fields[1]=excerpt&fields[2]=metaTitle&fields[3]=metaDescription&fields[4]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newExcerpt = ap(d.excerpt || ''), newMetaT = ap(d.metaTitle || ''), newMetaD = ap(d.metaDescription || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  console.log('aplikovaných párov:', [...new Set(applied)].length, '/', REPL.length, '| výskytov:', applied.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m).slice(0, 90))); }
  else console.log('✓ všetkých ' + REPL.length + ' párov');

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, metaTitle: newMetaT, metaDescription: newMetaD, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

/**
 * Opravy nalezy-z-hradiska-dolna-marikova-simunky-siroka (titulok + telo + bibliografia + autor).
 *   node _fix-nalezy-marikova.mjs [--commit]
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
const EN = '–';

const BIB_OLD = 'zo súboru dokumentov Martin Olšovský, Štefan Meliš, Jozef Moravčík: Po stopách predkov, Archeológia Stredného Považia od praveku po stredovek - súbor dokumentov a fotografií, vydal vlastným nákladom Martin Olšovský v roku 2008 v počte 4 kusy.';
const BIB_NEW = 'zo súboru dokumentov: OLŠOVSKÝ, M. ' + EN + ' MELIŠ, Š. ' + EN + ' MORAVČÍK, J.: Po stopách predkov. Archeológia stredného Považia od praveku po stredovek. Súbor dokumentov a fotografií. Vlastným nákladom vydal Martin Olšovský, 2008, náklad 4 kusy.';

const REPL = [
  ['Mariková - Šimunky', 'Mariková ' + EN + ' Šimunky'],                                       // #1 titulok
  ['predmetov, nachádzajúcich sa na hradisku', 'predmetov nachádzajúcich sa na hradisku'],      // #2 (telo+perex)
  ['a autora fotografií nálezov Vám prinášame ako prví na Slovensku fotografie týchto úžasných nálezov',
   'a autora fotografií vám ako prví na Slovensku prinášame fotografie týchto úžasných nálezov'], // #3+#4
  [BIB_OLD, BIB_NEW],                                                                            // #5+#6
  ['Bez odborného popisu je hodnota nálezov takpovediac polovičná',
   'Bez odborného opisu je výpovedná hodnota nálezov len čiastočná'],                            // #7
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
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=nalezy-z-hradiska-dolna-marikova-simunky-siroka&populate[blocks][populate]=*&fields[0]=title&fields[1]=excerpt&fields[2]=authorName&fields[3]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newTitle = ap(d.title || ''), newExcerpt = ap(d.excerpt || '');
  const newAuthor = d.authorName === 'Unknown' ? 'Orgon' : d.authorName;                          // #8
  const outBlocks = (d.blocks || []).map(cleanBlock);

  console.log('title:', JSON.stringify(newTitle));
  console.log('authorName:', JSON.stringify(d.authorName), '→', JSON.stringify(newAuthor));
  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  console.log('aplikovaných:', [...new Set(applied)].length, '/', REPL.length, '| výskytov:', applied.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m).slice(0, 90))); } else console.log('✓ všetko');

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { title: newTitle, excerpt: newExcerpt, authorName: newAuthor, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

/**
 * Gramatické/typografické opravy darujte-nam-2-z-dane-2018 (titulok + perex + telo + odkaz).
 *   node _fix-darujte2018.mjs [--commit]
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
  ['Darujte nám 2% z dane', 'Darujte nám 2 % z dane'],                                 // #1 titulok
  ['o 2% z Vašich daní', 'o 2 % z vašich daní'],                                        // #2
  ['a podobne), ktoré využívame', 'a podobne), ktorú využívame'],                       // #3 zhoda (techniku)
  ['Tiež z týchto peňazí financujeme naše', 'Z týchto peňazí financujeme aj naše'],     // #4 slovosled/bohemizmus
  ['naše akcie, ako tvorbu a osádzanie info tabúľ', 'naše akcie, napríklad tvorbu a osádzanie informačných tabúľ'], // #5
  ['nového Zborníka Hradiská', 'nového zborníka Hradiská'],                             // #6 druhové označenie malé
  ['za každé Vaše Euro.', 'za každé vaše euro.'],                                        // #7 malé „v" + mena malým
  ['na poskytnutie 2% si môžete', 'na poskytnutie 2 % si môžete'],                       // #8
  ['TOMTO ODKAZE', 'tomto odkaze'],                                                      // #9 verzálky preč (text odkazu)
];

const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = JSON.parse(JSON.stringify(b.body || []));
    body.forEach(walk);
    // #10: veta zakončená odkazom nemá bodku → doplň text-uzol s bodkou
    for (const n of body) {
      if (n.type === 'paragraph' && Array.isArray(n.children) && n.children.length) {
        const last = n.children[n.children.length - 1];
        if (last && last.type === 'link') { n.children.push({ type: 'text', text: '.' }); applied.push('#10 bodka za odkazom'); }
      }
    }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=darujte-nam-2-z-dane-2018&populate[blocks][populate]=*&fields[0]=title&fields[1]=excerpt&fields[2]=metaTitle&fields[3]=metaDescription&fields[4]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newTitle = ap(d.title || ''), newExcerpt = ap(d.excerpt || ''), newMetaT = ap(d.metaTitle || ''), newMetaD = ap(d.metaDescription || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);

  console.log('title:', JSON.stringify(newTitle));
  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  console.log('aplikovaných párov:', [...new Set(applied)].length, '| celkovo výskytov:', applied.length);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m))); }
  else console.log('✓ všetkých ' + REPL.length + ' párov + bodka');

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { title: newTitle, excerpt: newExcerpt, metaTitle: newMetaT, metaDescription: newMetaD, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

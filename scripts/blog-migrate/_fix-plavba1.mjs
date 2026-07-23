/**
 * Opravy plavba-rimskou-lodou-po-dunaji-1-diel: hlavička (ROMA AETERNA…), 34 gram./typo,
 * obnova nadpisu LOĎ (rozdelenie zlepeného odseku), odstránenie duplicitných zdrojov z tela.
 *   node _fix-plavba1.mjs [--commit]
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
  ['ROMA ETERNAROMA INVICTADANUVINA ALACRIS !', 'ROMA AETERNA · ROMA INVICTA · DANUVINA ALACRIS!'], // hlavička
  ['Rumunsku.„Danuvina', 'Rumunsku. „Danuvina'],                                                     // #1
  ['krajín.Každý', 'krajín. Každý'],                                                                 // #4
  ['40 km počas ktorých sa vesluje', '40 km, počas ktorých sa vesluje'],                             // #2
  ['dvaja skipperi', 'dvaja kormidelníci'],                                                          // #3
  ['Ak človek vyjde zo svojej komfortnej zóny a posunúť svoje hranice je skúška', 'Vyjsť zo svojej komfortnej zóny a posunúť svoje hranice je skúška'], // #5
  ['dá oveľa viac, ako vezme...', 'dá oveľa viac, ako vezme.'],                                       // #6
  ['pohlavie, vek, národnosť či vzdelanie...', 'pohlavie, vek, národnosť či vzdelanie.'],             // #6
  ['a hranicu "Limes"', 'a hranice „limes“'],                                                        // #7
  ['je cca 40cm', 'je cca 40 cm'],                                                                   // #8
  ['Vyrobených bolo 49 kusov v dĺžke 4,10 m a 4 kusov 4,70 alebo 4,40 m', 'Vyrobených bolo 49 kusov s dĺžkou 4,10 m a 4 kusy s dĺžkou 4,70 alebo 4,40 m'], // #9
  ['použitých pre stavbu lode bolo cca 3500ks', 'použitých na stavbu lode bolo cca 3 500 ks'],        // #10
  ['cca 4000 kusov', 'cca 4 000 kusov'],                                                             // #11
  ['enkaustiky, t.j. čiastočne', 'enkaustiky, t. j. čiastočne'],                                      // #12
  ['receptúry "Púnskeho vosku" podľa Plinia', 'receptúry „púnskeho vosku“ podľa Plínia'],            // #13
  ['aby "videla ďaleko"', 'aby „videla ďaleko“'],                                                    // #15
  ['preskúmané najmodernejšími geofyzikálnymi metódami. (napríklad tábor MATRICA, ktorému sa budeme venovať v ďalšej časti)',
   'preskúmané najmodernejšími geofyzikálnymi metódami (napríklad tábor Matrica, ktorému sa budeme venovať v ďalšej časti).'], // #17
  ['o „dunajskom limite“', 'o „dunajskom limese“'],                                                  // #18
  ['okolie Carnunata', 'okolie Carnunta'],                                                           // #19
  ['v rokoch 6 - 9 po tzv.', 'v rokoch 6 – 9 po tzv.'],                                               // #20
  ['dobyté už 12 - 9 pred Kr.', 'dobyté už 12 – 9 pred Kr.'],                                         // #20
  ['germánske kmene Vandalov a Gótov). Roku 433', 'germánske kmene Vandalov a Gótov. Roku 433'],      // #21
  ['za Atilu', 'za Attilu'],                                                                         // #22
  ['tábor Matrica v Száshalombatta', 'tábor Matrica v Százhalombatte'],                              // #25
  ['múzeá v Baji, Dunafoldvár', 'múzeá v Baji, Dunaföldvár'],                                         // #26
  ['(napr. nálezy – kultúra zvoncových pohárov, kultúra Vatya, mohyly v archeoparku a iné.)', '(napr. kultúra zvoncových pohárov, kultúra Vatya, mohyly v archeoparku a iné)'], // #27
  ['najväčsí producent', 'najväčší producent'],                                                      // #28
  ['roku 409 n.l.', 'roku 409 n. l.'],                                                                // #31
  ['verejné kúpele, Mithraeum a paláce', 'verejné kúpele, mithraeum a paláce'],                       // #32
  ['o týždeň ...', 'o týždeň.'],                                                                      // #33
];

const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
const blockText = (b) => nfc((b.body || []).map(n => (n.children || []).map(c => c.text || (c.type === 'link' ? (c.children || []).map(x => x.text).join('') : '')).join('')).join('')).trim();
const isDupSrc = (b) => b.__component === 'content.rich-text' && (
  blockText(b).startsWith('(informácie uvedené v texte sú čerpané') ||
  blockText(b) === 'a z prednášok, ktoré boli sprievodným programom plavby)' ||
  /^https?:\/\/(www\.)?(donau-uni|interreg-danube|matricamuzeum|hu\.wikipedia|paks)\./.test(blockText(b)));

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=plavba-rimskou-lodou-po-dunaji-1-diel&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const out = [];
  let lodSplit = false, dupRemoved = 0, srcFixed = false;
  for (const b of d.blocks || []) {
    if (isDupSrc(b)) { dupRemoved++; continue; }                                   // #4 duplicitné zdroje z tela preč
    if (b.__component === 'content.rich-text') {
      const body = JSON.parse(JSON.stringify(b.body || []));
      // #34 rozdeľ „LOĎ\n…" na nadpis + odsek
      const first = body[0];
      const ftxt = nfc((first?.children || []).map(c => c.text || '').join(''));
      if (first?.type === 'paragraph' && /^LOĎ\s*\n/.test(ftxt) && ftxt.includes('Prof. Dr. Boris')) {
        out.push({ __component: 'content.rich-text', body: [{ type: 'heading', level: 2, children: [{ type: 'text', text: 'Loď' }] }] });
        first.children[0].text = ftxt.replace(/^LOĎ\s*\n\s*/, '');
        lodSplit = true;
      }
      body.forEach(walk);
      out.push({ __component: 'content.rich-text', body });
    } else if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; out.push({ __component: 'content.image-block', ...rest, image: image?.id ?? image }); }
    else if (b.__component === 'content.sources') {
      const items = (b.items || []).filter(it => /^https?:\/\//.test((it.url || it.text || '').trim())).map(it => ({ text: it.url || it.text, url: it.url || it.text }));
      out.push({ __component: 'content.sources', title: 'Zdroje a literatúra', intro: 'Informácie v texte sú čerpané z týchto webových stránok a z prednášok, ktoré boli sprievodným programom plavby:', items });
      srcFixed = true;
    } else { const { id, ...rest } = b; out.push(rest); }
  }
  const newExcerpt = ap(d.excerpt || '');

  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  console.log('aplikovaných REPL:', applied.size, '/', REPL.length, '| LOĎ split:', lodSplit, '| dup-zdroj blokov preč:', dupRemoved, '| zdroje prestavané:', srcFixed);
  if (miss.length) { console.log('⚠ NENÁJDENÉ:'); miss.forEach(m => console.log('  - ' + JSON.stringify(m).slice(0, 70))); }
  console.log('blokov:', out.length, '(bolo', (d.blocks || []).length + ')');

  if (!COMMIT) { console.log('\n(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: out } }) });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
}
main();

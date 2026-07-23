/**
 * Oprava vyprava-k-vikingom-2013-1-cast (Ľubka J.).
 * Obnova stratených kusov (#1,#4 zo zdroja; #3,#5 kontext/návrh), runové názvy (#6,#7,#8),
 * ~40 zlepených slov/čechizmov/typo, nadpis Eketorp, autor Ľubka J.
 *   node _fix-viking1.mjs [--commit]
 * FLAG: #9 verš „HIDDEN VIE…" — nezrozumiteľný aj v origináli, nechávam (treba správny preklad).
 *       #3 „je tu pochovaný" je kontextová domnienka (v origináli veta nedokončená).
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
const EN = '–', ELL = '…', LQ = '„', RQ = '“';

const REPL = [
  // ── obnovy / runové ──
  ['s názvom PIVO JE STENAR-Ale je Stones', 's názvom Ale stenar (Ale je Stones)'],                   // #6
  ['800-1050 pnl.', '800 ' + EN + ' 1050 n. l.'],                                                      // #7 (aj pôvodná bodka)
  ['že vodca Vikingov, ktorý padol v bitke pri Svolder.', 'že je tu pochovaný vodca Vikingov, ktorý padol v bitke pri Svolder.'], // #3 (domnienka)
  ['oveľa starších).', 'oveľa starších.'],                                                             // #2 nepárová zátvorka
  ['cítili sme sa ako v stredoveku iek vysokým, 4 metrovým múrom, mala pevnosť zrejme pre množstvo brán ,slabú obranu',
   'cítili sme sa ako v stredoveku. Napriek vysokým, 4-metrovým múrom mala pevnosť pre množstvo brán zrejme slabú obranu'], // #5
  ['”TENTO KAMEŇ BOL UMIESTNENÝ SIBBEM,PORUČNÍKOM, FOLDARSOVÝM SYNOM ALE JEHO SPRIEVOD BOL NA OSTROVE.',
   LQ + 'Tento kameň bol umiestnený Sibbim, poručníkom, Foldarovým synom, ale jeho sprievod bol na ostrove.' + RQ], // #8
  ['Je To jediný originál verš', 'Je to jediný originálny verš'],
  // ── čechizmy / pravopis ──
  ['hlinenná', 'hlinená'], ['Mrtvych', 'Mŕtvych'], ['civilizávie', 'civilizácie'], ['souvenir', 'suvenír'],
  ['yavesiť', 'zavesiť'], ['proste žije', 'jednoducho žije'], ['laskominku', 'maškrtu'], ['volný čas', 'voľný čas'],
  ['taka dedina', 'taká dedina'], ['mate možnosť', 'máte možnosť'], ['ktoré nám špatilo atmosféru', 'ktoré nám kazili atmosféru'],
  ['na krk, či priniesť', 'na krk či priniesť'],
  // ── spojovník → pomlčka / zlepené ──
  ['menhirov-vysokých', 'menhirov ' + EN + ' vysokých'], ['kamene-menhiry', 'kamene ' + EN + ' menhiry'],
  ['Prišli sme skoro-a tak', 'Prišli sme skoro ' + EN + ' a tak'], ['pekárovi- ponúkne', 'pekárovi ' + EN + ' ponúkne'],
  ['obyčajný-kmínový', 'obyčajný ' + EN + ' kmínový'], ['výborne-pamätám', 'výborne ' + EN + ' pamätám'],
  ['priateľstva- to všetko', 'priateľstva ' + EN + ' to všetko'], ['na smrť- na hlavách', 'na smrť ' + EN + ' na hlavách'],
  ['nepotrebujeme- a možno', 'nepotrebujeme ' + EN + ' a možno'],
  ['kýnm', 'kým'], ['Napr Nebyť', 'Napríklad nebyť'], ['do chráneného UNESCO', 'do chráneného územia UNESCO'],
  ['o pevnosť, a územia', 'o pevnosť a územia'], ['17.stor.', '17. stor.'],
  ['rokov.slúžiace ako pohrebisko', 'rokov, slúžiace ako pohrebisko'], ['chceli priamo do miest', 'chceli ísť priamo do miest'],
];
const RX = [
  [/[…]+nad morom/gu, 'Na skalnatom podlaží nad morom'],   // #1a strata
  [/[…]+do tvaru lode/gu, 'do tvaru lode'],                // #1b falošná …
  [/[…]+asi 600 rokov/gu, 'kosti z obdobia asi 600 rokov'],// #4 strata
  [/ +([.!?;:,])/gu, '$1'],                                     // medzera pred interpunkciou
  [/,(?=\p{L})/gu, ', '],                                       // medzera po čiarke (nie desatinnej)
  [/(\p{L}),(?=\d)/gu, '$1, '],                                 // vetná čiarka pred číslicou (hlavnej,26)
  [/(\p{Ll})([.!?])(\p{Lu})/gu, '$1$2 $3'],                     // zlepené vety
  [/[.…]{2,}/gu, ELL],                                     // viacbodky → …
  [/…(?=\p{L})/gu, ELL + ' '],                             // medzera po … pred písmenom
];
const applied = new Set();
function ap(t) {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } }
  for (const [rx, b] of RX) { s = s.replace(rx, b); }
  return s;
}
function walk(node) {
  if (node && typeof node.text === 'string') node.text = ap(node.text);
  if (node && Array.isArray(node.children)) node.children.forEach(walk);
}
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = JSON.parse(JSON.stringify(b.body || []));
    body.forEach(walk);
    // rozdel „Eketorp" (tučný uzol) na nadpis + odsek
    const nb = [];
    for (const n of body) {
      if (n.type === 'paragraph' && n.children?.[0]?.text === 'Eketorp' && n.children.length >= 1) {
        nb.push({ type: 'heading', level: 2, children: [{ type: 'text', text: 'Eketorp' }] });
        const rest = n.children.slice(1);
        if (rest[0] && typeof rest[0].text === 'string') rest[0].text = rest[0].text.replace(/^[\s\n]+/, '');
        if (rest.some(c => (c.text || '').trim() || c.type === 'link')) nb.push({ type: 'paragraph', children: rest });
      } else nb.push(n);
    }
    return { __component: 'content.rich-text', body: nb };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyprava-k-vikingom-2013-1-cast&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  const heads = outBlocks.flatMap(b => (b.body || []).filter(n => n.type === 'heading').map(n => (n.children || []).map(c => c.text).join('')));
  console.log('aplikovaných párov:', [...applied].length, '/', REPL.length, '| nadpisy:', JSON.stringify(heads));
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  if (miss.length) miss.forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 55)));

  if (!COMMIT) { console.log('\n(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks, authorName: 'Ľubka J.' } }) });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
}
main();

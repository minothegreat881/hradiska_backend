/**
 * Opravy sidliska-otomanskej-kultury (seminárna práca). Jednoznačné textové opravy + Arch. Rozhledy.
 * Duplicitný zoznam literatúry a #5 (dropped word) sa riešia zvlášť.
 *   node _fix-otomanska.mjs [--commit]
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
  ['sa v práci zameriava na opevnené osady', 'sa v práci zameriavam na opevnené osady'],           // 1
  ['z Poľskej časti Karpát', 'z poľskej časti Karpát'],                                              // 2
  ['z chronologické aj chorologického hľadiska', 'z chronologického aj chorologického hľadiska'],   // 3
  ['východnom Slovenska', 'východnom Slovensku'],                                                    // 4
  ['dosahuje tvorí pritom', 'dosahuje, tvorí pritom'],                                               // 5 (min. čiarka)
  ['opevnených osád, sa treba pozrieť', 'opevnených osád sa treba pozrieť'],                          // 6
  ['Podobná situácie je sledovateľná', 'Podobná situácia je sledovateľná'],                          // 7
  ['V Trizcinici', 'V Trzcinici'],                                                                    // 8
  ['chaty mohli byt umiestňované', 'chaty mohli byť umiestňované'],                                   // 9
  ['v areály osád', 'v areáli osád'],                                                                 // 10
  ['boli nájdená aj stopy', 'boli nájdené aj stopy'],                                                 // 11
  ['proto-urbárne alebo vyššie sídelné jednotky', 'protourbánne alebo vyššie sídelné jednotky'],      // 13
  ['ďalších menej náročné odvetvia', 'ďalšie menej náročné odvetvia'],                                // 14
  ['preskúmaná po dnes asi tretina', 'preskúmaná doteraz asi tretina'],                               // 15
  ['ďalšie nálezy ,hneď po prvom horizonte', 'ďalšie nálezy, hneď po prvom horizonte'],               // 16
  ['lokalita v otomanskej kultúre nebolo viac osídlená', 'lokalita v otomanskej kultúre nebola viac osídlená'], // 17
  ['Brána mala dreveno kamennú konštrukciu', 'Brána mala dreveno-kamennú konštrukciu'],               // 18
  ['S-V časť osady', 'severovýchodná časť osady'],                                                    // 20
  ['Arch, Rozhledy', 'Arch. Rozhledy'],                                                               // bibliografia
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = stripIds(JSON.parse(JSON.stringify(b.body || []))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.sources') { const { id, items, ...rest } = b; return { __component: 'content.sources', ...stripIds(rest), items: (items || []).map(it => { const { id, ...x } = it; return { ...x, text: ap(x.text) }; }) }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=sidliska-otomanskej-kultury-na-vychodnom-slovensku&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('aplikovaných:', [...applied].length, '/', REPL.length);
  REPL.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ NEAPLIKOVANÉ: ' + JSON.stringify(m).slice(0, 50)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

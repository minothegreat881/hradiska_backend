/**
 * Otomanska — rozbitie mega-bloku #53 (Nižná zvyšok + celá Barca + Rozhanovce header/poloha).
 * Podnadpisy veľkým + samostatný odsek; lokalitné hlavičky vlastný odsek; \n → odseky.
 * Spracuje KAŽDÝ blok, ktorý ešte obsahuje malý podnadpis.
 *   node _fix-otomanska-mega.mjs [--commit]
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
const SEP = '';

const SUB = [
  ['poloha, rozloha a stav výskumu', 'Poloha, rozloha a stav výskumu'],
  ['chronológia – vznik osady, počet horizontov a zánik', 'Chronológia – vznik osady, počet horizontov a zánik'],
  ['komplex osady, opevnenie, vnútorná zástavba a objekty', 'Komplex osady, opevnenie, vnútorná zástavba a objekty'],
];
const LOCHEAD = [
  'Opevnená osada v Barci I (Kabát 1955, Točík 1994)',
  'Rozhanovce – Plebanské II (Hôrka) (Gašaj 1983)',
];
const para = (t) => ({ type: 'paragraph', children: [{ type: 'text', text: t }] });
const hasLowSub = (t) => SUB.some(([low]) => nfc(t).includes(low));

let subCount = 0;
function splitMega(nodes) {
  let T = nodes.map(n => (n.children || []).map(c => c.text || '').join('')).join('\n');
  T = nfc(T);
  for (const [low, cap] of SUB) { const parts = T.split(low); if (parts.length > 1) subCount += parts.length - 1; T = parts.join(SEP + cap + SEP); }
  for (const h of LOCHEAD) T = T.split(h).join(SEP + h + SEP);
  T = T.replace(/\n+/g, SEP).replace(/[ \t]{3,}/g, SEP);
  const segs = T.split(SEP).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return segs.map(para);
}

function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const full = (b.body || []).map(n => (n.children || []).map(c => c.text || '').join('')).join('\n');
    if (hasLowSub(full)) return { __component: 'content.rich-text', body: splitMega(b.body || []) };
    return { __component: 'content.rich-text', body: stripIds(b.body || []) };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=sidliska-otomanskej-kultury-na-vychodnom-slovensku&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('podnadpisov v mega-bloku opravených:', subCount);
  // náhľad prestavaného #53
  const mega = outBlocks.find(b => b.__component === 'content.rich-text' && (b.body || []).some(n => (n.children || []).map(c => c.text).join('').includes('Opevnená osada v Barci I')));
  if (mega) { console.log('mega-blok → ' + mega.body.length + ' odsekov:'); mega.body.forEach((n, i) => { const t = (n.children || []).map(c => c.text).join(''); if (/^(Poloha|Chronológia|Komplex|Opevnená osada v Barci I|Rozhanovce –)/.test(t)) console.log('   [' + i + '] ' + JSON.stringify(t.slice(0, 55))); }); }

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

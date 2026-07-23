/**
 * Opravy rekonstrukcia-opevnenia-hradisk:
 *  #1/#2 citát Ibn Jakob — odstrániť vlastné „ " z text poľa (komponent ich pridáva → inak zdvojené)
 *  #3–#5 kedy → keď (vzťažné)
 *  #6 prepis syntakticky rozbitej vety (podľa návrhu používateľa)
 *  #7 čiarka pred „a to"
 * #8 „ranouhorský štát" — vysvetlenie odrezané, NECHÁVAM bez zmeny (spýtať sa).
 *   node _fix-opevnenie.mjs [--commit]
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

const BODY = [
  ['tatárskeho vpádu, kedy sa ukázal', 'tatárskeho vpádu, keď sa ukázal'],          // #3
  ['9. storočia, kedy naši predkovia', '9. storočia, keď naši predkovia'],          // #4
  ['zničení hradiska, kedy drevené časti', 'zničení hradiska, keď drevené časti'],  // #5
  // #6 prepis rozbitej vety
  ['ktoré postupne dobyli, alebo na základe vzdania sa, čo po dohode s miestnym veľmožom, ktorý sa k nim pridal, získali niektoré kľúčové centrá Veľkej Moravy a tá sa ako centralizovaný štát rozpadla',
   'ktoré niektoré kľúčové centrá Veľkej Moravy postupne dobyli, iné získali na základe dohody s miestnymi veľmožmi, ktorí sa k nim pridali, a tá sa ako centralizovaný štát rozpadla'],
  ['umiestnili palisádu a to tak, aby', 'umiestnili palisádu, a to tak, aby'],      // #7
];
const applied = new Set();
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of BODY) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };

let qFixed = false;
function cleanBlock(b) {
  if (b.__component === 'content.quote-block') {
    let t = nfc(b.text || '');
    const before = t;
    t = t.replace(/^[„“"]+\s*/, '').replace(/\s*[“”"]+$/, '');   // #1/#2 odstráň vlastné úvodzovky
    if (t !== before) qFixed = true;
    const { id, author, source } = b;
    return { __component: 'content.quote-block', text: t, author: author ?? null, source: source ?? null };
  }
  if (b.__component === 'content.rich-text') { const body = stripIds(JSON.parse(JSON.stringify(b.body || []))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=rekonstrukcia-opevnenia-hradisk&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('#1/#2 citát:', qFixed, '| telo #3–#7:', [...applied].length, '/', BODY.length);
  BODY.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 45)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

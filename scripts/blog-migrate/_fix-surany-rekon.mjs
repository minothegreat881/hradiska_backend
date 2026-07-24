/**
 * Opravy surany-3d-rekonstrukcia (#4 rieši sa zvlášť po voľbe mena):
 *  #1 čiarka pred „z čias" preč
 *  #2 „V tomto roku" → „V roku 1403"
 *  #3 kedy → keď
 *  #5 „bez majiteľa…" → „bez majiteľa." + rozdelenie odseku (\n\n) od „Okrem 3D videa…"
 *  #6 rozdelenie odseku: odkaz KLIKNITE SEM | Zdroj k textu | Pri tvorbe modelu…
 *   node _fix-surany-rekon.mjs [--commit]
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
  ['ideálnu rekonštrukciu hradu Šurany, z čias tureckých vojen', 'ideálnu rekonštrukciu hradu Šurany z čias tureckých vojen'], // #1
  ['v rokoch 1382 až 1403. V tomto roku sa spomína', 'v rokoch 1382 až 1403. V roku 1403 sa spomína'],  // #2
  ['do roku 2009, kedy ju z nepochopiteľných dôvodov', 'do roku 2009, keď ju z nepochopiteľných dôvodov'],  // #3
];
const RX5 = /bez majiteľa\s*(?:…|\.{3})/u;   // #5a elipsa → bodka
const applied = new Set(); let hit5 = false;
const ap = (t) => {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } }
  if (RX5.test(s)) { s = s.replace(RX5, 'bez majiteľa.'); hit5 = true; }
  return s;
};
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };

let splits = 0;
function splitParagraph(node) {
  const groups = [[]];
  for (const child of node.children || []) {
    if (typeof child.text === 'string' && /\n\s*\n/.test(child.text)) {
      const segs = child.text.split(/\n\s*\n/);
      segs.forEach((seg, si) => { if (si > 0) groups.push([]); groups[groups.length - 1].push({ ...child, text: seg.replace(/\n/g, ' ') }); });
    } else if (typeof child.text === 'string') {
      groups[groups.length - 1].push({ ...child, text: child.text.replace(/\n/g, ' ') });
    } else { groups[groups.length - 1].push(child); }
  }
  if (groups.length > 1) splits += groups.length - 1;
  return groups
    .map((g) => {
      if (g.length && typeof g[0].text === 'string') g[0] = { ...g[0], text: g[0].text.replace(/^[ \t\n]+/, '') };
      if (g.length && typeof g[g.length - 1].text === 'string') g[g.length - 1] = { ...g[g.length - 1], text: g[g.length - 1].text.replace(/[ \t\n]+$/, '') };
      return g.filter((c) => c.type === 'link' || (typeof c.text === 'string' && c.text !== ''));
    })
    .filter((g) => g.length > 0)
    .map((g) => ({ type: 'paragraph', children: g }));
}

function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = stripIds(JSON.parse(JSON.stringify(b.body || [])));
    body.forEach(walk);
    const out = [];
    for (const n of body) { if (n.type === 'paragraph') out.push(...splitParagraph(n)); else out.push(n); }
    return { __component: 'content.rich-text', body: out };
  }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=surany-3d-rekonstrukcia&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('#1-#3:', [...applied].length, '/', REPL.length, '| #5 elipsa→bodka:', hit5, '| splits (#5+#6):', splits);
  REPL.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 45)));
  const lb = outBlocks.find(b => (b.body || []).some(n => (n.children || []).some(c => c.type === 'link' && /KLIKNITE/.test((c.children || []).map(x => x.text).join('')))));
  if (lb) lb.body.forEach((n, i) => console.log('  #6 odsek[' + i + ']: ' + (n.children || []).map(c => c.type === 'link' ? '[[LINK]]' : c.text).join('').slice(0, 60)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

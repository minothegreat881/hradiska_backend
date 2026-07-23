/**
 * Opravy surany-v-16-storoci-3d:
 *  #1 „po prvýkrát" → „prvýkrát" (excerpt + timeline[0].description)
 *  #3 „1663 – 84" → „1663 – 1684" (telo; timeline už OK)
 *  #4 čiarka po „20. 5. 2017" (telo)
 * #2 bez zmeny, #5 podpis+titulok akceptovateľné.
 *   node _fix-surany16.mjs [--commit]
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
  ['V rokoch 1663 – 84 ho okupovali', 'V rokoch 1663 – 1684 ho okupovali'],  // #3
  ['20. 5. 2017 v spolupráci', '20. 5. 2017, v spolupráci'],                  // #4
];
const applied = new Set();
const apBody = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of BODY) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } } return s; };
const walk = (n) => { if (n && typeof n.text === 'string') n.text = apBody(n.text); (n?.children || []).forEach(walk); };
const cleanBlock = (b) => {
  if (b.__component === 'content.rich-text') { const body = stripIds(JSON.parse(JSON.stringify(b.body || []))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  return stripIds(b);
};

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=surany-v-16-storoci-3d&populate[blocks][populate]=*&populate[timeline]=true&fields[0]=documentId&fields[1]=excerpt`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  // #1 excerpt
  const excerpt = nfc(d.excerpt || '').replace('po prvýkrát sa Šurany spomínajú', 'prvýkrát sa Šurany spomínajú');
  const excOk = excerpt !== nfc(d.excerpt || '');

  // #3/#4 telo
  const blocks = (d.blocks || []).map(cleanBlock);

  // #1 timeline[0].description
  let tlOk = false;
  const timeline = (d.timeline || []).map((t) => {
    const { id, ...rest } = t;
    const desc = nfc(rest.description || '').replace('Šurany sa po prvýkrát spomínajú', 'Šurany sa prvýkrát spomínajú');
    if (desc !== nfc(rest.description || '')) tlOk = true;
    return { ...rest, description: desc };
  });

  console.log('#1 excerpt:', excOk, '| #1 timeline[0]:', tlOk, '| telo #3/#4:', [...applied].length, '/', BODY.length);
  BODY.map(([a]) => a).filter(a => !applied.has(a)).forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 40)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { excerpt, blocks, timeline } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

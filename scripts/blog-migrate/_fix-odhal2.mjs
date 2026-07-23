/**
 * Doťahovacie opravy odhalovanie-...: pomlčka (pohanská — ide), Panónia, čitateľné popisky Danuvina odkazov.
 *   node _fix-odhal2.mjs [--commit]
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
const strip = (o) => Array.isArray(o) ? o.map(strip) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, strip(v)])) : o);

const LABELS = {
  '2022/09/plavba-rimskou-lodou-po-dunaji-1-diel': 'Plavba rímskou loďou po Dunaji – 1. diel',
  '2022/09/plavba-rimskou-lodou-po-dunaji-2-diel': 'Plavba rímskou loďou po Dunaji – 2. diel',
  '2024/05/danuvina-alacris-opat-na-vodach-dunaja': 'Danuvina Alacris opäť na vodách Dunaja',
};
const TXT = [
  ['pohanská. ide o slávobránu', 'pohanská — ide o slávobránu'], // #1 bodka -> em-pomlcka
  ['rímskej provincie Pannonia,', 'rímskej provincie Panónia,'],                    // #2 Panonia -> Panonia SK
];

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=odhalovanie-tajomstiev-antickeho-rima-na-strednom-dunaji&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  let txtHits = 0, linkHits = 0, reflow = false;
  const blocks = d.blocks.map((b) => {
    if (b.__component === 'content.rich-text') {
      const body = strip(b.body || []);
      for (const n of body) {
        const paraTxt = (n.children || []).map((c) => c.text || '').join('');
        for (const c of n.children || []) {
          if (typeof c.text === 'string') { let s = nfc(c.text); for (const [a, x] of TXT) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(x); txtHits++; } } c.text = s; }
          if (c.type === 'link') for (const k in LABELS) if (c.url.includes(k)) { c.children = [{ type: 'text', text: LABELS[k] }]; linkHits++; }
        }
        if (paraTxt.includes('dočítate tu') && (n.children || []).filter((c) => c.type === 'link').length === 3) {
          const kids = n.children;
          const li = kids.map((c, i) => (c.type === 'link' ? i : -1)).filter((i) => i >= 0);
          if (kids[li[0] - 1]?.text !== undefined) kids[li[0] - 1].text = ' ';
          if (kids[li[1] - 1]?.text !== undefined) kids[li[1] - 1].text = ', ';
          if (kids[li[2] - 1]?.text !== undefined) kids[li[2] - 1].text = ' a ';
          reflow = true;
        }
      }
      return { __component: 'content.rich-text', body };
    }
    if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
    return strip(b);
  });
  console.log('text-opráv:', txtHits, '| odkazov premenovaných:', linkHits, '| reflow:', reflow);
  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ ' + put.status + ': ' + (await put.text()).slice(0, 200));
}
main();

/**
 * Gramatické opravy článku 2-pre-oz-hradiska (podľa §21 + zoznamu používateľa).
 * Mení LEN text v rich-text blokoch; obrázky/galériu/štruktúru sa nedotýka.
 *   node _fix-2pre-oz.mjs           → náhľad (nič nezapíše)
 *   node _fix-2pre-oz.mjs --commit  → PUT do Strapi
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

const DOC = 'fl6z74qp1twe7hwe70wjdrmq';
// Presné náhrady (NFC). Každá je jedinečný podreťazec v tele.
const REPL = [
  ['2% zo svojich daní', '2 % zo svojich daní'],                                                     // 1
  ['z minulých 2% sme', 'z minulých 2 % sme'],                                                       // 2
  ['nám Vaše 2% veľmi pomôžu', 'nám vaše 2 % veľmi pomôžu'],                                          // 3 + 6 (Vaše→vaše)
  ['daruje 2%,', 'daruje 2 %,'],                                                                      // 4
  ['ten nech mi potom pri objednávke zborníka toto napíše', 'ten nech mi to pri objednávke zborníka napíše'], // 10
  ['poukázanie 2% si môžete', 'poukázanie 2 % si môžete'],                                            // 5
  ['do konca mesiaca apríl', 'do konca apríla'],                                                      // 7
  ['Dwarf digital', 'Dwarf Digital'],                                                                 // 8
  ['Skryté poklady, či nákup', 'Skryté poklady či nákup'],                                            // 9
];

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=2-pre-oz-hradiska&populate[blocks][populate]=*`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('článok nenájdený'); process.exit(1); }

  const blocks = d.blocks || [];
  let applied = 0; const misses = [];
  const outBlocks = [];
  for (const b of blocks) {
    if (b.__component !== 'content.rich-text') { outBlocks.push(b); continue; } // iné komponenty nechať tak
    const body = JSON.parse(JSON.stringify(b.body || []));
    for (const node of body) {
      for (const child of node.children || []) {
        // 11) link „TU" → „tu" (mení sa len text odkazu, nie url)
        if (child.type === 'link' && Array.isArray(child.children)) {
          for (const gc of child.children) {
            if (nfc(gc.text) === 'TU') { gc.text = 'tu'; applied++; console.log('  [link] "TU" → "tu"'); }
          }
        }
        if (typeof child.text === 'string') {
          let t = nfc(child.text);
          for (const [a, bb] of REPL) {
            const na = nfc(a);
            if (t.includes(na)) { t = t.split(na).join(bb); applied++; console.log(`  "${a.slice(0, 42)}" → "${bb.slice(0, 42)}"`); }
          }
          child.text = t;
        }
      }
    }
    outBlocks.push({ __component: 'content.rich-text', body });
  }

  // kontrola, že všetky očakávané náhrady prešli
  for (const [a] of REPL) {
    const found = JSON.stringify(blocks).includes(nfc(a));
    if (!found) misses.push(a);
  }
  console.log(`\naplikovaných zmien: ${applied}`);
  if (misses.length) console.log('⚠ NENÁJDENÉ v pôvodnom texte (over NFC):\n  - ' + misses.join('\n  - '));

  if (!COMMIT) { console.log('\n(náhľad — spusti s --commit na zápis)'); return; }

  const put = await fetch(`${BASE}/api/blog-posts/${DOC}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { blocks: outBlocks } }),
  });
  console.log(put.ok ? `\n✓ PUT OK (${put.status})` : `\n❌ PUT ${put.status}: ${(await put.text()).slice(0, 200)}`);
}
main();

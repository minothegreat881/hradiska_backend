/**
 * Gramatické opravy brigada-oz-hradiska-dolna-marikova-siroka.
 * Telo + perex + popisok image-block (blog-post PUT) + 2 galériové popisky (media 5042, 5281).
 * Zachováva obrázok, embed video aj štruktúru; odstraňuje osamotený podpis „Orgoň".
 *   node _fix-brigada-marikova.mjs [--commit]
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
const DOC = 'z1m235a1861wgzz32i9rmcxa';

// Text-náhrady (telo, perex, popisky). Poradie: špecifické „dobrovolníci.…" pred všeobecné.
const REPL = [
  ['Dňa 7.3.2015', 'Dňa 7. 3. 2015'],                                                                 // 1
  ['brigádu - vyčistenie', 'brigádu – vyčistenie'],                                                    // 2
  ['Široká - Šimunky', 'Široká – Šimunky'],                                                            // 3
  ['ďalší dobrovolníci.…', 'ďalší dobrovoľníci…'],                                                     // 4+5 (perex: mäkčeň + trojbodka)
  ['doprialo príjemný deň, a celodenná', 'doprialo príjemný deň a celodenná'],                         // 6
  ['si môžete plno vychutnať', 'si môžete naplno vychutnať'],                                          // 7
  ['sme tu na záver podnikli určité kroky na zadokumentovanie', 'sme na záver podnikli kroky na zadokumentovanie'], // 8
  ['vynikajúci guľáš', 'vynikajúci guláš'],                                                            // 12 (telo → kodifikované)
  ['pred našou brigádou ...', 'pred našou brigádou.'],                                                 // (finálne: bodka)
  ['... a na nasledujúcich fotkách je dnešný stav:', 'Na nasledujúcich fotografiách je dnešný stav.'], // (finálne: samostatná veta)
  ['zvyk - tanec', 'zvyk – tanec'],                                                                    // 11 (popisok image-block)
];
const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };

function cleanBlock(b) {
  if (b.__component === 'content.rich-text') {
    const body = JSON.parse(JSON.stringify(b.body || []));
    for (const n of body) for (const c of n.children || []) { if (typeof c.text === 'string') c.text = ap(c.text); }
    return { __component: 'content.rich-text', body };
  }
  if (b.__component === 'content.image-block') {
    const { id, image, ...rest } = b;             // id preč; image → len id
    for (const k of ['caption', 'alt']) if (typeof rest[k] === 'string') rest[k] = ap(rest[k]);
    return { __component: 'content.image-block', ...rest, image: image?.id ?? image };
  }
  if (b.__component === 'content.embed') {
    const { id, ...rest } = b; return rest;       // zachovaj provider/embedId/url/caption
  }
  const { id, ...rest } = b; return rest;
}

async function updateMediaCaption(fileId, from, to) {
  const r = await fetch(`${BASE}/api/upload/files/${fileId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const f = await r.json();
  const cap = nfc(f.caption || '').split(nfc(from)).join(to);
  const alt = nfc(f.alternativeText || '').split(nfc(from)).join(to);
  console.log(`  media ${fileId}: "${(f.caption || '').slice(0, 40)}" → "${cap.slice(0, 40)}"`);
  if (!COMMIT) return;
  const form = new FormData();
  form.append('fileInfo', JSON.stringify({ caption: cap, alternativeText: alt }));
  const up = await fetch(`${BASE}/api/upload?id=${fileId}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form });
  console.log('   ', up.ok ? '✓ media OK' : `❌ media ${up.status}`);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=brigada-oz-hradiska-dolna-marikova-siroka&populate[blocks][populate]=*&fields[0]=excerpt`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const newExcerpt = ap(d.excerpt || '');
  const outBlocks = (d.blocks || [])
    .filter((b) => !(b.__component === 'content.rich-text' && nfc((b.body || []).map((n) => (n.children || []).map((c) => c.text || '').join('')).join('').trim()) === 'Orgoň')) // odstráň podpis
    .map(cleanBlock);

  console.log('text-zmien:', applied.length, '| blokov po (bez Orgoň):', outBlocks.length, '(bolo', (d.blocks || []).length + ')');
  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  if (miss.length) console.log('⚠ NENÁJDENÉ:\n  - ' + miss.join('\n  - '));
  console.log('\nGaléria popisky:');
  await updateMediaCaption(5042, 'zvyk - tanec', 'zvyk – tanec');
  await updateMediaCaption(5281, 'Radovan S. - vľavo', 'Radovan S. – vľavo');

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${DOC}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ blog-post PUT OK' : `\n❌ PUT ${put.status}: ${(await put.text()).slice(0, 250)}`);
}
main();

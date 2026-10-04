/**
 * DOPLNOK K OPRAVE MAJCICHOVA — štyri cudzie fotografie v galérii.
 *
 * Prvý priechod opravy hľadal už nahraté obrázky PODĽA NÁZVU. Pri menách typu
 * „Bez názvu 5.jpg" je to nebezpečné: v médiách sú pod tým istým menom
 * fotografie z iných článkov. Porovnanie odtlačkov (aHash) ukázalo, že
 * id 3690/3694/3696/3698 sú INÉ obrázky — do Majcichova nepatria.
 *
 * Tento skript stiahne tie štyri správne fotografie z Blogger CDN, nahrá ich
 * nanovo a vymení ich v galérii. Zvyšok článku sa nedotýka.
 *
 * Poučenie do pipeline: zhoda mena nestačí, musí sa overiť obsah.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const r of readFileSync(resolve(__dirname, '../../.env'), 'utf8').split(/\r?\n/)) {
  const m = r.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const STRAPI = (args.strapiUrl ?? 'http://188.245.47.29').replace(/\/$/, '');
const APPLY = !!args.apply;
const HLAVA = { Authorization: `Bearer ${process.env.STRAPI_TOKEN}` };

const ZLE = ['Bez+názvu+5.jpg', 'Bez+názvu+6.jpg', 'Bez+názvu+7.jpg', 'Bez+názvu+8.jpg'];
const nfc = (s) => (s || '').normalize('NFC');

const ex = JSON.parse(readFileSync(resolve(__dirname, 'out/majcichov.intermediate.json'), 'utf8')).blogPost;
const dotaz = '/api/blog-posts?filters[slug][$eq]=majcichov&populate[gallery][fields][0]=name';
const zivy = (await fetch(STRAPI + dotaz, { headers: HLAVA }).then((r) => r.json())).data[0];
console.log('galéria teraz:', zivy.gallery.map((g) => `${g.id}:${g.name}`).join(', '));

const nahradene = new Map();
for (const meno of ZLE) {
  const g = ex.gallery.find((x) => nfc(decodeURIComponent(decodeURIComponent(x.filename))) === nfc(meno));
  if (!g) { console.error('[chyba] v extrakte nie je', meno); process.exit(1); }
  if (!APPLY) { console.log('  nahral by som nanovo:', meno); continue; }
  let buf = null, typ = 'image/jpeg';
  for (const u of [g.sourceUrl, g.fallbackUrl]) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(90000) }); if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); typ = r.headers.get('content-type') || typ; break; } } catch {}
  }
  if (!buf) { console.error('[chyba] nedá sa stiahnuť', meno); process.exit(1); }
  /* Vlastné meno, aby sa tá kolízia nezopakovala pri ďalšom článku. */
  const noveMeno = meno.replace(/\.jpg$/i, '-majcichov.jpg');
  const fd = new FormData();
  fd.append('files', new Blob([buf], { type: typ }), noveMeno);
  fd.append('fileInfo', JSON.stringify({ name: noveMeno, alternativeText: 'Majcichov' }));
  const r = await fetch(`${STRAPI}/api/upload`, { method: 'POST', headers: { ...HLAVA, Connection: 'close' }, body: fd, signal: AbortSignal.timeout(180000) });
  const t = await r.text();
  if (!r.ok) { console.error(`[chyba] upload ${noveMeno} → ${r.status}: ${t.slice(0, 300)}`); process.exit(1); }
  const id = (JSON.parse(t)[0] ?? JSON.parse(t)).id;
  nahradene.set(nfc(meno), id);
  console.log(`  + ${noveMeno} → id ${id} (${(buf.length / 1024).toFixed(0)} kB)`);
}

if (!APPLY) { console.log('Nasucho — nič sa nezapísalo.'); process.exit(0); }

const stare = new Map([[3698, 'Bez+názvu+5.jpg'], [3694, 'Bez+názvu+6.jpg'], [3696, 'Bez+názvu+7.jpg'], [3690, 'Bez+názvu+8.jpg']]);
const novaGaleria = zivy.gallery.map((g) => (stare.has(g.id) ? nahradene.get(nfc(stare.get(g.id))) : g.id));
const r = await fetch(`${STRAPI}/api/blog-posts/${zivy.documentId}`, {
  method: 'PUT', headers: { ...HLAVA, 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { gallery: novaGaleria } }), signal: AbortSignal.timeout(180000),
});
if (!r.ok) { console.error('[chyba] PUT →', r.status, (await r.text()).slice(0, 400)); process.exit(1); }
const po = (await fetch(STRAPI + dotaz, { headers: HLAVA }).then((x) => x.json())).data[0];
console.log('[ok] galéria po oprave:', po.gallery.length, 'položiek');
console.log(po.gallery.map((g) => `${g.id}:${g.name}`).join(', '));

#!/usr/bin/env node
/**
 * galeria-davka.mjs — dopĺňanie `alternativeText` k fotkám v galériách.
 *
 * Fotiek sú tisíce, preto sa nepozerajú po jednej: skript zloží z dávky
 * **kontaktný hárok** (mriežka očíslovaných zmenšenín) a ten sa pozrie naraz.
 * Text píše človek (alebo model) podľa toho, čo na fotkách naozaj je.
 *
 * `caption` (popis, ktorý vidí čitateľ) sa NEDOPĹŇA. Popis vie iba autor —
 * kde presne to je, kto je na fotke, kedy. Vymýšľať sa nedá.
 *
 *   node scripts/opravy/galeria-davka.mjs priprav --pocet=16
 *   node scripts/opravy/galeria-davka.mjs zapis
 *   node scripts/opravy/galeria-davka.mjs stav
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const BASE = 'https://webdesignforhradiskask.vercel.app/strapi';
const TOKEN = process.env.STRAPI_TOKEN;
const DAVKA = resolve(__dirname, '_galeria');
const arg = (m, d = null) => (process.argv.find((a) => a.startsWith(m))?.slice(m.length)) ?? d;
const hlavicky = { Authorization: `Bearer ${TOKEN}` };

/* Kategórie, kde fotky nesú najväčšiu váhu, idú prvé. */
const PORADIE = ['Strážna a hospodárska funkcia', 'Mocenské centrá', 'Staroveké sídla', 'Refugiá',
  'Kniežacie sídla', 'Svätyne a sakrálne objekty', 'Všeobecne o hradiskách', 'Informačné tabule',
  'Odborné texty', 'Listiny a písomné zdroje', 'Povesti', '3D modely', 'Aktuality'];

async function get(cesta) {
  const r = await fetch(BASE + cesta, { headers: hlavicky });
  if (!r.ok) throw new Error(`GET ${cesta} → ${r.status}`);
  return r.json();
}

/** Fotky v galériách článkov, ktoré nemajú `alternativeText`. */
async function fotkyBezAltu() {
  const von = [];
  const videne = new Set();
  for (let page = 1; ; page++) {
    const j = await get(`/api/blog-posts?fields[0]=slug&fields[1]=title` +
      `&populate[category][fields][0]=name&populate[location][fields][0]=name` +
      `&populate[gallery][fields][0]=url&populate[gallery][fields][1]=formats` +
      `&populate[gallery][fields][2]=alternativeText&populate[gallery][fields][3]=name` +
      `&populate[blocks][on][content.image-gallery][populate][images][fields][0]=url` +
      `&populate[blocks][on][content.image-gallery][populate][images][fields][1]=formats` +
      `&populate[blocks][on][content.image-gallery][populate][images][fields][2]=alternativeText` +
      `&populate[blocks][on][content.image-gallery][populate][images][fields][3]=name` +
      `&pagination[page]=${page}&pagination[pageSize]=25&sort=slug:asc`);
    for (const a of j.data) {
      const zdroje = [...(a.gallery || []),
        ...(a.blocks || []).flatMap((b) => b.images || [])];
      for (const f of zdroje) {
        if (!f || videne.has(f.id)) continue;
        videne.add(f.id);
        if (String(f.alternativeText || '').trim()) continue;
        von.push({
          id: f.id, slug: a.slug, titul: a.title,
          kategoria: a.category?.name || '—', lokalita: a.location?.name || null,
          subor: f.name,
          url: (f.formats?.small || f.formats?.medium || f.formats?.thumbnail || f).url,
        });
      }
    }
    if (page >= j.meta.pagination.pageCount) break;
  }
  /* Zoradené podľa váhy kategórie a potom po článkoch — fotky z jedného
     článku tak sedia na jednom hárku a dajú sa opísať v súvislostiach. */
  von.sort((a, b) => {
    const pa = PORADIE.indexOf(a.kategoria), pb = PORADIE.indexOf(b.kategoria);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.slug.localeCompare(b.slug) || a.id - b.id;
  });
  return von;
}

async function priprav() {
  const pocet = Number(arg('--pocet=', '16'));
  const vsetky = await fotkyBezAltu();
  const davka = vsetky.slice(0, pocet);
  mkdirSync(DAVKA, { recursive: true });
  for (const f of readdirSync(DAVKA)) if (/\.(png|jpe?g|webp|gif|bmp|tif|jfif)$/i.test(f)) unlinkSync(resolve(DAVKA, f));

  const subory = [];
  for (const p of davka) {
    const cesta = resolve(DAVKA, `${p.id}.obr`);
    const r = await fetch(BASE + p.url);
    writeFileSync(cesta, Buffer.from(await r.arrayBuffer()));
    subory.push(cesta);
  }
  writeFileSync(resolve(DAVKA, 'davka.json'), JSON.stringify(davka, null, 1));

  /* Kontaktný hárok poskladá Python (Pillow) — jeden obrázok namiesto 16. */
  execFileSync('python', [resolve(__dirname, 'harok.py'), DAVKA], { stdio: 'inherit' });

  console.log(`\nbez altu spolu: ${vsetky.length} · v dávke: ${davka.length}`);
  davka.forEach((p, i) => console.log(`${i + 1}\t${p.id}\t${p.kategoria}\t${p.slug}\t${p.subor}`));
}

async function zapis() {
  const mapa = JSON.parse(readFileSync(arg('--subor=', resolve(DAVKA, 'alty.json')), 'utf8'));
  let ok = 0, chyb = 0;
  for (const [id, alt] of Object.entries(mapa)) {
    const pred = await get(`/api/upload/files/${id}`);
    const fd = new FormData();
    fd.append('fileInfo', JSON.stringify({ alternativeText: alt, caption: pred.caption ?? null, name: pred.name }));
    const r = await fetch(`${BASE}/api/upload?id=${id}`, { method: 'POST', headers: hlavicky, body: fd });
    if (!r.ok) { console.error(`  !! ${id}: ${r.status}`); chyb++; continue; }
    const po = await get(`/api/upload/files/${id}`);
    if (po.alternativeText === alt && (po.caption ?? null) === (pred.caption ?? null)) ok++;
    else { console.error(`  !! ${id}: nesedí po zápise`); chyb++; }
  }
  console.log(`zapísaných ${ok}, chýb ${chyb}`);
}

async function stav() {
  const v = await fotkyBezAltu();
  const podlaKat = {};
  for (const f of v) podlaKat[f.kategoria] = (podlaKat[f.kategoria] || 0) + 1;
  console.log(`fotiek bez altu: ${v.length}`);
  Object.entries(podlaKat).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${k.padEnd(34)} ${n}`));
}

const prikazy = { priprav, zapis, stav };
if (!prikazy[process.argv[2]]) { console.error('použitie: galeria-davka.mjs priprav|zapis|stav'); process.exit(1); }
prikazy[process.argv[2]]().catch((e) => { console.error(e); process.exit(1); });

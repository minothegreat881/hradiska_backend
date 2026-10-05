#!/usr/bin/env node
/**
 * prepis-stare-odkazy.mjs — odkazy na starý blog prepíše na nový web.
 *
 * V telách článkov ostali po migrácii odkazy na Blogger: `hradiska.sk/2011/08/…`,
 * štítkové stránky `/search/label/…` a pôvodnú adresu `slovanske-hradiska.blogspot.com`.
 * Kým doména ukazuje na Blogger, fungujú. V deň, keď sa prepne na nový web,
 * by z nich boli slepé odkazy vo vnútri článkov — a presmerovania na hostingu
 * ich síce zachytia, ale čitateľ aj vyhľadávač by zbytočne skákali cez medzikrok.
 *
 * Mapa cieľov je v `mapa-odkazov.json` (zostavená z migračných medzivýstupov,
 * kde si každý článok pamätá svoju pôvodnú Blogger adresu).
 *
 * BEZPEČNOSŤ: mení LEN textové polia blokov. Všetko ostatné — obrázky, galéria,
 * titulná fotka, kategória, štítky, lokalita — sa berie zo živého článku
 * nezmenené a po zápise sa overí, že sa nepohlo.
 *
 * Použitie:
 *   node scripts/opravy/prepis-stare-odkazy.mjs                 # nasucho, nič nezapíše
 *   node scripts/opravy/prepis-stare-odkazy.mjs --zapis         # zapíše
 *   node scripts/opravy/prepis-stare-odkazy.mjs --zapis --len=slug-clanku
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const arg = (m) => process.argv.slice(2).find((a) => a.startsWith(m));
const ZAPIS = process.argv.includes('--zapis');
const LEN = arg('--len=')?.slice('--len='.length) || null;
const BASE = (arg('--api=')?.slice('--api='.length) || 'https://webdesignforhradiskask.vercel.app/strapi').replace(/\/$/, '');
const TOKEN = process.env.STRAPI_TOKEN;
if (!TOKEN) { console.error('Chýba STRAPI_TOKEN v .env'); process.exit(1); }

const MAPA = JSON.parse(readFileSync(resolve(__dirname, 'mapa-odkazov.json'), 'utf8'));

/* Komponenty dynamickej zóny a ich textové polia. Čo tu nie je, sa nikdy
   nemení — menej polí je tu bezpečnejšie než viac. */
const TEXTOVE_POLIA = {
  'content.rich-text': ['body'],
  'content.quote-block': ['text', 'author', 'source'],
  'content.poem': ['text', 'title', 'author', 'source'],
  'content.sources': ['title', 'intro'],
  'content.image-block': ['alt', 'caption'],
  'content.embed': ['caption'],
  'content.image-gallery': [],
};

const DOMENA = String.raw`https?:\/\/(?:www\.)?(?:hradiska\.sk|slovanske-hradiska\.blogspot\.(?:com|sk))`;

/**
 * Hodnota akéhokoľvek tvaru: vráti [nováHodnota, zoznamZmien].
 *
 * Bohatý text je v Strapi **pole uzlov**, nie HTML reťazec — adresa odkazu sedí
 * v `url` vnútri uzla `link`. Preto sa chodí po celej štruktúre a prepísuje sa
 * každý reťazec; `items` v Zdrojoch sa tým vybaví rovnako.
 */
export function prepisHlboko(hodnota, vlastny = null) {
  if (typeof hodnota === 'string') return prepis(hodnota, vlastny);
  if (Array.isArray(hodnota)) {
    const zmeny = [];
    const von = hodnota.map((x) => { const [n, z] = prepisHlboko(x, vlastny); zmeny.push(...z); return n; });
    return [zmeny.length ? von : hodnota, zmeny];
  }
  if (hodnota && typeof hodnota === 'object') {
    const zmeny = [];
    const von = {};
    for (const [k, v] of Object.entries(hodnota)) { const [n, z] = prepisHlboko(v, vlastny); von[k] = n; zmeny.push(...z); }
    return [zmeny.length ? von : hodnota, zmeny];
  }
  return [hodnota, []];
}

/** Jeden textový reťazec: vráti [novýText, zoznamZmien]. */
export function prepis(text, vlastny = null) {
  if (typeof text !== 'string' || !text) return [text, []];
  const zmeny = [];
  let out = text;
  /* Odkaz, ktorý by po prepísaní mieril na vlastný článok, sa nechá tak —
     odkaz sám na seba je horší než starý odkaz, ktorý zachytí presmerovanie. */
  const naSeba = (c) => vlastny && c === `/blog/${vlastny}`;

  // 1 · článok: /RRRR/MM/nazov.html (+ ?dotaz, #kotva)
  out = out.replace(
    new RegExp(`${DOMENA}(\\/\\d{4}\\/\\d{2}\\/[^"'\\s<>)]+?\\.html)(?:\\?[^"'\\s<>)]*)?(?:#[^"'\\s<>)]*)?`, 'gi'),
    (cele, cesta) => {
      const ciel = MAPA.clanky[cesta];
      if (!ciel || naSeba(ciel)) return cele;
      zmeny.push([cele, ciel]);
      return ciel;
    }
  );

  // 2 · štítková stránka starého blogu
  out = out.replace(
    new RegExp(`${DOMENA}\\/search\\/label\\/([^"'\\s<>)]+)`, 'gi'),
    (cele, meno) => {
      let kluc;
      try { kluc = decodeURIComponent(meno.replace(/\+/g, ' ')); } catch { kluc = meno; }
      const ciel = MAPA.stitky[kluc];
      if (!ciel || naSeba(ciel)) return cele;
      zmeny.push([cele, ciel]);
      return ciel;
    }
  );

  // 2b · adresa dolámaná už pri migrácii: `/…/nazov.html` namiesto `/RRRR/MM/nazov.html`
  out = out.replace(
    new RegExp(`${DOMENA}\\/[^"'\\s<>)]*\\u2026\\/([^"'\\s<>)]+?\\.html)`, 'gi'),
    (cele, subor) => {
      const kluc = Object.keys(MAPA.clanky).find((k) => k.endsWith('/' + subor));
      const ciel = kluc && MAPA.clanky[kluc];
      if (!ciel || naSeba(ciel)) return cele;
      zmeny.push([cele, ciel]);
      return ciel;
    }
  );

  // 3 · hľadanie na starom blogu → hľadanie na novom webe
  out = out.replace(
    new RegExp(`${DOMENA}\\/search\\?q=([^"'\\s<>)]*)`, 'gi'),
    (cele, dotaz) => { const c = `/hladat?q=${dotaz}`; zmeny.push([cele, c]); return c; }
  );

  // 4 · holá titulka starého blogu (aj keď je ňou celé pole, bez znaku za ňou)
  out = out.replace(
    new RegExp(`${DOMENA}\\/?(?=["'\\s<>)]|$)`, 'gi'),
    (cele) => { zmeny.push([cele, '/']); return '/'; }
  );

  return [out, zmeny];
}

/* ── Strapi ─────────────────────────────────────────────────────────────── */
const hlavicky = { Authorization: `Bearer ${TOKEN}` };

async function get(cesta) {
  const r = await fetch(BASE + cesta, { headers: hlavicky });
  if (!r.ok) throw new Error(`GET ${cesta} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function put(cesta, data) {
  const r = await fetch(BASE + cesta, {
    method: 'PUT',
    headers: { ...hlavicky, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`PUT ${cesta} → ${r.status}: ${t.slice(0, 500)}`);
  return JSON.parse(t);
}

/** Médium (objekt z populate) → id, ako to chce zápis. */
const naId = (m) => (Array.isArray(m) ? m.map((x) => x?.id ?? x) : m && typeof m === 'object' ? (m.id ?? null) : (m ?? null));

/** Živý blok → tvar na zápis, s prípadne prepísaným textom. */
function naZapis(blok, prepisane) {
  /* `id` sa do dynamickej zóny posielať nedá — Strapi 5 ho odmietne
     („Invalid key id"). Komponenty sa prepíšu nanovo, čo je v poriadku:
     posielame celé pole blokov v rovnakom poradí a s rovnakým obsahom. */
  const von = { __component: blok.__component };
  for (const [k, v] of Object.entries(blok)) {
    if (['__component', 'id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale'].includes(k)) continue;
    if (k === 'image' || k === 'images' || k === 'secondImage') { von[k] = naId(v); continue; }
    von[k] = Object.prototype.hasOwnProperty.call(prepisane, k) ? prepisane[k] : v;
  }
  return von;
}

const DOTAZ_POPULATE = [
  'populate[blocks][on][content.rich-text]=true',
  'populate[blocks][on][content.quote-block]=true',
  'populate[blocks][on][content.poem]=true',
  'populate[blocks][on][content.sources]=true',
  'populate[blocks][on][content.embed]=true',
  'populate[blocks][on][content.image-block][populate]=image',
  'populate[blocks][on][content.image-gallery][populate]=images',
  'populate[coverImage][fields][0]=id',
  'populate[gallery][fields][0]=id',
].join('&');

async function main() {
  console.log(`\n=== PREPIS STARÝCH ODKAZOV — ${ZAPIS ? 'ZÁPIS' : 'NASUCHO'} ===`);
  console.log(`API: ${BASE}\n`);

  // 1 · zoznam článkov
  const slugy = [];
  for (let page = 1; ; page++) {
    const j = await get(`/api/blog-posts?fields[0]=slug&status=draft&pagination[page]=${page}&pagination[pageSize]=100&sort=slug:asc`);
    j.data.forEach((d) => slugy.push({ slug: d.slug, documentId: d.documentId }));
    if (page >= j.meta.pagination.pageCount) break;
  }
  const vyber = LEN ? slugy.filter((s) => s.slug === LEN) : slugy;
  console.log(`článkov na kontrolu: ${vyber.length}\n`);

  let dotknutych = 0, zmienSpolu = 0, zapisanych = 0, zlyhani = 0;

  for (const { slug, documentId } of vyber) {
    const j = await get(`/api/blog-posts/${documentId}?status=draft&${DOTAZ_POPULATE}`);
    const a = j.data;
    const bloky = a.blocks || [];

    const noveBloky = [];
    const zmenyClanku = [];
    for (const b of bloky) {
      const polia = TEXTOVE_POLIA[b.__component] ?? [];
      const prepisane = {};
      for (const p of polia) {
        const [novy, zm] = prepisHlboko(b[p], slug);
        if (zm.length) { prepisane[p] = novy; zmenyClanku.push(...zm); }
      }
      /* `items` v bloku Zdroje je pole objektov {text, url} — odkazy môžu byť aj tam. */
      if (b.__component === 'content.sources' && Array.isArray(b.items)) {
        const items = b.items.map((it) => {
          const [t, z1] = prepisHlboko(it.text, slug);
          const [u, z2] = prepisHlboko(it.url, slug);
          if (z1.length || z2.length) { zmenyClanku.push(...z1, ...z2); return { ...it, text: t, url: u }; }
          return it;
        });
        if (zmenyClanku.length) prepisane.items = items;
      }
      noveBloky.push(naZapis(b, prepisane));
    }

    if (!zmenyClanku.length) continue;
    dotknutych++; zmienSpolu += zmenyClanku.length;
    console.log(`• ${slug} — ${zmenyClanku.length} odkazov`);
    for (const [z, na] of zmenyClanku) console.log(`    ${z}\n      → ${na}`);

    if (!ZAPIS) continue;

    const predGaleria = (a.gallery || []).length;
    const predCover = a.coverImage?.id ?? null;
    try {
      await put(`/api/blog-posts/${documentId}`, { blocks: noveBloky });
      const po = await get(`/api/blog-posts/${documentId}?status=draft&${DOTAZ_POPULATE}`);
      const poGaleria = (po.data.gallery || []).length;
      const poCover = po.data.coverImage?.id ?? null;
      const zostalo = JSON.stringify(po.data.blocks || []).match(new RegExp(DOMENA, 'gi'))?.length ?? 0;
      if (poGaleria !== predGaleria || poCover !== predCover) {
        console.error(`    !! ${slug}: galéria ${predGaleria}→${poGaleria}, cover ${predCover}→${poCover}`);
        zlyhani++;
      } else {
        console.log(`    ✓ zapísané (galéria ${poGaleria} aj cover sedia, zvyšných starých odkazov: ${zostalo})`);
        zapisanych++;
      }
    } catch (e) {
      console.error(`    !! ${slug}: ${e.message}`);
      zlyhani++;
    }
  }

  console.log(`\nSÚHRN: dotknutých článkov ${dotknutych}, odkazov ${zmienSpolu}` +
    (ZAPIS ? `, zapísaných ${zapisanych}, zlyhaní ${zlyhani}` : ' (nasucho — nič sa nezapísalo)'));
}

main().catch((e) => { console.error(e); process.exit(1); });

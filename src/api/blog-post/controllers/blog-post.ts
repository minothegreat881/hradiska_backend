import { factories } from '@strapi/strapi';

/**
 * Vyhľadávací index pre fulltext na frontende.
 *
 * Prečo takto: telo článku žije v `blocks` (dynamiczone, Strapi Blocks JSON).
 * Bežné REST filtre (`$containsi`) doň nevidia, SQLite LIKE nevie diakritiku ani
 * skloňovanie. Preto server raz vyextrahuje čistý text z každého článku a pošle
 * kompaktný index; samotné hľadanie (fuzzy, ranking, diakritika) beží na klientovi
 * (MiniSearch). Index je cachovaný v pamäti a invaliduje sa cez lifecycle pri
 * zmene článku (viď content-types/blog-post/lifecycles.ts).
 */

// Polia, z ktorých sa zbiera hľadateľný text (okrem Blocks JSON text-nodov).
const TEXT_KEYS = new Set([
  'title', 'excerpt', 'text', 'author', 'source', 'caption',
  'intro', 'label', 'value', 'year', 'description', 'name',
  'region', 'country', 'authorName',
]);

/** Rekurzívne pozbiera text z ľubovoľného uzla (Blocks JSON aj komponenty). */
function collectText(node: any, out: string[]): void {
  if (node == null) return;
  if (Array.isArray(node)) { for (const n of node) collectText(n, out); return; }
  if (typeof node !== 'object') return;

  // Strapi Blocks JSON: textový uzol má { text } a/alebo { children }.
  if (typeof node.text === 'string') out.push(node.text);
  if (Array.isArray(node.children)) for (const c of node.children) collectText(c, out);

  for (const [k, v] of Object.entries(node)) {
    if (k === 'text' || k === 'children') continue; // už spracované vyššie
    if (typeof v === 'string') {
      if (TEXT_KEYS.has(k)) out.push(v);
    } else if (v && typeof v === 'object') {
      collectText(v, out); // blocks body, komponenty, relácie (tags/category/location)
    }
  }
}

/** URL malého náhľadu obálky (relatívna – frontend si predradí STRAPI_URL). */
function coverUrl(cover: any): string | null {
  if (!cover) return null;
  return cover.formats?.small?.url || cover.formats?.thumbnail?.url || cover.url || null;
}

/**
 * Obálka pre sociálne náhľady (`og:image`).
 *
 * Náhľad vyššie je 500 px široký — v zozname je to správne, ale do hlavičky
 * stránky patrí čo najväčší obrázok: Facebook aj LinkedIn chcú aspoň 1200 px
 * a menší zmenšia na kartu veľkosti poštovej známky. Preto originál... pokiaľ
 * nie je neúmerne ťažký (`size` je v kB): nad ~4 MB by sa scraperom nestiahol,
 * tam sa radšej použije zmenšenina `large`.
 */
function coverOgUrl(cover: any): string | null {
  if (!cover) return null;
  const f = cover.formats || {};
  if ((cover.size ?? 0) <= 4000) return cover.url || f.large?.url || null;
  return f.large?.url || f.medium?.url || cover.url || null;
}

interface IndexEntry {
  slug: string;
  title: string;
  excerpt: string;
  categoryName: string;
  categorySlug: string;
  tags: string[];
  cover: string | null;
  coverOg: string | null; // tá istá obálka v plnej veľkosti — do `og:image`
  place: string | null;   // názov lokality (ak má article location)
  hasLocation: boolean;   // pre delenie roletky Lokality vs Články
  metaTitle: string;      // SEO titulok (pre prerender hlavičky)
  metaDescription: string;
  author: string;
  date: string | null;    // originalPublishedDate || publishedAt
  lat: number | null;     // súradnice lokality → JSON-LD Place
  lng: number | null;
  text: string;           // plný čistý text tela + metadát
}

/* Cache indexu v pamäti — pre KAŽDÝ jazyk vlastná tabuľka. Anglická stránka
   musí hľadať a odporúčať v anglických článkoch, nie v slovenských; preto je
   index per jazyk a `?locale=` hovorí, ktorý sa vráti. Prázdny záznam =
   treba prestaviť (maže lifecycle pri každej zmene článku). */
type IndexCache = { builtAt: number; version: string; entries: IndexEntry[] };
const CACHE: Record<string, IndexCache> = {};
const JAZYKY = ['sk', 'en'] as const;

// Počty článkov podľa kategórie — to isté, len oddelene, nech sa nemusí
// stavať celý index kvôli číslam v hlavičke a na dlaždiciach.
let POCTY: Record<string, number> | null = null;

export default factories.createCoreController('api::blog-post.blog-post', ({ strapi }) => ({
  /** GET /api/blog-posts/search-index — kompaktný index pre klientske hľadanie. */
  async searchIndex(ctx) {
    /* Jazyk z dopytu. Neznámy jazyk nehádžeme ako chybu — index je verejný
       a stránke stačí, že dostane slovenský (pôvodný) obsah. */
    const ziadany = String(ctx.query?.locale || 'sk');
    const jazyk = (JAZYKY as readonly string[]).includes(ziadany) ? ziadany : 'sk';

    if (!CACHE[jazyk]) {
      const entries: IndexEntry[] = [];
      const limit = 50;
      // Document service stránkuje cez start/limit (NIE page/pageSize — to ticho
      // ignoruje a vracia stále to isté → nekonečná slučka a OOM). Poistka na
      // max iterácie, keby sa podmienka konca niekedy pošmykla.
      for (let start = 0, guard = 0; guard < 200; start += limit, guard++) {
        const batch = await strapi.documents('api::blog-post.blog-post').findMany({
          locale: jazyk,
          fields: ['title', 'slug', 'excerpt', 'metaTitle', 'metaDescription', 'authorName', 'originalPublishedDate', 'publishedAt'],
          populate: {
            blocks: true,
            quotes: true,
            keyFacts: true,
            timeline: true,
            location: true,
            category: { fields: ['name', 'slug'] } as any,
            tags: { fields: ['name'] } as any,
            coverImage: { fields: ['url', 'formats', 'size'] } as any,
          } as any,
          sort: 'publishedAt:desc',
          /* LEN PUBLIKOVANÉ. Bez toho sa do verejného indexu dostal aj koncept —
             rozpísaný článok sa dá nájsť hľadaním a prerender mu vyrobí vlastnú
             stránku s hlavičkou (našlo sa takto testovacie „dsadsad"). */
          status: 'published',
          start,
          limit,
        } as any);
        if (!batch.length) break;
        for (const p of batch as any[]) {
          const parts: string[] = [];
          collectText(p.title, parts);
          collectText(p.excerpt, parts);
          collectText(p.blocks, parts);
          collectText(p.quotes, parts);
          collectText(p.keyFacts, parts);
          collectText(p.timeline, parts);
          collectText(p.location, parts);
          collectText(p.tags, parts);
          collectText(p.category, parts);
          const text = parts.join(' ').replace(/\s+/g, ' ').trim();
          entries.push({
            slug: p.slug,
            title: p.title || '',
            excerpt: p.excerpt || '',
            categoryName: p.category?.name || '',
            categorySlug: p.category?.slug || '',
            tags: (p.tags || []).map((t: any) => t.name).filter(Boolean),
            cover: coverUrl(p.coverImage),
            coverOg: coverOgUrl(p.coverImage),
            place: p.location?.name || null,
            hasLocation: !!p.location?.name,
            metaTitle: p.metaTitle || '',
            metaDescription: p.metaDescription || '',
            author: p.authorName || 'Hradiská',
            date: p.originalPublishedDate || p.publishedAt || null,
            lat: p.location?.latitude ?? null,
            lng: p.location?.longitude ?? null,
            text,
          });
        }
        if (batch.length < limit) break;
      }
      CACHE[jazyk] = { builtAt: Date.now(), version: String(Date.now()), entries };
    }

    const index = CACHE[jazyk];

    ctx.set('Cache-Control', 'public, max-age=300');
    ctx.set('X-Index-Version', index.version);
    ctx.set('X-Index-Locale', jazyk);
    /* Dve rôzne odpovede na tej istej adrese — bez tohto by ich sprostredkujúca
       cache (prehliadač, nginx) poplietla a anglická stránka by dostala
       slovenský index. */
    ctx.set('Vary', 'Accept-Encoding');

    /* `?bezTextu=1` — tá istá tabuľka bez plných znení článkov.
       Mapa z indexu potrebuje len súradnice, názov a náhľad, ale sťahovala
       celý index: 3,39 MB pred kompresiou, z toho 2,77 MB je pole `text`
       (namerané na 365 článkoch). Po vynechaní textu ostáva ~0,6 MB pred
       kompresiou a ~40 kB po nej. Hľadanie na webe volá endpoint ďalej bez
       parametra a dostane plný index. */
    if (ctx.query?.bezTextu === '1' || ctx.query?.bezTextu === 'true') {
      // `excerpt` a `cover` ostávajú — mapa ich ukazuje v karte lokality.
      const bezTextu = index.entries.map(({ text, metaTitle, metaDescription, coverOg, ...zvysok }) => zvysok);
      return { version: index.version, locale: jazyk, count: bezTextu.length, items: bezTextu };
    }

    return { version: index.version, locale: jazyk, count: index.entries.length, items: index.entries };
  },

  /**
   * GET /api/pocty-kategorii — počet publikovaných článkov v každej kategórii.
   *
   * Hlavička aj dlaždice na domovskej si predtým pýtali počet zvlášť pre každú
   * kategóriu: 24 samostatných ciest na server pri každom načítaní stránky
   * (namerané). Bajtov to bolo málo, ale 24 spiatočných ciest je na pomalom
   * pripojení citeľných. Tu je to jedna odpoveď, navyše z pamäte.
   */
  async poctyKategorii(ctx) {
    if (!POCTY) {
      const kategorie = await strapi.documents('api::blog-category.blog-category').findMany({
        fields: ['slug'],
        start: 0,
        limit: 200,
      } as any);
      const vysledok: Record<string, number> = {};
      for (const k of kategorie as any[]) {
        vysledok[k.slug] = await strapi.documents('api::blog-post.blog-post').count({
          filters: { category: { slug: k.slug } },
        } as any);
      }
      POCTY = vysledok;
    }
    ctx.set('Cache-Control', 'public, max-age=300');
    return { pocty: POCTY };
  },
}));

/** Zneplatní cache indexu aj počtov. Volá lifecycle pri zmene článku. */
export function invalidateSearchIndex(): void {
  for (const j of Object.keys(CACHE)) delete CACHE[j];
  POCTY = null;
}

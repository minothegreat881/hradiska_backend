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

interface IndexEntry {
  slug: string;
  title: string;
  excerpt: string;
  categoryName: string;
  categorySlug: string;
  tags: string[];
  cover: string | null;
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

// Cache indexu v pamäti. `null` = treba prestaviť (nastavuje lifecycle).
let CACHE: { builtAt: number; version: string; entries: IndexEntry[] } | null = null;

export default factories.createCoreController('api::blog-post.blog-post', ({ strapi }) => ({
  /** GET /api/blog-posts/search-index — kompaktný index pre klientske hľadanie. */
  async searchIndex(ctx) {
    if (!CACHE) {
      const entries: IndexEntry[] = [];
      const limit = 50;
      // Document service stránkuje cez start/limit (NIE page/pageSize — to ticho
      // ignoruje a vracia stále to isté → nekonečná slučka a OOM). Poistka na
      // max iterácie, keby sa podmienka konca niekedy pošmykla.
      for (let start = 0, guard = 0; guard < 200; start += limit, guard++) {
        const batch = await strapi.documents('api::blog-post.blog-post').findMany({
          fields: ['title', 'slug', 'excerpt', 'metaTitle', 'metaDescription', 'authorName', 'originalPublishedDate', 'publishedAt'],
          populate: {
            blocks: true,
            quotes: true,
            keyFacts: true,
            timeline: true,
            location: true,
            category: { fields: ['name', 'slug'] } as any,
            tags: { fields: ['name'] } as any,
            coverImage: { fields: ['url', 'formats'] } as any,
          } as any,
          sort: 'publishedAt:desc',
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
      CACHE = { builtAt: Date.now(), version: String(Date.now()), entries };
    }

    ctx.set('Cache-Control', 'public, max-age=300');
    ctx.set('X-Index-Version', CACHE.version);
    return { version: CACHE.version, count: CACHE.entries.length, items: CACHE.entries };
  },
}));

/** Zneplatní cache indexu. Volá lifecycle pri zmene článku. */
export function invalidateSearchIndex(): void {
  CACHE = null;
}

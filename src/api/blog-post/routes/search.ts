/**
 * Custom route pre vyhľadávací index. Samostatný súbor, lebo Strapi 5
 * nemerguje custom routes do auto-generovaného core routera (blog-post.ts).
 *
 * Cesta je top-level `/search-index`, nie `/blog-posts/search-index` — inak by
 * ju mohol zachytiť core `/blog-posts/:id` (findOne s id='search-index').
 * Verejné (auth:false) — index je len publikovaný obsah, žiadne súkromné dáta.
 */
export default {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/search-index',
      handler: 'blog-post.searchIndex',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};

/**
 * Router pre blog-comment.
 * Definuje default CRUD endpoints + custom POST /api/blog-comments/:id/like.
 *
 * Default `factories.createCoreRouter` neumožní jednoducho pridať vlastné routes
 * vedľa core routes (v Strapi 5 sa side-files nemerge-ujú automaticky), preto
 * tu vypisujeme všetky manuálne.
 */
export default {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/blog-comments',
      handler: 'blog-comment.find',
    },
    {
      // Custom: documentId vlastných komentárov k danému článku. MUSÍ byť pred
      // /:id, inak by to zachytil findOne s id='mine'. Slúži na označenie
      // „môj komentár" na frontende bez posielania tokenu na verejný GET
      // (ten by pri Member role padol na sanitizáciu filtra `post`).
      method: 'GET',
      path: '/blog-comments/mine',
      handler: 'blog-comment.mine',
    },
    {
      // Custom: VŠETKY vlastné komentáre (profil → „Moje komentáre"). Pred /:id.
      method: 'GET',
      path: '/blog-comments/mine-all',
      handler: 'blog-comment.mineAll',
    },
    {
      method: 'GET',
      path: '/blog-comments/:id',
      handler: 'blog-comment.findOne',
    },
    {
      method: 'POST',
      path: '/blog-comments',
      handler: 'blog-comment.create',
    },
    {
      method: 'PUT',
      path: '/blog-comments/:id',
      handler: 'blog-comment.update',
    },
    {
      method: 'DELETE',
      path: '/blog-comments/:id',
      handler: 'blog-comment.delete',
    },
    {
      // Custom: zvýši counter `likes` o 1. Verejné (žiadne auth).
      method: 'POST',
      path: '/blog-comments/:id/like',
      handler: 'blog-comment.like',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      // Custom: zníži counter `likes` o 1 (toggle protistrana k /like). Verejné.
      method: 'POST',
      path: '/blog-comments/:id/unlike',
      handler: 'blog-comment.unlike',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};

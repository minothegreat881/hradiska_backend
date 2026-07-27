/**
 * Router pre photo-comment (komentáre k fotkám v galérii).
 * Default CRUD + custom GET /photo-comments/mine-all (profil → Moje komentáre).
 * V Strapi 5 sa side-files nemerge-ujú, preto všetky routes manuálne.
 */
export default {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/photo-comments',
      handler: 'photo-comment.find',
    },
    {
      // Custom: VŠETKY vlastné foto-komentáre (profil → „Moje komentáre").
      // MUSÍ byť pred /:id, inak by to zachytil findOne s id='mine-all'.
      method: 'GET',
      path: '/photo-comments/mine-all',
      handler: 'photo-comment.mineAll',
    },
    {
      method: 'GET',
      path: '/photo-comments/:id',
      handler: 'photo-comment.findOne',
    },
    {
      method: 'POST',
      path: '/photo-comments',
      handler: 'photo-comment.create',
    },
    {
      method: 'PUT',
      path: '/photo-comments/:id',
      handler: 'photo-comment.update',
    },
    {
      method: 'DELETE',
      path: '/photo-comments/:id',
      handler: 'photo-comment.delete',
    },
  ],
};

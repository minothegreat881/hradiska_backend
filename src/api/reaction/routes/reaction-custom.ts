/**
 * Custom route vedľa core routera. Cesta má dva segmenty (`/mine/posts`), takže
 * nekoliduje s core `/reactions/:id`. Vyžaduje prihláseného člena (kontrola v controlleri).
 */
export default {
  routes: [
    { method: 'GET', path: '/reactions/mine/posts', handler: 'reaction.minePosts', config: { policies: [] } },
  ],
};

/**
 * Kontrola aktualizácií mobilnej aplikácie.
 *
 * Nemá vlastný typ obsahu — je to len jeden endpoint, ktorý prečíta popis
 * vydaného balíka zo `public/app/aktualizacia.json`. Preto v tomto priečinku
 * nie je `content-types`.
 *
 * Metóda je POST, lebo tak sa pýta plugin v aplikácii (posiela o sebe údaje:
 * verziu balíka, verziu appky, systém). `auth: false` — appka nie je
 * prihlásená a odpoveď neobsahuje nič súkromné, len adresu balíka.
 */
export default {
  type: 'content-api',
  routes: [
    {
      method: 'POST',
      path: '/aktualizacia',
      handler: 'aktualizacia.skontroluj',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      // To isté na pozretie v prehliadači — čo je práve vydané.
      method: 'GET',
      path: '/aktualizacia',
      handler: 'aktualizacia.vydane',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};

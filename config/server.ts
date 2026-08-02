export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // Za reverse-proxy (Vercel → nginx → Strapi) musí Koa čítať IP klienta
  // z X-Forwarded-For. Bez toho je `ctx.request.ip` VŽDY adresa proxy, takže
  // rate limiting na prihlasovanie/reset hesla ráta všetkých návštevníkov ako
  // jedného — pár pokusov ktoréhokoľvek človeka vyčerpá limit celému webu
  // a ostatní dostanú 429. (Presne to sa 2026-08-02 aj stalo.)
  proxy: { koa: true },
  // Verejná adresa servera — z nej sa stavajú absolútne odkazy (napr. potvrdzovací
  // e-mail pri registrácii). Bez nej Strapi použije HOST → odkaz na 127.0.0.1.
  url: env('PUBLIC_URL', 'http://localhost:1337'),
  app: {
    keys: env.array('APP_KEYS'),
  },
});

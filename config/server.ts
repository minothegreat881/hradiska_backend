export default ({ env }) => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // Verejná adresa servera — z nej sa stavajú absolútne odkazy (napr. potvrdzovací
  // e-mail pri registrácii). Bez nej Strapi použije HOST → odkaz na 127.0.0.1.
  url: env('PUBLIC_URL', 'http://localhost:1337'),
  app: {
    keys: env.array('APP_KEYS'),
  },
});

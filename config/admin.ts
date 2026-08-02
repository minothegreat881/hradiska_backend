export default ({ env }) => ({
  // Ignore changes in migration scripts dir — upload.mjs writes payload.json
  // and upload-log.json during runs which would otherwise trigger a Strapi
  // restart mid-upload and crash the worker (EBUSY on sharp temp files).
  // PERF (2026-07-20): `public/uploads` má 24 414 súborov. Watcher si na každý
  // držal handle (namerané 27 327 otvorených handle-ov) a trvalo zamestnával
  // event loop — Strapi žral 131 % jadra aj v úplnej nečinnosti a KAŽDÝ request
  // na statický súbor čakal v rade ~15 s do prvého bajtu (83 KB obrázok!).
  // Pre porovnanie: ten istý súbor z disku 0,39 ms, cez holý node server 16,8 ms.
  // Uploads sa nikdy nemenia zvonku, sledovať ich nemá zmysel.
  watchIgnoreFiles: [
    './scripts/**',
    '**/scripts/**',
    './public/uploads/**',
    '**/public/uploads/**',
    './.tmp/**',
    '**/.tmp/**',
  ],
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY'),
  },
  // Obnova hesla správcu Strapi panela (/admin → „Zabudnuté heslo?").
  // Strapi posiela ODKAZ na nastavenie hesla, nikdy samotné heslo — odkaz vedie
  // na `admin.absoluteUrl` + /auth/reset-password?code=…, čiže lokálne na
  // localhost:1337, na serveri na PUBLIC_URL. Bez tejto sekcie by šla anglická
  // predvolená šablóna Strapi; `from` inak spadne na EMAIL_FROM z plugins.ts.
  //
  // POZOR: adresa účtu musí byť skutočná schránka — inak odkaz nemá kam prísť.
  // Adresu si každý správca nastaví sám v paneli (vpravo hore → Profile → Email).
  forgotPassword: {
    from: env('EMAIL_FROM', 'milanhrabkovsky@gmail.com'),
    replyTo: env('EMAIL_REPLY_TO', 'milanhrabkovsky@gmail.com'),
    emailTemplate: {
      subject: 'Obnova hesla — správa Hradiska.sk',
      text: `Dobrý deň,

požiadali ste o obnovu hesla k správcovskému účtu Hradiska.sk.

Nové heslo si nastavíte na tomto odkaze:
<%= url %>

Ak ste o obnovu nežiadali, tento e-mail ignorujte — heslo zostáva nezmenené.

— OZ Hradiská`,
      html: `<p>Dobrý deň,</p>
<p>požiadali ste o obnovu hesla k <strong>správcovskému účtu</strong> Hradiska.sk.</p>
<p><a href="<%= url %>">Nastaviť nové heslo</a></p>
<p>Ak ste o obnovu nežiadali, tento e-mail ignorujte — heslo zostáva nezmenené.</p>
<p>— OZ Hradiská</p>`,
    },
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
  },
});

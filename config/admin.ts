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
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
  },
});

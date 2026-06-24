export default ({ env }) => ({
  // Ignore changes in migration scripts dir — upload.mjs writes payload.json
  // and upload-log.json during runs which would otherwise trigger a Strapi
  // restart mid-upload and crash the worker (EBUSY on sharp temp files).
  watchIgnoreFiles: [
    './scripts/**',
    '**/scripts/**',
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

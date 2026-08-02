export default {
  routes: [
    {
      // „Zabudli ste heslo?" — verejné (žiadateľ práve nie je prihlásený).
      // Rate-limit rieši global::authRateLimit (viď src/middlewares/authRateLimit.ts).
      method: 'POST',
      path: '/account/forgot-password',
      handler: 'account.forgotPassword',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      // Potvrdenie z e-mailu — otvára sa klikom v pošte, teda tiež bez tokenu.
      method: 'GET',
      path: '/account/reset-password',
      handler: 'account.resetPassword',
      config: { auth: false, policies: [], middlewares: [] },
    },
    {
      // Zoznam účtov pre admin obrazovku „Používatelia" — vrátane roly, ktorú
      // `/api/users` z výstupu zahadzuje. Staff-only (kontrola v controlleri).
      // Dva segmenty (`/account/users`), takže nekoliduje s `/account/me`.
      method: 'GET',
      path: '/account/users',
      handler: 'account.staffUsers',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/account/me',
      handler: 'account.getMe',
      config: { policies: [] },
    },
    {
      method: 'PUT',
      path: '/account/me',
      handler: 'account.updateMe',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/account/me',
      handler: 'account.deleteMe',
      config: { policies: [] },
    },
  ],
};

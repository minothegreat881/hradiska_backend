export default {
  routes: [
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

export default {
  routes: [
    {
      method: 'DELETE',
      path: '/account/me',
      handler: 'account.deleteMe',
      config: { policies: [] },
    },
  ],
};

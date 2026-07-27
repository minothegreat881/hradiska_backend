export default {
  routes: [
    { method: 'POST', path: '/shares', handler: 'share.create', config: { policies: [] } },
    { method: 'GET', path: '/shares/mine', handler: 'share.mine', config: { policies: [] } },
  ],
};

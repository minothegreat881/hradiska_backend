export default {
  routes: [
    { method: 'POST', path: '/moderation-warnings', handler: 'moderation-warning.create', config: { policies: [] } },
  ],
};

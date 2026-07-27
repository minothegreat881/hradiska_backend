export default {
  routes: [
    { method: 'GET', path: '/push/vapid-public-key', handler: 'push-subscription.vapidPublicKey', config: { auth: false, policies: [] } },
    { method: 'POST', path: '/push/subscribe', handler: 'push-subscription.subscribe', config: { policies: [] } },
    { method: 'POST', path: '/push/unsubscribe', handler: 'push-subscription.unsubscribe', config: { policies: [] } },
  ],
};

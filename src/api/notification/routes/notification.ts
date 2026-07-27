/**
 * Iba member-facing čítacie/označovacie endpointy. Žiadne verejné create/delete —
 * notifikácie vznikajú serverovo. Všetky vyžadujú prihláseného člena (kontrola v controlleri).
 */
export default {
  routes: [
    { method: 'GET', path: '/notifications/mine', handler: 'notification.mine', config: { policies: [] } },
    { method: 'GET', path: '/notifications/unread-count', handler: 'notification.unreadCount', config: { policies: [] } },
    { method: 'PUT', path: '/notifications/mark-all-read', handler: 'notification.markAllRead', config: { policies: [] } },
    { method: 'PUT', path: '/notifications/:id/read', handler: 'notification.markRead', config: { policies: [] } },
  ],
};

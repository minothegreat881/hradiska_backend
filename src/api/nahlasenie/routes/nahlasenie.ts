/**
 * Router pre nahlásenia. V Strapi 5 sa side-files nemergujú, preto ručne.
 */
export default {
  type: 'content-api',
  routes: [
    { method: 'GET', path: '/nahlasenia', handler: 'nahlasenie.find' },
    { method: 'GET', path: '/nahlasenia/:id', handler: 'nahlasenie.findOne' },
    { method: 'POST', path: '/nahlasenia', handler: 'nahlasenie.create' },
    { method: 'PUT', path: '/nahlasenia/:id', handler: 'nahlasenie.update' },
    { method: 'DELETE', path: '/nahlasenia/:id', handler: 'nahlasenie.delete' },
  ],
};

/**
 * Router pre pripomienky (poznámky redaktora pripnuté na prvok stránky).
 * V Strapi 5 sa side-files nemerge-ujú, preto všetky routes manuálne.
 */
export default {
  type: 'content-api',
  routes: [
    { method: 'GET', path: '/pripomienky', handler: 'pripomienka.find' },
    { method: 'GET', path: '/pripomienky/:id', handler: 'pripomienka.findOne' },
    { method: 'POST', path: '/pripomienky', handler: 'pripomienka.create' },
    { method: 'PUT', path: '/pripomienky/:id', handler: 'pripomienka.update' },
    { method: 'DELETE', path: '/pripomienky/:id', handler: 'pripomienka.delete' },
  ],
};

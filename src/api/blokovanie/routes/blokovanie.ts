/**
 * Router pre blokovanie. Zámerne NEMÁ `find` ani `findOne` nad celou
 * kolekciou — člen smie vidieť len svoj vlastný zoznam (`/moje`).
 */
export default {
  type: 'content-api',
  routes: [
    { method: 'GET', path: '/blokovania/moje', handler: 'blokovanie.moje' },
    { method: 'POST', path: '/blokovania', handler: 'blokovanie.create' },
    { method: 'DELETE', path: '/blokovania/:id', handler: 'blokovanie.delete' },
  ],
};

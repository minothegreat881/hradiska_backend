/**
 * Fronta e-mailov nemá verejné rozhranie — spravuje ju služba `posta`.
 * Controller existuje len preto, že Strapi ho pri type obsahu očakáva.
 */
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::postova-sprava.postova-sprava');

/** Štandardná služba typu obsahu; samotnú logiku rieši `posta.ts`. */
import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::postova-sprava.postova-sprava');

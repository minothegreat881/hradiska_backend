import { invalidateSearchIndex } from '../../controllers/blog-post';

/**
 * Pri akejkoľvek zmene článku zneplatní cache vyhľadávacieho indexu, aby sa
 * pri ďalšom dopyte prestaval z čerstvých dát. Lacné — index sa prestaví lenivo
 * až pri prvom hľadaní po zmene, nie hneď.
 */
export default {
  afterCreate() { invalidateSearchIndex(); },
  afterUpdate() { invalidateSearchIndex(); },
  afterDelete() { invalidateSearchIndex(); },
  afterCreateMany() { invalidateSearchIndex(); },
  afterUpdateMany() { invalidateSearchIndex(); },
  afterDeleteMany() { invalidateSearchIndex(); },
};

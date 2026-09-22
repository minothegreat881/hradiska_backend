import { mergeConfig, type UserConfig } from 'vite';

/**
 * PERF: Vite, ktorý vo vývojovom režime stavia admin panel, má koreň nastavený
 * na celý projekt (`root: cwd` v @strapi/strapi/dist/src/node/vite/config.js).
 * Sleduje teda aj `public/uploads` — 28 592 súborov, 4,8 GB.
 *
 * Následok (namerané 22. 9. 2026): proces Strapi držal 32 314 otvorených
 * handle-ov, zabral 1,1 GB pamäte a trvalo vyťažoval jadro. Dotazy na API
 * ostali rýchle (13–58 ms), ale KAŽDÝ statický súbor čakal v rade 12–27 s.
 * Ten istý súbor z disku: 43 ms. Admin sa preto tváril, že zamrzol — knižnica
 * médií si pýta 48 obrázkov naraz.
 *
 * POZOR — toto NIE JE to isté ako `admin.watchIgnoreFiles` v config/admin.ts.
 * Tá voľba mieri na chokidar sledovač reštartov Strapi (ten `public/**`
 * ignoruje aj sám od seba) a v Strapi 5.31.3 sa už nikde inde nepoužíva.
 * Sledovač Vite je druhý, samostatný — a práve on bol problém.
 *
 * Uploads sa zvonku nikdy nemenia, sledovať ich nemá zmysel.
 */
export default (config: UserConfig) => {
  return mergeConfig(config, {
    server: {
      watch: {
        ignored: [
          '**/public/uploads/**',
          '**/.tmp/**',
          '**/scripts/**',
        ],
      },
    },
  });
};

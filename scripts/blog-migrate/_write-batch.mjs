import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'out');

const DATA = {
  'vyprava-k-vikingom-2013-2-cast': {
    timeline: { keyFacts: [{ label: 'Typ', value: 'cestopis — Škandinávia/Gotland za Vikingami (2013), 2. časť' }, { label: 'Miesta', value: 'Bildstenar skanzen, Langhammars (rauky)' }], timeline: [] },
    grammar: { changes: [
      { before: 'podnikla naša členka - Ľubka', after: 'podnikla naša členka — Ľubka', rule: 'B pomlčka' },
      { before: 'veľký skanzen kde je zachytený', after: 'veľký skanzen, kde je zachytený', rule: 'A1 čiarka' },
      { before: 'Potešilo ma, že Hamar je take významné', after: '…že Hamar je také významné', rule: 'A8 dĺžeň (také)' },
      { before: 'veterného mlynu nemeckého typu.Tento ma zaujme', after: 'veterného mlyna nemeckého typu. Tento ma zaujme', rule: 'A4 pád (mlyna) + B medzera' },
      { before: 'od najstarších obydlí ,z obdobia 700 rokov pnl,až po 18.storočie', after: 'od najstarších obydlí z obdobia 700 rokov pred Kr. až po 18. storočie', rule: 'B medzery + pred Kr.' },
      { before: 'dômyselného system pre ďalšie upotrebenie', after: 'dômyselného systému na ďalšie využitie', rule: 'A8 systému + A7 bohemizmus (upotrebenie→využitie)' },
      { before: 'peknou a čistučkou kamennom plážou', after: 'peknou a čistučkou kamennou plážou', rule: 'A3 zhoda (kamennou)' }] },
    review: { flags: [{ type: 'MANY_TYPOGRAPHY', detail: 'Cestopis — naprieč textom veľa chýbajúcich medzier a preklepov (aj české slová prýskyřici/sklípek). Pri uploade prejsť zvyšné bloky rovnakým vzorom.' }] },
  },
  'vyprava-polske-hradiska-krakow-a-bnin-den-1': {
    timeline: { keyFacts: [{ label: 'Typ', value: 'cestopis — Poľské hradiská 2022, deň 1 (Krakov, Bnin)' }, { label: 'Účastníci', value: '9 členov OZ Hradiská' }], timeline: [] },
    grammar: { changes: [
      { before: 'Našim hlavným cieľom boli archeoskanzeny', after: 'Naším hlavným cieľom boli archeoskanzeny', rule: 'A8 tvar (Naším)' },
      { before: 'najznámejšia "slovanská" modla, tzv. . Mesto Krakow', after: 'najznámejšia „slovanská" modla, tzv. Światowid ze Zbrucza. Mesto Krakov', rule: 'B úvodzovky + doplnené meno modly (over) + dvojitá medzera' }] },
    review: { flags: [{ type: 'MISSING_NAME', detail: 'rt#3 „tzv. ." — chýba názov modly (zbručský idol/Światowid). Doplniť/over.' }] },
  },
  'vyprava-polske-hradiska-2-biskupin-wenecja-wiszogrod-gora-zamkowa': {
    timeline: { keyFacts: [{ label: 'Typ', value: 'cestopis — Poľské hradiská 2022 (Biskupin, Wenecja, Wyszogród, Góra Zamkowa)' }, { label: 'Highlight', value: 'archeoskanzen Biskupin (lužické hradisko + slovanská osada)' }], timeline: [] },
    grammar: { changes: [
      { before: 'Nakoľko tam nie je recepcia', after: 'Keďže tam nie je recepcia', rule: 'A7 bohemizmus (nakoľko→keďže)' },
      { before: 'možno to robilo aj kvalitné lukášove pivo', after: 'možno to robilo aj kvalitné Lukášovo pivo', rule: 'A9 vlastné meno + A3 zhoda (pivo s. rod)' }] },
    review: { flags: [{ type: 'IMAGE_HEAVY', detail: 'Veľmi obrázkovo ťažký (65 obrázkov, 64 kB) — pri uploade rátať s dlhším behom/záťažou (rytmus obrázkov + galéria).' }] },
  },
  'vyprava-polske-hradiska-3-gdansk-a-owidz': {
    timeline: { keyFacts: [{ label: 'Typ', value: 'cestopis — Poľské hradiská 2022, deň 3 (Gdansk, hradisko Owidz)' }], timeline: [] },
    grammar: { changes: [] },
    review: { flags: [{ type: 'IMAGE_HEAVY', detail: 'Obrázkovo ťažší (27 obrázkov) — pri uploade rátať so záťažou.' }] },
  },
};

for (const [slug, a] of Object.entries(DATA)) {
  writeFileSync(resolve(OUT, `${slug}.timeline.json`), JSON.stringify(a.timeline, null, 1), 'utf8');
  writeFileSync(resolve(OUT, `${slug}.grammar.json`), JSON.stringify(a.grammar, null, 1), 'utf8');
  writeFileSync(resolve(OUT, `${slug}.review.json`), JSON.stringify(a.review, null, 1), 'utf8');
  console.log('✓', slug);
}

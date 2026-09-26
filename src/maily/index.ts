/**
 * SYSTÉMOVÉ E-MAILY — šablóny v šate webu.
 *
 * HTML súbory vedľa tohto modulu sú hotové e-maily z dizajnérskeho handoffu
 * (tabuľkový rozvrh, štýly inline, bez skriptov, bez webových písem, bez
 * obrázkov). Zámerne sa neprepisujú do iného tvaru — menia sa len zástupné
 * premenné tvaru {{NAZOV}}.
 *
 * KAŽDÝ E-MAIL IDE AKO `multipart/alternative`: HTML aj čistý text. Text nie
 * je odvodený z HTML strojovo — je napísaný zvlášť nižšie, aby v schránke bez
 * HTML dávala správa rovnaký zmysel.
 *
 * Šablóny pre obnovu hesla a overenie e-mailu používa plugin
 * `users-permissions`, ktorý pozná len JEDNO telo a pošle ho ako text aj ako
 * HTML. Preto sa do jeho tela vkladá neviditeľná značka `<!--hradiska:meno-->`
 * a obálka odosielania (`src/index.ts`) podľa nej textovú verziu vymení za tú
 * správnu. Bez značky by v textovej časti skončil surový HTML kód.
 */

import fs from 'fs';
import path from 'path';

export type MenoSablony =
  | 'nove-heslo-admin'
  | 'obnova-hesla'
  | 'overenie-emailu'
  | 'novy-komentar';

const PRIECINOK = path.resolve(process.cwd(), 'src', 'maily');
const pamat = new Map<string, string>();

/** Načíta šablónu z disku (raz) a zapamätá si ju. */
export function sablona(meno: MenoSablony): string {
  const ulozene = pamat.get(meno);
  if (ulozene) return ulozene;
  const telo = fs.readFileSync(path.join(PRIECINOK, `${meno}.html`), 'utf8');
  pamat.set(meno, telo);
  return telo;
}

/** Hodnoty sa do HTML vkladajú escapované — heslo aj meno môžu obsahovať & alebo <. */
export function escapujHtml(hodnota: string): string {
  return String(hodnota)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Vyplní šablónu. Každá premenná sa v súbore vyskytuje viackrát (tlačidlo aj
 * záložný odkaz pod ním), preto sa nahrádzajú všetky výskyty.
 */
export function vyplnit(meno: MenoSablony, hodnoty: Record<string, string>): string {
  let telo = sablona(meno);
  for (const [kluc, hodnota] of Object.entries(hodnoty)) {
    telo = telo.split(`{{${kluc}}}`).join(escapujHtml(hodnota));
  }
  return telo;
}

/** To isté, ale bez escapovania — pre kusy, ktoré sú už HTML (napr. zalomenia). */
export function vyplnitSurove(meno: MenoSablony, hodnoty: Record<string, string>): string {
  let telo = sablona(meno);
  for (const [kluc, hodnota] of Object.entries(hodnoty)) {
    telo = telo.split(`{{${kluc}}}`).join(hodnota);
  }
  return telo;
}

/** Viacriadkový text do HTML: escapovaný a so zalomeniami. */
export function textDoHtml(text: string): string {
  return escapujHtml(text).replace(/\r?\n/g, '<br>');
}

/* ── Čisté texty ────────────────────────────────────────────────────────── */

export const ZNACKA = (meno: MenoSablony) => `<!--hradiska:${meno}-->`;

export function textObnovaHesla(url: string): string {
  return `Dobrý deň,

požiadali ste o obnovu hesla k účtu na Hradiska.sk.

Nové heslo si nastavíte na tomto odkaze:
${url}

Ak ste o obnovu nežiadali, tento e-mail ignorujte.

— OZ Hradiská
Hradiska.sk
`;
}

export function textOverenieEmailu(url: string): string {
  return `Vitajte v komunite Hradiska.sk!

Registráciu dokončíte potvrdením e-mailovej adresy na tomto odkaze:
${url}

Po overení sa budete môcť prihlásiť a zapojiť do diskusií.

Ak ste sa neregistrovali, tento e-mail ignorujte.

— OZ Hradiská
Hradiska.sk
`;
}

/** Text k oznámeniu o novom komentári — rovnaké údaje ako v HTML verzii. */
export function textNovyKomentar(v: {
  autor: string; kdeVeta: string; komentar: string; stav: string; odkaz: string;
}): string {
  return `Nový komentár na Hradiska.sk

${v.autor} ${v.kdeVeta}

${v.komentar}

${v.stav}

Zobraziť komentár:
${v.odkaz}

— OZ Hradiská
Hradiska.sk
`;
}

/**
 * TEXTOVÁ ALTERNATÍVA pre e-maily z pluginu `users-permissions`.
 *
 * Plugin pozná len jedno telo šablóny a pošle ho ako text AJ ako HTML. Odkedy
 * sú šablóny v šate webu, znamenalo by to, že do textovej časti správy ide
 * surový HTML kód — a presne to uvidí každý, kto má v schránke vypnuté HTML.
 *
 * Do šablóny sa preto pri zápise vkladá neviditeľná značka a tu sa podľa nej
 * textová verzia vymení za napísanú. E-mailov, ktoré si text nesú sám
 * (napr. z `account.ts`), sa to netýka — tie idú nezmenené.
 */
export function dopisTextovuVerziu(sprava: any): any {
  const html: string = sprava?.html || '';
  if (!html || sprava.text !== html) return sprava;

  const odkaz = (html.match(/href="([^"]+)"/) || [])[1] || '';
  const url = odkaz.replace(/&amp;/g, '&');

  if (html.includes(ZNACKA('obnova-hesla'))) return { ...sprava, text: textObnovaHesla(url) };
  if (html.includes(ZNACKA('overenie-emailu'))) return { ...sprava, text: textOverenieEmailu(url) };
  return sprava;
}

/**
 * DORUČOVANIE ZMIEN Z WEBU DO APLIKÁCIE (OTA).
 *
 * Aplikácia si nesie web v sebe, takže bez tohto by každá zmena na webe čakala
 * na nové vydanie v Google Play. Plugin `@capgo/capacitor-updater` sa pri
 * spustení appky spýta sem, a keď je vydaný novší balík, stiahne ho na pozadí
 * a spustí sa z neho pri ďalšom otvorení.
 *
 * Server si tu **nič nevymýšľa**: popis vydaného balíka (verzia, adresa, sha256)
 * zapísal ten, kto balík vydal, do `public/app/aktualizacia.json`
 * (`scripts/postav-balik.mjs` vo frontende). Adresa balíka je v tom súbore
 * absolútna zámerne — appka beží na `https://localhost` a Strapi stojí za
 * proxy, takže z požiadavky sa verejná adresa odvodiť nedá.
 *
 * Odpovede sú v tvare, ktorý plugin pozná:
 *   • je čo stiahnuť → `{ version, url, checksum }`
 *   • netreba nič    → `{ kind: 'up_to_date', message, version }`
 * Tvar `kind: 'up_to_date'` je dôležitý: bez neho si plugin zapíše neúspech
 * a v telefóne to vyzerá ako chyba siete.
 */

import fs from 'fs';
import path from 'path';

type Balik = { version: string; url: string; checksum?: string };

/** Popis sa číta z disku pri každej otázke — vydanie nového balíka tak
 *  netreba potvrdzovať restartom Strapi. Je to jeden malý súbor. */
function precitajBalik(): Balik | null {
  try {
    const cesta = path.join(strapi.dirs.static.public, 'app', 'aktualizacia.json');
    const obsah = JSON.parse(fs.readFileSync(cesta, 'utf8'));
    if (!obsah?.version || !obsah?.url) return null;
    return { version: String(obsah.version), url: String(obsah.url), checksum: obsah.checksum ? String(obsah.checksum) : undefined };
  } catch {
    // Súbor nemusí existovať — príkladom je čerstvý server bez vydanej appky.
    return null;
  }
}

function bezAktualizacie(ctx, verzia: string, dovod: string) {
  ctx.body = { kind: 'up_to_date', message: dovod, version: verzia };
}

export default {
  async skontroluj(ctx) {
    const telo = (ctx.request.body ?? {}) as Record<string, unknown>;
    const maBalik = String(telo.version_name ?? '').trim();
    const maApp = String(telo.version_build ?? '').trim();

    const balik = precitajBalik();
    if (!balik) return bezAktualizacie(ctx, maBalik || maApp || '0.0.0', 'Žiadny balík nie je vydaný');

    /* Appka hlási verziu balíka, z ktorého beží. Vstavaný balík v APK sa hlási
       verziou zapísanou pri zostavení (`capacitor.config.ts`), takže hneď po
       inštalácii tu sedí zhoda a nič sa nesťahuje nadarmo. */
    if (maBalik && maBalik === balik.version) return bezAktualizacie(ctx, balik.version, 'Aplikácia má najnovší web');
    if (!maBalik && maApp === balik.version) return bezAktualizacie(ctx, balik.version, 'Aplikácia má najnovší web');

    ctx.body = { version: balik.version, url: balik.url, ...(balik.checksum ? { checksum: balik.checksum } : {}) };
  },

  async vydane(ctx) {
    const balik = precitajBalik();
    ctx.body = balik ?? { kind: 'up_to_date', message: 'Žiadny balík nie je vydaný', version: '0.0.0' };
  },
};

/**
 * POŠTA — odosielanie e-mailov, ktoré prežije výpadok.
 *
 * Prečo vznikla: obnova hesla aj overenie účtu visia na jednom Gmail App
 * Password. Keď ten prestane platiť (dá sa zrušiť v Google účte, zmenou
 * hesla, aj automaticky), server vyzerá zdravo a mlčky neodošle nič.
 * Človek, ktorý sa nevie prihlásiť a nedostane e-mail, nemá ako pokračovať.
 *
 * Ako to funguje:
 *   1. Správa sa NAJPRV zapíše do fronty (`postova-sprava`) a až potom
 *      odosiela. Keď server medzitým spadne, správa sa nestratí.
 *   2. Skúsi sa hlavný odosielateľ (Gmail SMTP cez plugin Strapi).
 *   3. Keď zlyhá, skúsi sa náhradný — Resend (HTTP) alebo druhé SMTP,
 *      podľa toho, čo je v `.env`. Bez neho sa len čaká na ďalší pokus.
 *   4. Neúspešná správa sa opakuje o 1, 5, 15, 60 a 240 minút. Po piatich
 *      pokusoch je označená ako zlyhaná a svieti v administrácii.
 *
 * Odosielanie NIKDY nevyhodí výnimku volajúcemu — žiadosť o heslo nemá
 * padnúť preto, že pošta má zlý deň. Pravda o tom, čo sa stalo, je vo
 * fronte a v logu.
 */

const TYP = 'api::postova-sprava.postova-sprava';

/** Odstupy medzi pokusmi v minútach. Piaty neúspech = správa je zlyhaná. */
const ODSTUPY_MIN = [1, 5, 15, 60, 240];

export interface Sprava {
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
}

/** Posledný známy stav prihlásenia na SMTP (plní ho kontrola pri štarte). */
let stavSmtp: { ok: boolean; kedy: string; sprava: string } = {
  ok: false,
  kedy: '',
  sprava: 'zatiaľ neoverené',
};

export function zapisStavSmtp(ok: boolean, sprava: string) {
  stavSmtp = { ok, kedy: new Date().toISOString(), sprava };
}

export default ({ strapi }: { strapi: any }) => ({
  /**
   * Zaradí správu do fronty a hneď sa ju pokúsi odoslať.
   * Vráti `true`, keď sa podarilo odoslať hneď; inak `false` a správa
   * ostáva vo fronte na ďalší pokus.
   */
  async posli(sprava: Sprava, hlavnyOdosielatel?: (s: Sprava) => Promise<any>): Promise<boolean> {
    let zaznam: any = null;
    try {
      zaznam = await strapi.documents(TYP).create({
        data: {
          prijemca: sprava.to,
          predmet: sprava.subject || '',
          telo: sprava.text || '',
          teloHtml: sprava.html || '',
          stav: 'caka',
          pokusov: 0,
          dalsiPokus: new Date().toISOString(),
        },
      });
    } catch (e: any) {
      // Keď zlyhá aj zápis do fronty, ostáva aspoň log a priamy pokus.
      strapi.log?.error?.(`[posta] správu sa nepodarilo zaradiť do fronty: ${e?.message || e}`);
    }

    return this.skusOdoslat(zaznam, sprava, hlavnyOdosielatel);
  },

  /**
   * Jeden pokus: hlavný odosielateľ, potom náhradný. Podľa výsledku upraví
   * záznam vo fronte.
   */
  async skusOdoslat(
    zaznam: any,
    sprava: Sprava,
    hlavnyOdosielatel?: (s: Sprava) => Promise<any>
  ): Promise<boolean> {
    const pokus = (zaznam?.pokusov ?? 0) + 1;
    const chyby: string[] = [];

    for (const odosielatel of this.odosielatelia(hlavnyOdosielatel)) {
      try {
        await odosielatel.posli(sprava);
        if (zaznam) {
          await strapi.documents(TYP).update({
            documentId: zaznam.documentId,
            data: { stav: 'odoslana', pokusov: pokus, odoslanaCez: odosielatel.nazov, dalsiPokus: null },
          });
        }
        strapi.log?.info?.(`[posta] ${sprava.to}: odoslané cez ${odosielatel.nazov} (pokus ${pokus})`);
        return true;
      } catch (e: any) {
        chyby.push(`${odosielatel.nazov}: ${e?.message || e}`);
      }
    }

    const koniec = pokus >= ODSTUPY_MIN.length;
    const odstup = ODSTUPY_MIN[Math.min(pokus - 1, ODSTUPY_MIN.length - 1)];
    if (zaznam) {
      await strapi.documents(TYP).update({
        documentId: zaznam.documentId,
        data: {
          stav: koniec ? 'zlyhala' : 'caka',
          pokusov: pokus,
          poslednaChyba: chyby.join(' | ').slice(0, 1000),
          dalsiPokus: koniec ? null : new Date(Date.now() + odstup * 60_000).toISOString(),
        },
      });
    }
    strapi.log?.error?.(
      `[posta] ${sprava.to}: pokus ${pokus} zlyhal (${chyby.join(' | ')})` +
        (koniec ? ' — správa je označená ako ZLYHANÁ' : ` — ďalší pokus o ${odstup} min`)
    );
    return false;
  },

  /**
   * Poradie odosielateľov. Náhradný sa pridá len vtedy, keď je nastavený —
   * bez kľúča nemá zmysel skúšať prázdno.
   */
  odosielatelia(hlavnyOdosielatel?: (s: Sprava) => Promise<any>) {
    const zoznam: { nazov: string; posli: (s: Sprava) => Promise<any> }[] = [];

    zoznam.push({
      nazov: 'gmail-smtp',
      posli: async (s) => {
        if (hlavnyOdosielatel) return hlavnyOdosielatel(s);
        return strapi.plugin('email').service('email').send(s);
      },
    });

    if (process.env.RESEND_API_KEY) {
      zoznam.push({
        nazov: 'resend',
        posli: async (s) => {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: process.env.RESEND_FROM || s.from || process.env.EMAIL_FROM,
              to: [s.to],
              subject: s.subject || '',
              text: s.text || undefined,
              html: s.html || undefined,
            }),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        },
      });
    }

    if (process.env.SMTP2_HOST && process.env.SMTP2_USER && process.env.SMTP2_PASS) {
      zoznam.push({
        nazov: 'smtp2',
        posli: async (s) => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const nodemailer = require('nodemailer');
          const t = nodemailer.createTransport({
            host: process.env.SMTP2_HOST,
            port: Number(process.env.SMTP2_PORT || 587),
            secure: String(process.env.SMTP2_SECURE) === 'true',
            auth: { user: process.env.SMTP2_USER, pass: process.env.SMTP2_PASS },
            connectionTimeout: 15000,
          });
          await t.sendMail({
            from: process.env.SMTP2_FROM || s.from || process.env.EMAIL_FROM,
            to: s.to,
            subject: s.subject || '',
            text: s.text,
            html: s.html,
          });
        },
      });
    }

    return zoznam;
  },

  /**
   * Prejde správy, ktorým už dobehol čas ďalšieho pokusu. Beží každú minútu.
   */
  async spracujFrontu(hlavnyOdosielatel?: (s: Sprava) => Promise<any>) {
    let caka: any[] = [];
    try {
      caka = await strapi.documents(TYP).findMany({
        filters: { stav: 'caka', dalsiPokus: { $lte: new Date().toISOString() } },
        sort: 'dalsiPokus:asc',
        start: 0,
        limit: 20,
      });
    } catch (e: any) {
      strapi.log?.error?.(`[posta] frontu sa nepodarilo prečítať: ${e?.message || e}`);
      return;
    }
    if (!caka.length) return;

    strapi.log?.info?.(`[posta] vo fronte čaká ${caka.length} správ — skúšam znova`);
    for (const z of caka) {
      await this.skusOdoslat(
        z,
        { to: z.prijemca, subject: z.predmet, text: z.telo, html: z.teloHtml },
        hlavnyOdosielatel
      );
    }
  },

  /** Zhrnutie pre budíček v administrácii. */
  async stav() {
    const spocitaj = async (stav: string) => {
      try {
        const r = await strapi.documents(TYP).findMany({ filters: { stav }, fields: ['id'], start: 0, limit: 500 });
        return r.length;
      } catch {
        return 0;
      }
    };

    let poslednaChyba: string | null = null;
    try {
      const [z] = await strapi.documents(TYP).findMany({
        filters: { stav: 'zlyhala' },
        sort: 'updatedAt:desc',
        start: 0,
        limit: 1,
      });
      poslednaChyba = z?.poslednaChyba || null;
    } catch {
      /* nevadí */
    }

    const caka = await spocitaj('caka');
    const zlyhali = await spocitaj('zlyhala');

    return {
      smtp: stavSmtp,
      caka,
      zlyhali,
      poslednaChyba,
      nahradnyOdosielatel: process.env.RESEND_API_KEY ? 'resend' : process.env.SMTP2_HOST ? 'smtp2' : null,
      // Budíček sa rozsvieti, keď sa nedá prihlásiť na SMTP alebo niečo zlyhalo nadobro.
      poplach: !stavSmtp.ok || zlyhali > 0,
    };
  },
});

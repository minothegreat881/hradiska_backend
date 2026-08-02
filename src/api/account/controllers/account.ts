/**
 * Vlastný účet člena — GDPR akcie + profil a jeho nastavenia nad SVOJÍM účtom.
 *
 * `deleteMe` zmaže LEN volajúceho (ctx.state.user), nikdy iného. Preto netreba
 * dávať Member role nebezpečné `user.delete` na cudzie účty.
 * `getMe`/`updateMe` pracujú tiež len s vlastným účtom.
 */
import crypto from 'crypto';

const USER = 'plugin::users-permissions.user';
const COMMENT = 'api::blog-comment.blog-comment';
const PHOTO_COMMENT = 'api::photo-comment.photo-comment';
const REACTION = 'api::reaction.reaction';
const SHARE = 'api::share.share';

// ── Obnova hesla správcu („Zabudli ste heslo?") ──────────────────────────────
// Platnosť odkazu z e-mailu.
const RESET_TTL_MS = 60 * 60_000; // 1 hodina

/**
 * Základ odkazu, ktorý ide DO E-MAILU. Zámerne NIE `PUBLIC_URL` — tá je na
 * produkcii holá IP cez http (`http://188.245.47.29`), takže by token na obnovu
 * hesla putoval po sieti čitateľne a odkaz na IP adresu je navyše pre spamové
 * filtre podozrivý. Backend je verejne dostupný aj cez HTTPS proxy frontendu
 * (`<doména>/strapi/...`), preto sa použije tá; `PUBLIC_API_URL` ju nastavuje.
 */
const BACKEND_URL = () => process.env.PUBLIC_API_URL || process.env.PUBLIC_URL || 'http://localhost:1337';
const FRONTEND = () => process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Nové heslo sa NIKDE neskladuje — odvodí sa z tokenu cez HMAC. Vďaka tomu
 * nepotrebujeme nové pole v schéme: v DB je len token (v existujúcom
 * `resetPasswordToken`) a rovnaké heslo sa z neho dá kedykoľvek prepočítať.
 * Kto nemá token z e-mailu, heslo neodvodí — HMAC je kľúčovaný serverovým
 * tajomstvom.
 */
function derivePassword(token: string): string {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'hradiska-fallback';
  const raw = crypto.createHmac('sha256', secret).update(`pw:${token}`).digest();
  // Bez znakov, ktoré sa v e-maile ľahko zamenia (0/O, 1/l/I).
  const low = 'abcdefghijkmnpqrstuvwxyz';
  const up = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const dig = '23456789';
  const all = low + up + dig;
  // Prvé tri znaky pevne z každej triedy — heslo tak vždy spĺňa bežné pravidlá.
  const out = [up[raw[0] % up.length], low[raw[1] % low.length], dig[raw[2] % dig.length]];
  for (let i = 3; i < 14; i++) out.push(all[raw[i] % all.length]);
  return out.join('');
}

/** Token nesie aj svoju expiráciu, takže na ňu netreba ďalší stĺpec. */
function makeToken(): string {
  return `${Date.now() + RESET_TTL_MS}.${crypto.randomBytes(24).toString('hex')}`;
}
function tokenExpired(token: string): boolean {
  const exp = Number((token || '').split('.')[0]);
  return !exp || Number.isNaN(exp) || exp < Date.now();
}

/** Jednoduchá HTML stránka ako odpoveď na klik v e-maile. */
function page(title: string, body: string, link?: { href: string; label: string }): string {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Hradiska.sk</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4efe3;font-family:Georgia,'Times New Roman',serif;color:#2d2418">
<div style="max-width:460px;padding:32px;background:#fbf7ee;border:1px solid #e6d9bd;border-radius:14px;text-align:center">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#5b4f3d">${body}</p>
${link ? `<a href="${link.href}" style="display:inline-block;padding:10px 20px;background:#8a5316;color:#fbf3e2;text-decoration:none;border-radius:8px;font-size:14px">${link.label}</a>` : ''}
</div></body></html>`;
}

// Polia, ktoré člen smie meniť na SVOJOM účte (nie role/blocked/heslo tu).
// `email` sa rieši osobitne v `updateMe` — vyžaduje heslo a kontrolu jedinečnosti.
const EDITABLE = ['displayName', 'notifyReply', 'notifyLike', 'notifyPost', 'notifyEmail', 'avatar'];

/** Staff = rola `authenticated` (v admine sa zobrazuje ako „Superadmin"). */
const isStaff = (user: any) => user?.role?.type === 'authenticated';

export default ({ strapi }: { strapi: any }) => ({
  /**
   * POST /account/forgot-password { email } — „Zabudli ste heslo?" v admine.
   *
   * Pošle na adresu účtu e-mail s NOVÝM heslom a potvrdzovacím odkazom. Nové
   * heslo začne platiť až po kliknutí na odkaz — dovtedy funguje pôvodné.
   *
   * Prečo až po kliknutí: keby sa heslo menilo hneď pri odoslaní žiadosti,
   * ktokoľvek, kto pozná adresu správcu, by mu opakovaným odosielaním formulára
   * mohol kedykoľvek znemožniť prihlásenie — aj bez prístupu k jeho schránke.
   * Takto zmena nastane len v rukách toho, kto e-mail naozaj dostal.
   *
   * Odpoveď je VŽDY rovnaká, aj keď účet neexistuje — inak by sa dal formulár
   * použiť na zisťovanie, ktoré adresy sú v systéme.
   */
  async forgotPassword(ctx: any) {
    const email = (ctx.request.body?.email ?? ctx.request.body?.data?.email ?? '').toString().trim().toLowerCase();
    const ok = { ok: true, message: 'Ak adresa patrí správcovskému účtu, poslali sme na ňu e-mail.' };
    if (!email) return ctx.badRequest('Zadajte e-mailovú adresu.');

    const user = await strapi.documents(USER).findFirst({
      filters: { email },
      populate: { role: { fields: ['type'] } },
    });
    // Len správcovia. Členovia majú vlastný tok cez /api/auth/forgot-password.
    if (!user || user.blocked || user.role?.type !== 'authenticated') return ok;

    const token = makeToken();
    const newPassword = derivePassword(token);
    await strapi.documents(USER).update({
      documentId: user.documentId,
      data: { resetPasswordToken: token },
    });

    const url = `${BACKEND_URL()}/api/account/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await strapi.plugin('email').service('email').send({
        to: user.email,
        subject: 'Nové heslo do administrácie — Hradiska.sk',
        text: `Dobrý deň,

požiadali ste o nové heslo do administrácie Hradiska.sk.

Vaše nové heslo:  ${newPassword}

Začne platiť až po potvrdení na tomto odkaze (platí 1 hodinu):
${url}

Kým odkaz nepotvrdíte, pôvodné heslo funguje ďalej.
Ak ste o nové heslo nežiadali, tento e-mail ignorujte — nič sa nezmenilo.

— OZ Hradiská`,
        html: `<p>Dobrý deň,</p>
<p>požiadali ste o nové heslo do administrácie <strong>Hradiska.sk</strong>.</p>
<p style="font-size:15px">Vaše nové heslo:<br>
<code style="display:inline-block;margin-top:6px;padding:10px 14px;background:#f4efe3;border:1px solid #e6d9bd;border-radius:8px;font-size:18px;letter-spacing:1px">${newPassword}</code></p>
<p>Začne platiť až po potvrdení (odkaz platí 1 hodinu):</p>
<p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#8a5316;color:#fbf3e2;text-decoration:none;border-radius:8px">Potvrdiť nové heslo</a></p>
<p style="color:#6b5d48;font-size:13px">Kým odkaz nepotvrdíte, pôvodné heslo funguje ďalej.<br>
Ak ste o nové heslo nežiadali, e-mail ignorujte — nič sa nezmenilo.</p>
<p>— OZ Hradiská</p>`,
      });
    } catch (e: any) {
      // Chybu neprezrádzame volajúcemu (nech sa nedá skúmať, kto v systéme je),
      // ale do logu patrí — inak by sa nefunkčné SMTP nedalo odhaliť.
      strapi.log?.error?.(`[account.forgotPassword] odoslanie zlyhalo: ${e?.message || e}`);
    }
    return ok;
  },

  /**
   * GET /account/reset-password?token=… — potvrdenie z e-mailu.
   *
   * Heslo sa z tokenu prepočíta (rovnaké, aké prišlo v e-maile), nastaví sa
   * a token sa zneplatní, aby sa odkaz nedal použiť druhý raz.
   */
  async resetPassword(ctx: any) {
    const token = (ctx.query?.token || '').toString();
    ctx.type = 'html';

    if (!token) {
      ctx.status = 400;
      ctx.body = page('Neplatný odkaz', 'Odkaz je neúplný. Použite ten z e-mailu, celý.');
      return;
    }
    if (tokenExpired(token)) {
      ctx.status = 400;
      ctx.body = page('Odkaz vypršal', 'Platnosť odkazu bola 1 hodina. Požiadajte o nové heslo znova.',
        { href: `${FRONTEND()}/admin`, label: 'Späť do administrácie' });
      return;
    }

    const user = await strapi.documents(USER).findFirst({ filters: { resetPasswordToken: token } });
    if (!user) {
      ctx.status = 400;
      ctx.body = page('Odkaz už neplatí', 'Buď bol už použitý, alebo medzičasom prišla novšia žiadosť o heslo.',
        { href: `${FRONTEND()}/admin`, label: 'Späť do administrácie' });
      return;
    }

    const newPassword = derivePassword(token);
    // Cez službu users-permissions, nech sa heslo zahashuje rovnako ako inde.
    await strapi.plugin('users-permissions').service('user').edit(user.id, {
      password: newPassword,
      resetPasswordToken: null,
    });
    strapi.log?.info?.(`[account.resetPassword] heslo obnovené pre účet #${user.id}`);

    ctx.body = page(
      'Nové heslo je aktívne',
      'Prihláste sa heslom z e-mailu. Odporúčame si ho hneď zmeniť v sekcii Môj profil.',
      { href: `${FRONTEND()}/admin`, label: 'Prihlásiť sa' },
    );
  },

  /**
   * GET /account/users — zoznam účtov pre admin obrazovku „Používatelia".
   *
   * Prečo vlastný endpoint a nie `/api/users?populate=role`: users-permissions
   * reláciu `role` z výstupu content API **zahadzuje** bez ohľadu na `populate`
   * (overené — kľúč `role` v odpovedi vôbec nie je), takže stĺpec Rola ostával
   * prázdny („—"). Rovnaký problém a rovnaké riešenie ako pri autoroch komentárov:
   * dotaz ide cez document service so servisnými právami a von posielame LEN
   * bezpečné polia — nikdy heslo, tokeny ani nič, čo do zoznamu nepatrí.
   *
   * Prístup má len staff; člen dostane 403.
   */
  async staffUsers(ctx: any) {
    const me = ctx.state?.user;
    if (!me) return ctx.unauthorized();
    if (!isStaff(me)) return ctx.forbidden('Zoznam účtov smie čítať len správca.');

    const q = (ctx.query?.q || '').toString().trim();
    const filters: any = q
      ? { $or: [{ username: { $containsi: q } }, { email: { $containsi: q } }, { displayName: { $containsi: q } }] }
      : {};

    const rows = await strapi.documents(USER).findMany({
      filters,
      sort: { createdAt: 'desc' },
      populate: { role: { fields: ['name', 'type'] } },
      pagination: { pageSize: 500 },
    });

    return {
      data: rows.map((u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        displayName: u.displayName ?? null,
        confirmed: !!u.confirmed,
        blocked: !!u.blocked,
        blockedReason: u.blockedReason ?? null,
        blockedAt: u.blockedAt ?? null,
        createdAt: u.createdAt,
        roleName: u.role?.name ?? null,
        roleType: u.role?.type ?? null,
        // Rovnaká rola ako volajúci správca = plné práva v admine.
        isStaff: u.role?.type === 'authenticated',
        // Aby si admin nezmazal/nezablokoval sám seba.
        isMe: u.id === me.id,
      })),
    };
  },

  /** GET /account/me — profil + štatistiky pre hlavičku profilu */
  async getMe(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const full = await strapi.documents(USER).findFirst({
      filters: { id: user.id },
      populate: { avatar: { fields: ['url', 'formats'] } },
    });
    // Do počtov rátame aj aktivitu k FOTKÁM (galéria): photo-comment a
    // reaction targetType='photo' — inak profil ukazoval 0 aj keď člen reagoval.
    const [blogComments, photoComments, postLikes, photoLikes, shares] = await Promise.all([
      strapi.documents(COMMENT).count({ filters: { user: { id: user.id }, status: { $ne: 'spam' } } }),
      strapi.documents(PHOTO_COMMENT).count({ filters: { user: { id: user.id }, status: { $ne: 'spam' } } }),
      strapi.documents(REACTION).count({ filters: { user: { id: user.id }, targetType: 'post' } }),
      strapi.documents(REACTION).count({ filters: { user: { id: user.id }, targetType: 'photo' } }),
      strapi.documents(SHARE).count({ filters: { user: { id: user.id } } }),
    ]);
    const comments = blogComments + photoComments;
    const favorites = postLikes + photoLikes;
    return {
      id: full.id,
      username: full.username,
      email: full.email,
      displayName: full.displayName ?? null,
      avatar: full.avatar ?? null,
      warnsCount: full.warnsCount ?? 0,
      preModerated: full.preModerated ?? false,
      joinedAt: full.createdAt,
      prefs: {
        notifyReply: full.notifyReply !== false,
        notifyLike: full.notifyLike !== false,
        notifyPost: full.notifyPost !== false,
        notifyEmail: full.notifyEmail === true,
      },
      stats: { comments, favorites, shares },
    };
  },

  /**
   * PUT /account/me { data: { displayName, notify*, avatar, email, currentPassword } }
   * — len vlastné povolené polia.
   *
   * `email` má oproti ostatným prísnejší režim: vyžaduje `currentPassword`
   * (dôkaz, že pri klávesnici sedí naozaj majiteľ účtu — inak by prebratý
   * prihlásený prehliadač stačil na prepísanie adresy a následné prevzatie účtu
   * cez „zabudnuté heslo"), overuje formát a jedinečnosť.
   */
  async updateMe(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();
    const body = ctx.request.body?.data ?? {};
    const data: any = {};
    for (const key of EDITABLE) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (typeof data.displayName === 'string') data.displayName = data.displayName.slice(0, 60);

    // ── zmena e-mailu ────────────────────────────────────────────────────────
    if (typeof body.email === 'string' && body.email.trim()) {
      const email = body.email.trim().toLowerCase();
      if (email !== (user.email || '').toLowerCase()) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          return ctx.badRequest('Neplatná e-mailová adresa.');
        }
        if (!body.currentPassword) {
          return ctx.badRequest('Na zmenu e-mailu je potrebné zadať aktuálne heslo.');
        }
        const valid = await strapi
          .plugin('users-permissions').service('user')
          .validatePassword(body.currentPassword, user.password);
        if (!valid) return ctx.badRequest('Aktuálne heslo nesedí.');

        const taken = await strapi.documents(USER).count({ filters: { email } });
        if (taken > 0) return ctx.badRequest('Túto adresu už používa iný účet.');

        data.email = email;
      }
    }

    if (!Object.keys(data).length) return ctx.badRequest('Žiadne povolené pole na úpravu.');
    const updated = await strapi.documents(USER).update({ documentId: user.documentId, data });
    return { ok: true, displayName: updated.displayName ?? null, email: updated.email };
  },

  async deleteMe(ctx: any) {
    const user = ctx.state?.user;
    if (!user) return ctx.unauthorized();

    // Komentáre zostávajú (diskusie by sa inak rozpadli), len sa odviažu od účtu
    // a anonymizujú — autor sa premení na „Zmazaný účet".
    try {
      const mine = await strapi.documents('api::blog-comment.blog-comment').findMany({
        filters: { user: { id: user.id } }, limit: 1000,
      });
      for (const c of mine) {
        await strapi.documents('api::blog-comment.blog-comment').update({
          documentId: c.documentId,
          data: { authorName: 'Zmazaný účet', authorEmail: null, user: null },
        });
      }
    } catch { /* aj keby anonymizácia zlyhala, účet zmažeme */ }

    await strapi.documents('plugin::users-permissions.user').delete({ documentId: user.documentId });
    return { ok: true };
  },
});

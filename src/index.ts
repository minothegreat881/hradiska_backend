import type { Core } from '@strapi/strapi';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Predefined categories for Hradiska.sk
const CATEGORIES = [
  {
    name: 'Kniežacie sídla',
    slug: 'kniezacie-sidla',
    description: 'Významné mocenské centrá kniežat a vládcov'
  },
  {
    name: 'Mocenské centrá',
    slug: 'mocenske-centra',
    description: 'Hlavné správne a vojenské strediská'
  },
  {
    name: 'Strážna funkcia',
    slug: 'strazna-funkcia',
    description: 'Hradiská so strážnou a obrannou funkciou'
  },
  {
    name: 'Refugiá',
    slug: 'refugia',
    description: 'Útočištné hradiská pre obyvateľstvo v čase nebezpečenstva'
  },
  {
    name: 'Staroveké sídla',
    slug: 'staroveke-sidla',
    description: 'Sídla z obdobia pred príchodom Slovanov'
  },
  {
    name: 'Ostatné',
    slug: 'ostatne',
    description: 'Ďalšie hradiská a opevnené sídla'
  }
];

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {
    // Windows dev env: multer's temp-file cleanup after /api/upload occasionally hits
    // EBUSY (antivirus/OS briefly locks the temp file), which throws as an unhandled
    // rejection and kills the whole process. The upload itself already succeeded by
    // that point, so treat this specific case as non-fatal instead of crashing.
    process.on('unhandledRejection', (err: any) => {
      if (err && err.code === 'EBUSY') {
        console.warn(`⚠️  Ignoring transient EBUSY during temp-file cleanup: ${err.path}`);
        return;
      }
      throw err;
    });
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   * Seeds the database with predefined categories and sets up public permissions.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // Check if categories already exist
    const existingCategories = await strapi.documents('api::blog-category.blog-category').findMany({});

    if (existingCategories.length === 0) {
      console.log('🌱 Seeding blog categories...');

      for (const category of CATEGORIES) {
        await strapi.documents('api::blog-category.blog-category').create({
          data: category,
        });
        console.log(`  ✓ Created category: ${category.name}`);
      }

      console.log('✅ Blog categories seeded successfully!');
    } else {
      console.log(`📁 ${existingCategories.length} categories already exist, skipping seed.`);
    }

    // Set up public permissions for API access
    await setupPublicPermissions(strapi);

    // Set up member/staff (non-public) permissions for profil + notifikácie + push
    await setupMemberPermissions(strapi);

    // Staff-only: správa používateľov (find/update/destroy) — LEN rola Authenticated
    await setupStaffUserPermissions(strapi);

    // Po potvrdení e-mailu presmeruj používateľa na frontend (nie na backend IP)
    await setupAuthRedirects(strapi);

    // Seed sample aktuality (only on first run, if collection is empty)
    await seedAktuality(strapi);
  },
};

/**
 * Stiahne obrázok z URL, uloží do temp a uploadne do Strapi Media Library.
 * Vráti zaregistrovaný file objekt (s ID, použiteľným v relation).
 */
async function downloadAndUploadImage(strapi: Core.Strapi, url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed: ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), filename);
  fs.writeFileSync(tmpPath, buf);

  try {
    const uploaded = await strapi.plugin('upload').service('upload').upload({
      files: [{
        filepath: tmpPath,
        originalFilename: filename,
        mimetype: 'image/jpeg',
        size: buf.length,
      }],
      data: {},
    });
    return uploaded[0];
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

const SAMPLE_AKTUALITY = [
  {
    nazov: 'Brigáda na hradisku Pajštún',
    datum: '2026-05-18',
    typAktivity: 'brigada',
    hradiskoSlug: 'Pajštún',
    zvyraznene: false,
    obsah: 'V sobotu sa zišlo 14 dobrovoľníkov, aby sme spoločne vyčistili kroviny a nálety okolo zachovaných múrov hradu. Vyniesli sme tri vrecia odpadkov a obnažili časti opevnenia, ktoré boli dlhé roky zarastené. Po práci sme si pri ohni rozprávali, čo všetko sa na týchto múroch ešte dá zachrániť. Ďakujeme všetkým, ktorí prišli!',
    images: [
      { url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1280&h=960&fit=crop&q=80', name: 'pajstun-brigada-1.jpg' },
      { url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1280&h=960&fit=crop&q=80', name: 'pajstun-brigada-2.jpg' },
    ],
  },
  {
    nazov: 'Odhalili sme novú informačnú tabuľu pri Bratislavskom hrade',
    datum: '2026-06-05',
    typAktivity: 'nova_tabula',
    hradiskoSlug: 'Bratislavský hrad',
    zvyraznene: true,
    obsah: 'Po pol roku príprav s archeológom Mgr. P. Vlčkom sme v stredu 5. júna slávnostne odhalili novú informačnú tabuľu venovanú slovanskému osídleniu Bratislavského hradného brala. Tabuľa obsahuje dobové ilustrácie, časovú os a QR kód odkazujúci na rozšírený výklad na našom webe. Súčasťou odhalenia bol krátky príhovor PhDr. Z. Hradskej a hudobná vsuvka stredovekej kapely Cantilena.',
    images: [
      { url: 'https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?w=1280&h=960&fit=crop&q=80', name: 'bratislava-tabula-1.jpg' },
    ],
  },
  {
    nazov: 'Geofyzikálny prieskum v okolí Devína',
    datum: '2026-04-22',
    typAktivity: 'vyskum',
    hradiskoSlug: 'Devín',
    zvyraznene: false,
    obsah: 'V spolupráci s Archeologickým ústavom SAV sme dva dni vykonávali magnetometrický prieskum lúky priliehajúcej k Devínskemu hradnému brala. Dáta naznačujú existenciu predtým neznámej línie obvodového opevnenia mimo dnešného hradného areálu — pravdepodobne zaniknuté podhradie. Výsledky budú publikované v ďalšom čísle Slovenskej archeológie.',
    images: [
      { url: 'https://images.unsplash.com/photo-1519677100203-a0e668c92439?w=1280&h=960&fit=crop&q=80', name: 'devin-vyskum-1.jpg' },
      { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1280&h=960&fit=crop&q=80', name: 'devin-vyskum-2.jpg' },
      { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1280&h=960&fit=crop&q=80', name: 'devin-vyskum-3.jpg' },
    ],
  },
];

async function seedAktuality(strapi: Core.Strapi) {
  const existing = await strapi.documents('api::aktualita.aktualita').findMany({ status: 'draft' as any });
  if (existing.length > 0) {
    console.log(`📰 ${existing.length} aktualít už existuje, seed sa preskakuje.`);
    return;
  }
  console.log('🌱 Vytváram ukážkové aktuality…');

  for (const sample of SAMPLE_AKTUALITY) {
    try {
      const fotky: number[] = [];
      for (const img of sample.images) {
        try {
          const uploaded = await downloadAndUploadImage(strapi, img.url, img.name);
          fotky.push(uploaded.id);
          console.log(`  ✓ Stiahnutý a uploadnutý: ${img.name}`);
        } catch (e: any) {
          console.warn(`  ⚠ Nepodarilo sa stiahnuť ${img.name}: ${e.message}`);
        }
      }
      await strapi.documents('api::aktualita.aktualita').create({
        data: {
          nazov: sample.nazov,
          obsah: sample.obsah,
          datum: sample.datum,
          typAktivity: sample.typAktivity as any,
          hradiskoSlug: sample.hradiskoSlug,
          zvyraznene: sample.zvyraznene,
          fotky: fotky.length > 0 ? fotky : undefined,
        },
        status: 'published',
      });
      console.log(`  ✅ Aktualita: ${sample.nazov}`);
    } catch (e: any) {
      console.error(`  ❌ Zlyhala aktualita "${sample.nazov}": ${e.message}`);
    }
  }
  console.log('✅ Ukážkové aktuality pridané.');
}

/**
 * Sets up public permissions for blog API endpoints
 */
async function setupPublicPermissions(strapi: Core.Strapi) {
  const publicRole = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'public' },
  });

  if (!publicRole) {
    console.log('⚠️ Public role not found, skipping permissions setup');
    return;
  }

  const permissions = [
    // Blog posts
    { action: 'api::blog-post.blog-post.find' },
    { action: 'api::blog-post.blog-post.findOne' },
    // Blog categories
    { action: 'api::blog-category.blog-category.find' },
    { action: 'api::blog-category.blog-category.findOne' },
    // Blog tags
    { action: 'api::blog-tag.blog-tag.find' },
    { action: 'api::blog-tag.blog-tag.findOne' },
    // Aktuality
    { action: 'api::aktualita.aktualita.find' },
    { action: 'api::aktualita.aktualita.findOne' },
    // Blog comments: návštevník vie POST nový komentár + GET schválené (admin moderation cez controller)
    { action: 'api::blog-comment.blog-comment.create' },
    { action: 'api::blog-comment.blog-comment.find' },
    { action: 'api::blog-comment.blog-comment.findOne' },
  ];

  for (const perm of permissions) {
    const existingPermission = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: {
        action: perm.action,
        role: publicRole.id,
      },
    });

    if (!existingPermission) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: {
          action: perm.action,
          role: publicRole.id,
        },
      });
      console.log(`  ✓ Created public permission: ${perm.action}`);
    }
  }

  console.log('🔓 Public API permissions configured');
}

/**
 * Oprávnenia pre prihlásených (profil, notifikácie, zdieľania, push).
 * Grantuje sa VŠETKÝM ne-public rolám (Member aj staff `authenticated`) — moderačné
 * akcie (moderation-warning.create) si staff-only aj tak stráži controller.
 * Idempotentné: existujúce permission preskočí.
 */
async function setupMemberPermissions(strapi: Core.Strapi) {
  const roles = await strapi.db.query('plugin::users-permissions.role').findMany({
    where: { type: { $ne: 'public' } },
  });
  if (!roles?.length) {
    console.log('⚠️ Žiadne ne-public roly, preskakujem member permissions');
    return;
  }

  const actions = [
    'api::notification.notification.mine',
    'api::notification.notification.unreadCount',
    'api::notification.notification.markAllRead',
    'api::notification.notification.markRead',
    'api::share.share.create',
    'api::share.share.mine',
    'api::push-subscription.push-subscription.subscribe',
    'api::push-subscription.push-subscription.unsubscribe',
    'api::moderation-warning.moderation-warning.create',
    // vlastný účet/profil
    'api::account.account.getMe',
    'api::account.account.updateMe',
    'api::account.account.deleteMe',
    // vlastný komentár – zabezpečí, že Member rola má aj tieto po čistej inštalácii
    'api::blog-comment.blog-comment.update',
    'api::blog-comment.blog-comment.delete',
    'api::blog-comment.blog-comment.mine',
    'api::blog-comment.blog-comment.mineAll',
    'api::blog-comment.blog-comment.like',
    'api::blog-comment.blog-comment.unlike',
    // reakcie (lajky/obľúbené)
    'api::reaction.reaction.create',
    'api::reaction.reaction.delete',
    'api::reaction.reaction.find',
    'api::reaction.reaction.minePosts',
    'api::reaction.reaction.minePhotos',
    // vlastné foto-komentáre (profil → Moje komentáre) + základ galérie
    'api::photo-comment.photo-comment.mineAll',
    'api::photo-comment.photo-comment.find',
    'api::photo-comment.photo-comment.create',
    'api::photo-comment.photo-comment.update',
    'api::photo-comment.photo-comment.delete',
    // upload — aby si člen vedel nahrať vlastný avatar (POST /api/upload)
    'plugin::upload.content-api.upload',
  ];

  for (const role of roles) {
    for (const action of actions) {
      const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
        where: { action, role: role.id },
      });
      if (!existing) {
        await strapi.db.query('plugin::users-permissions.permission').create({
          data: { action, role: role.id },
        });
        console.log(`  ✓ ${role.type}: ${action}`);
      }
    }
  }
  console.log('🔐 Member/staff permissions configured');
}

/**
 * Správa používateľov v admine — LEN pre built-in rolu `authenticated` (staff).
 * NIE pre custom rolu Member, inak by hocijaký prihlásený člen mohol mazať účty.
 * Grantuje find/update/destroy na plugin::users-permissions.user.
 * Idempotentné: existujúce (find/update pridané ručne) preskočí, doplní destroy.
 */
async function setupStaffUserPermissions(strapi: Core.Strapi) {
  const staffRole = await strapi.db.query('plugin::users-permissions.role').findOne({
    where: { type: 'authenticated' },
  });
  if (!staffRole) {
    console.log('⚠️ Rola „authenticated" (staff) nenájdená, preskakujem user-management permissions');
    return;
  }

  const actions = [
    'plugin::users-permissions.user.find',
    'plugin::users-permissions.user.update',
    'plugin::users-permissions.user.destroy',
    // Moderácia komentárov k fotkám (galéria) — staff vidí všetky statusy a smie
    // meniť status / mazať (controller photo-comment si staff overuje sám).
    'api::photo-comment.photo-comment.find',
    'api::photo-comment.photo-comment.update',
    'api::photo-comment.photo-comment.delete',
  ];

  for (const action of actions) {
    const existing = await strapi.db.query('plugin::users-permissions.permission').findOne({
      where: { action, role: staffRole.id },
    });
    if (!existing) {
      await strapi.db.query('plugin::users-permissions.permission').create({
        data: { action, role: staffRole.id },
      });
      console.log(`  ✓ staff: ${action}`);
    }
  }
  console.log('🛡️  Staff user-management + photo-comment moderation permissions configured');
}

/**
 * Po potvrdení e-mailu (a resete hesla) presmeruje používateľa na FRONTEND,
 * nie na backend IP. Bez toho users-permissions po potvrdení skončí na server.url.
 * Idempotentné: nastaví len ak sa líši.
 */
async function setupAuthRedirects(strapi: Core.Strapi) {
  const frontend = process.env.FRONTEND_URL || 'https://webdesignforhradiskask.vercel.app';
  const store = strapi.store({ type: 'plugin', name: 'users-permissions' });
  const advanced: any = await store.get({ key: 'advanced' });
  if (!advanced) {
    console.log('⚠️ users-permissions advanced settings nenájdené, preskakujem redirect');
    return;
  }
  const desired = `${frontend}/prihlasenie?potvrdene=1`;
  if (advanced.email_confirmation_redirection !== desired) {
    advanced.email_confirmation_redirection = desired;
    await store.set({ key: 'advanced', value: advanced });
    console.log(`  ✓ email_confirmation_redirection = ${desired}`);
  } else {
    console.log('  ↷ email_confirmation_redirection už nastavené');
  }
}

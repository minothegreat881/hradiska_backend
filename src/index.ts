import type { Core } from '@strapi/strapi';

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
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

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
  },
};

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

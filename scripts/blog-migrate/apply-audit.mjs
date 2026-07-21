/**
 * Aplikuje audit súbory na intermediate a vytvorí out/<slug>.final.json na upload:
 *   1) grammar.json (before→after) → nahradí v text-nodoch content.rich-text
 *      (dobové citáty/quote-blocky sa netýkajú — tie nie sú rich-text)
 *   2) timeline.json → injektuje blogPost.keyFacts + blogPost.timeline
 *   3) kategória z out_completion-queue.json → blogPost.category (documentId)
 *
 * Použitie: node apply-audit.mjs <interSlug>
 * Vypíše štatistiku (koľko grammar zmien sa aplikovalo/nenašlo — nenájdené = span
 * cez viac nodov, treba pozrieť ručne).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'out');

const CAT_ID = {
  'kniezacie-sidla': 'l148rpkbsf47iy63jb0afpwn', 'mocenske-centra': 'iei9y9c9x3fd4yy1z6uz6osz',
  'strazna-funkcia': 'xl5emzcwsvq6m9hzy66avvmt', 'refugia': 'ju7qzoselv8vtk40oiddwps8',
  'staroveke-sidla': 'pc1i0qyu1ghzecz9ntunboof', 'ostatne': 'vophy6w40xd2rak2z5hr55yg',
  'vseobecne-o-hradiskach': 'u4sopv9mmxstlicww25pldjc', 'svatyne-a-sakralne-objekty': 'v1w38fn24cvwd18r9c538wzk',
  'povesti': 'gkl6r8p9t71feu4wxt6dclua', 'listiny-a-pisomne-zdroje': 'skof8do5athszi97mp2wkj3u',
  'odborne-texty': 'xffbpfyel46l2xro9s7hwm8d', '3d-modely': 'dv132j3g3ek629nwpmbnugun',
  'aktuality': 'u2b10w6rht97aijttkdja2s2', 'informacne-tabule': 'p35lgrkwzfg3vc0y6ngz9xun',
};

const slug = process.argv[2];
if (!slug) { console.error('Použi: node apply-audit.mjs <interSlug>'); process.exit(1); }

const interPath = resolve(OUT, `${slug}.intermediate.json`);
if (!existsSync(interPath)) { console.error('chýba intermediate:', slug); process.exit(1); }
const j = JSON.parse(readFileSync(interPath, 'utf8'));
const bp = j.blogPost;

// 1) grammar
let applied = 0; const notFound = [];
if (existsSync(resolve(OUT, `${slug}.grammar.json`))) {
  const changes = JSON.parse(readFileSync(resolve(OUT, `${slug}.grammar.json`), 'utf8')).changes || [];
  for (const ch of changes) {
    if (!ch.before || ch.after == null) continue;
    let hit = false;
    for (const b of bp.blocks || []) {
      if (b.__component !== 'content.rich-text') continue;
      for (const node of b.body || []) {
        for (const c of node.children || []) {
          if (typeof c.text === 'string' && c.text.includes(ch.before)) {
            c.text = c.text.split(ch.before).join(ch.after); hit = true;
          }
        }
      }
    }
    // aj excerpt a captions (cross-field)
    if (typeof bp.excerpt === 'string' && bp.excerpt.includes(ch.before)) { bp.excerpt = bp.excerpt.split(ch.before).join(ch.after); hit = true; }
    for (const b of bp.blocks || []) if (b.__component === 'content.image-block' && typeof b.caption === 'string' && b.caption.includes(ch.before)) { b.caption = b.caption.split(ch.before).join(ch.after); hit = true; }
    if (hit) applied++; else notFound.push(ch.before.slice(0, 45));
  }
}

// 1b) sanitizuj neplatné odkazy v tele (Strapi blocks odmieta url="#"/prázdne):
//     link s neplatnou url → rozbalí sa na obyčajný text (zachová text, zruší odkaz).
let unwrapped = 0;
const badUrl = (u) => !u || u === '#' || /^(#|javascript:|mailto:\s*$)/i.test(u) || !/^(https?:\/\/|\/)/i.test(u);
for (const b of bp.blocks || []) {
  if (b.__component !== 'content.rich-text') continue;
  for (const node of b.body || []) {
    if (!Array.isArray(node.children)) continue;
    node.children = node.children.map((c) => {
      if (c && c.type === 'link' && badUrl(c.url)) {
        unwrapped++;
        return { type: 'text', text: (c.children || []).map((x) => x.text || '').join('') };
      }
      return c;
    });
  }
}

// 2) timeline + keyFacts
if (existsSync(resolve(OUT, `${slug}.timeline.json`))) {
  const t = JSON.parse(readFileSync(resolve(OUT, `${slug}.timeline.json`), 'utf8'));
  bp.keyFacts = t.keyFacts || [];
  bp.timeline = t.timeline || [];
}

// 3) kategória
let catSlug = null;
const qPath = resolve(__dirname, '..', '..', '..', 'hradiska-migration', 'out_completion-queue.json');
if (existsSync(qPath)) {
  const item = JSON.parse(readFileSync(qPath, 'utf8')).items.find((i) => (i.interSlug || i.slug) === slug);
  if (item) catSlug = item.category;
}
const catId = CAT_ID[catSlug];

writeFileSync(resolve(OUT, `${slug}.final.json`), JSON.stringify(j, null, 2), 'utf8');
console.log(`[apply] ${slug}`);
console.log(`  grammar: ${applied} aplikovaných${notFound.length ? `, ${notFound.length} nenájdených (span cez nody?): ${notFound.join(' | ')}` : ''}`);
console.log(`  keyFacts: ${(bp.keyFacts || []).length}  timeline: ${(bp.timeline || []).length}`);
console.log(`  kategória: ${catSlug || '?'} → ${catId || 'CHÝBA ID'}`);
console.log(`  → out/${slug}.final.json ${catId ? `(upload: node upload.mjs --input=out/${slug}.final.json --category=${catId})` : ''}`);

#!/usr/bin/env node
/**
 * text-only-sync.mjs — samostatný nástroj, MIMO hlavný upload.mjs pipeline.
 *
 * Účel: po gramatickej korektúre (grammar-sk agent) synchronizovať OPRAVENÝ TEXT
 * na živý Strapi článok bez toho, aby sa čokoľvek dialo s obrázkami, galériou,
 * cover image, kategóriou, tagmi alebo lokalitou. Nikdy nesťahuje ani nenahráva
 * médiá — preto nehrozí EBUSY pád ani duplicitné médiá v Media Library.
 *
 * Ako to funguje:
 *   1) GET živý článok (plný populate blocks) — zdroj pravdy pre všetko NE-textové
 *      (image id, gallery, position/width/aspectRatio a pod.).
 *   2) Načíta opravenú verziu z out/<slug>.intermediate.json — zdroj pravdy pre TEXT.
 *   3) Pre každý blok v dynamiczone spáruje živý blok s opraveným PODĽA INDEXU a typu
 *      komponentu. Ak sa počet blokov alebo poradie typov nezhoduje, celý článok
 *      sa PRESKOČÍ s chybou (radšej nič neurobiť ako hádať štruktúru).
 *   4) Skopíruje LEN whitelistnuté textové polia z opravenej verzie; všetko ostatné
 *      (image, gallery, images[], position, width, aspectRatio, objectPosition,
 *      showCaption, rounded, shadow, provider, embedId, url v embed) berie zo ŽIVÉHO bloku.
 *   5) PUT len polia: title, excerpt, authorName, blocks, keyFacts, timeline.
 *      coverImage/gallery/tags/category/location sa v payloade vôbec nespomínajú →
 *      Strapi partial update ich necháva presne tak, ako sú.
 *   6) Po PUT-e over, že sa gallery.length a coverImage.id NEZMENILI (safety-net).
 *
 * Prenositeľnosť na iné weby: uprav FIELD_WHITELIST nižšie podľa cieľovej schémy
 * komponentov. Zvyšok (fetch-merge-clean-PUT-verify) je univerzálny.
 *
 * Použitie:
 *   node scripts/blog-migrate/text-only-sync.mjs --input=out/<slug>.intermediate.json --dry-run=true
 *   node scripts/blog-migrate/text-only-sync.mjs --input=out/<slug>.intermediate.json --dry-run=false
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.join('=') || 'true'];
  })
);

const DEFAULT_INPUT = 'out/blatnohrad-pribinovo-sidlo-v-panonii.intermediate.json';
const INPUT_PATH = resolve(__dirname, args.input ?? DEFAULT_INPUT);
const DRY_RUN = args['dry-run'] !== 'false';
const STRAPI_URL = args.strapiUrl ?? 'http://localhost:1337';
const STRAPI_TOKEN = args.token ?? process.env.STRAPI_TOKEN ?? null;
const AUTH_HEADERS = STRAPI_TOKEN ? { Authorization: `Bearer ${STRAPI_TOKEN}` } : {};

if (!STRAPI_TOKEN) {
  console.warn('[warn] STRAPI_TOKEN nie je nastavený — PUT pravdepodobne skončí 403.');
}

// ---------------------------------------------------------------------------
// Field whitelist — UPRAV pri nasadení na iný web/inú schému.
// Kľúč = __component. Hodnota = zoznam textových polí braných z OPRAVENEJ verzie.
// Všetko, čo tu nie je vymenované, sa vždy preberá zo ŽIVÉHO bloku nezmenené.
// ---------------------------------------------------------------------------
const TEXT_FIELDS_BY_COMPONENT = {
  'content.rich-text': ['body'],
  'content.quote-block': ['text', 'author', 'source'],
  'content.poem': ['text', 'title', 'author', 'source'],
  'content.sources': ['title', 'intro', 'items'],
  'content.image-block': ['alt', 'caption'],
  'content.embed': ['caption'],
  'content.image-gallery': [], // čisto médiá, žiadne textové pole
};

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
async function strapiGet(path) {
  const res = await fetch(`${STRAPI_URL}${path}`, { headers: { ...AUTH_HEADERS } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

async function strapiPutJson(path, data) {
  const res = await fetch(`${STRAPI_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    body: JSON.stringify({ data }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${body.slice(0, 800)}`);
  return JSON.parse(body);
}

// ---------------------------------------------------------------------------
// Block merge — preserves everything non-text from LIVE, only text from CORRECTED
// ---------------------------------------------------------------------------
function reduceMedia(mediaField) {
  // Strapi write-shape needs numeric id(s), not the full populated media object.
  if (Array.isArray(mediaField)) return mediaField.map((m) => (m?.id ?? m));
  if (mediaField && typeof mediaField === 'object') return mediaField.id ?? null;
  return mediaField ?? null;
}

function mergeBlock(liveBlock, correctedBlock, index) {
  const comp = liveBlock.__component;
  if (!correctedBlock || correctedBlock.__component !== comp) {
    throw new Error(
      `Blok #${index}: nezhoda komponentu — živý="${comp}" vs opravený="${correctedBlock?.__component ?? 'CHÝBA'}"`
    );
  }

  const textFields = TEXT_FIELDS_BY_COMPONENT[comp];
  if (textFields === undefined) {
    throw new Error(`Blok #${index}: neznámy komponent "${comp}" — pridaj ho do TEXT_FIELDS_BY_COMPONENT`);
  }

  switch (comp) {
    case 'content.image-block':
      return {
        __component: comp,
        image: reduceMedia(liveBlock.image),
        alt: correctedBlock.alt ?? liveBlock.alt,
        caption: correctedBlock.caption ?? liveBlock.caption ?? null,
        position: liveBlock.position,
        pairWithNext: liveBlock.pairWithNext,
        width: liveBlock.width,
        aspectRatio: liveBlock.aspectRatio,
        objectPosition: liveBlock.objectPosition,
        showCaption: liveBlock.showCaption,
        rounded: liveBlock.rounded,
        shadow: liveBlock.shadow,
      };
    case 'content.image-gallery':
      return {
        __component: comp,
        images: reduceMedia(liveBlock.images),
        columns: liveBlock.columns,
      };
    case 'content.embed':
      return {
        __component: comp,
        provider: liveBlock.provider,
        embedId: liveBlock.embedId,
        url: liveBlock.url,
        caption: correctedBlock.caption ?? liveBlock.caption ?? null,
      };
    case 'content.sources':
      return {
        __component: comp,
        title: correctedBlock.title,
        intro: correctedBlock.intro ?? null,
        items: (correctedBlock.items ?? []).map((it) => ({ text: it.text, url: it.url ?? null })),
      };
    case 'content.rich-text':
      return { __component: comp, body: correctedBlock.body };
    case 'content.quote-block':
      return {
        __component: comp,
        text: correctedBlock.text,
        author: correctedBlock.author ?? null,
        source: correctedBlock.source ?? null,
      };
    case 'content.poem':
      return {
        __component: comp,
        text: correctedBlock.text,
        title: correctedBlock.title ?? null,
        author: correctedBlock.author ?? null,
        source: correctedBlock.source ?? null,
      };
    default:
      throw new Error(`Blok #${index}: komponent "${comp}" nemá definovanú merge logiku`);
  }
}

function diffText(label, before, after) {
  const b = JSON.stringify(before ?? null);
  const a = JSON.stringify(after ?? null);
  return b !== a ? `  • ${label}: ZMENENÉ` : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n=== TEXT-ONLY SYNC — ${DRY_RUN ? 'DRY RUN' : 'REAL WRITE'} ===\n`);
  console.log(`input: ${INPUT_PATH}`);

  const source = JSON.parse(readFileSync(INPUT_PATH, 'utf8'));
  const corrected = source.blogPost ?? source;
  const slug = corrected.slug;
  if (!slug) throw new Error('Vstupný súbor neobsahuje slug.');

  console.log(`slug: ${slug}`);

  // -- 1) Fetch živý článok ---------------------------------------------------
  const liveRes = await strapiGet(
    `/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slug)}` +
      `&pagination[pageSize]=1&publicationState=preview` +
      `&populate[blocks][populate]=*&populate[keyFacts]=true&populate[timeline]=true` +
      `&populate[gallery]=true&populate[coverImage]=true`
  );
  const live = liveRes.data?.[0];
  if (!live) throw new Error(`Článok so slugom "${slug}" na živom Strapi neexistuje — text-only sync je len pre PUT na existujúci článok.`);

  console.log(`documentId: ${live.documentId}`);

  const liveBlocks = live.blocks ?? [];
  const correctedBlocks = corrected.blocks ?? [];

  if (liveBlocks.length !== correctedBlocks.length) {
    throw new Error(
      `Počet blokov sa nezhoduje (živý=${liveBlocks.length}, opravený=${correctedBlocks.length}). ` +
        `Grammar-sk agent nesmie meniť štruktúru blokov — over ručne pred syncom.`
    );
  }

  // -- 2) Merge bloky ----------------------------------------------------------
  const mergedBlocks = liveBlocks.map((lb, i) => mergeBlock(lb, correctedBlocks[i], i));

  // -- 3) Zostav payload — LEN textové polia -----------------------------------
  const payload = {
    title: corrected.title ?? live.title,
    excerpt: corrected.excerpt ?? live.excerpt ?? null,
    authorName: corrected.authorName ?? live.authorName ?? null,
    blocks: mergedBlocks,
    keyFacts: (corrected.keyFacts ?? []).map((k) => ({ label: k.label, value: k.value, icon: k.icon })),
    timeline: (corrected.timeline ?? []).map((t) => ({
      year: t.year,
      title: t.title,
      description: t.description ?? null,
      type: t.type,
    })),
  };

  // -- 4) Diff report ------------------------------------------------------------
  console.log('\n--- Diff (čo sa mení) ---');
  const diffs = [
    diffText('title', live.title, payload.title),
    diffText('excerpt', live.excerpt, payload.excerpt),
    diffText('authorName', live.authorName, payload.authorName),
    diffText('keyFacts', live.keyFacts, payload.keyFacts),
    diffText('timeline', live.timeline, payload.timeline),
  ].filter(Boolean);

  liveBlocks.forEach((lb, i) => {
    const before = TEXT_FIELDS_BY_COMPONENT[lb.__component].map((f) => lb[f]);
    const after = TEXT_FIELDS_BY_COMPONENT[lb.__component].map((f) => mergedBlocks[i][f]);
    const d = diffText(`blocks[${i}] (${lb.__component})`, before, after);
    if (d) diffs.push(d);
  });

  if (diffs.length === 0) {
    console.log('  (žiadne textové zmeny — živý obsah už zodpovedá opravenej verzii)');
  } else {
    diffs.forEach((d) => console.log(d));
  }
  console.log(`\nCelkovo zmenených polí: ${diffs.length}`);

  // -- 5) Safety net: potvrď, že médiá zostanú netknuté ---------------------------
  const galleryBefore = (live.gallery ?? []).map((g) => g.id).sort();
  const coverBefore = live.coverImage?.id ?? null;

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Nič sa nezapisuje. Spusti s --dry-run=false pre reálny zápis.\n');
    return;
  }

  // -- 6) PUT ----------------------------------------------------------------
  console.log('\nZapisujem PUT...');
  const result = await strapiPutJson(`/api/blog-posts/${live.documentId}`, payload);
  console.log(`✓ PUT OK — documentId=${result.data?.documentId}`);

  // -- 7) Verify: obrázky sa NESMELI zmeniť ------------------------------------
  const verifyRes = await strapiGet(
    `/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slug)}` +
      `&pagination[pageSize]=1&publicationState=preview&populate[gallery]=true&populate[coverImage]=true`
  );
  const after = verifyRes.data?.[0];
  const galleryAfter = (after.gallery ?? []).map((g) => g.id).sort();
  const coverAfter = after.coverImage?.id ?? null;

  const galleryOk = JSON.stringify(galleryBefore) === JSON.stringify(galleryAfter);
  const coverOk = coverBefore === coverAfter;

  if (!galleryOk || !coverOk) {
    console.error('\n⚠️  POZOR: obrázky sa napriek text-only syncu zmenili!');
    console.error(`   gallery pred: [${galleryBefore}]  po: [${galleryAfter}]  ok=${galleryOk}`);
    console.error(`   coverImage pred: ${coverBefore}  po: ${coverAfter}  ok=${coverOk}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ Overené: gallery (${galleryAfter.length} súborov) aj coverImage nezmenené.`);
  }
}

main().catch((e) => {
  console.error(`\n✗ CHYBA: ${e.message}\n`);
  process.exitCode = 1;
});

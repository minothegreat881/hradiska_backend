/**
 * Fáza 2 — upload pipeline pre Blogger → Strapi.
 *
 * Režimy:
 *   --dry-run=true  (DEFAULT)  → nič neposiela. Vyrobí out/<slug>.payload.json.
 *   --dry-run=false            → reálny upload:
 *                                  1) stiahne obrázky (/s0/ → fallback /s1600/),
 *                                  2) SHA-256 dedup voči Media Library,
 *                                  3) POST /api/upload pre nové,
 *                                  4) resolve tag entity (lookup by slug, create-if-missing),
 *                                  5) GET /api/blog-posts?filters[slug] — POST nový alebo PUT-on-documentId,
 *                                  6) verify GET +populate=*, vypíše reálne polia z DB.
 *
 * Default vstup:  scripts/blog-migrate/out/blatnohrad-pribinovo-sidlo-v-panonii.intermediate.json
 * Default kategória: documentId "l148rpkbsf47iy63jb0afpwn" (Kniežacie sídla)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { decodeHTML as decodeHtmlEntities } from 'entities';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Načítaj premenné z hradiska-strapi/.env (STRAPI_TOKEN a spol.). Stačí token vložiť
// tam raz — každý ďalší upload ho použije automaticky bez zadávania cez CLI/shell.
// dotenv defaultne NEPREPÍŠE už existujúce env premenné, takže shell/CLI má prednosť.
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? 'true';
  }
  return out;
}

const args = parseArgs(process.argv);
const DEFAULT_INPUT = 'out/blatnohrad-pribinovo-sidlo-v-panonii.intermediate.json';
const DEFAULT_CATEGORY = 'l148rpkbsf47iy63jb0afpwn';
const STRAPI_URL = args.strapiUrl ?? 'http://localhost:1337';
const INPUT_PATH = resolve(__dirname, args.input ?? DEFAULT_INPUT);
const CATEGORY_DOC_ID = args.category ?? DEFAULT_CATEGORY;
const DRY_RUN = args['dry-run'] !== 'false';
const UPLOADS_DIR = resolve(__dirname, '..', '..', 'public', 'uploads');
// API token: cez --token=... alebo STRAPI_TOKEN env.
// Vytvor v admin: Settings → API Tokens → Create new (Full Access, Unlimited duration).
const STRAPI_TOKEN = args.token ?? process.env.STRAPI_TOKEN ?? null;
const AUTH_HEADERS = STRAPI_TOKEN ? { Authorization: `Bearer ${STRAPI_TOKEN}` } : {};

// -----------------------------------------------------------------------------
// MediaRegistry — dedup imageRefs do indexovaného poľa
// -----------------------------------------------------------------------------

class MediaRegistry {
  constructor() {
    this.byUrl = new Map();
    this.order = [];
  }
  register(ref, usedAs, caption) {
    if (!ref?.sourceUrl) return null;
    const key = ref.sourceUrl;
    let entry = this.byUrl.get(key);
    if (!entry) {
      entry = {
        index: this.order.length,
        ref,
        usedAs: [],
        caption: caption || ref.caption || null, // ref.caption nesie hodnotu z gallery dedup-u
      };
      this.byUrl.set(key, entry);
      this.order.push(key);
    } else {
      // Obohať caption ak prišiel neskôr (napr. coverImage bol bez, ale captioned-block má)
      const newCap = caption || ref.caption;
      if (newCap && !entry.caption) entry.caption = newCap;
    }
    entry.usedAs.push(usedAs);
    return entry.index;
  }
  placeholder(index) { return `<media-ref:${index}>`; }
  toArray() {
    return this.order.map((url) => {
      const e = this.byUrl.get(url);
      return {
        index: e.index,
        filename: e.ref.filename,
        preferredUrl: e.ref.sourceUrl,
        fallbackUrl: e.ref.fallbackUrl,
        bloggerAnchor: e.ref.blogger?.anchorHref,
        displayedDimensions: e.ref.blogger
          ? { width: e.ref.blogger.displayedWidth, height: e.ref.blogger.displayedHeight }
          : null,
        caption: e.caption,
        usedAs: e.usedAs,
      };
    });
  }
}

// -----------------------------------------------------------------------------
// Slugify pre tag resolution
// -----------------------------------------------------------------------------

function slugify(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeTitle(s) {
  return s.replace(/\s+/g, ' ').trim();
}

// -----------------------------------------------------------------------------
// Strapi REST helpers
// -----------------------------------------------------------------------------

async function strapiGet(path) {
  const res = await fetch(`${STRAPI_URL}${path}`, { headers: { ...AUTH_HEADERS } });
  const body = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

async function strapiPostJson(path, data) {
  const res = await fetch(`${STRAPI_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    body: JSON.stringify({ data }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

async function strapiPutJson(path, data) {
  const res = await fetch(`${STRAPI_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    body: JSON.stringify({ data }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body);
}

async function strapiUploadFile(buffer, filename, mimeType, caption) {
  // Retry pre transient network failures (Blogger CDN občas throttle / connection drop)
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const fd = new FormData();
      fd.append('files', new Blob([buffer], { type: mimeType }), filename);
      if (caption) {
        // Strapi upload plugin: `fileInfo` JSON pre metadata (caption/alt/name)
        fd.append(
          'fileInfo',
          JSON.stringify({ caption, alternativeText: caption, name: filename }),
        );
      }
      const res = await fetch(`${STRAPI_URL}/api/upload`, {
        method: 'POST',
        headers: { ...AUTH_HEADERS, Connection: 'close' },
        body: fd,
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`UPLOAD ${filename} → ${res.status}: ${body.slice(0, 500)}`);
      const json = JSON.parse(body);
      return Array.isArray(json) ? json[0] : json;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) {
        const wait = attempt * 1500;
        console.warn(`     [retry ${attempt}/3] upload ${filename} failed (${e.message?.slice(0, 60)}); wait ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

/** Aktualizuje metadata (caption, alternativeText) existujúceho media file.
 *  Strapi v5 upload endpoint: POST /api/upload?id=<id> s len `fileInfo` (bez `files`)
 *  aktualizuje metadata bez nahradenia binárneho obsahu. */
async function strapiUpdateFileMetadata(fileId, caption) {
  if (!caption) return null;
  const fd = new FormData();
  fd.append(
    'fileInfo',
    JSON.stringify({ caption, alternativeText: caption }),
  );
  const res = await fetch(`${STRAPI_URL}/api/upload?id=${fileId}`, {
    method: 'POST',
    headers: { ...AUTH_HEADERS, Connection: 'close' },
    body: fd,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`UPDATE-META ${fileId} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return await res.json();
}

// -----------------------------------------------------------------------------
// Image download (s0 → fallback s1600)
// -----------------------------------------------------------------------------

async function downloadImage(preferredUrl, fallbackUrl) {
  async function tryFetch(url, label) {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) {
          if (res.status === 404) return null;
          throw new Error(`HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        return { buffer: buf, mimeType: res.headers.get('content-type') || 'image/jpeg' };
      } catch (e) {
        lastErr = e;
        if (attempt < 3) {
          const wait = attempt * 1500;
          console.warn(`     [retry ${attempt}/3] download ${label} failed (${e.message?.slice(0, 60)}); wait ${wait}ms`);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    }
    throw lastErr;
  }

  // 1) Skús /s0/ (originál)
  try {
    const r = await tryFetch(preferredUrl, 's0');
    if (r && r.buffer.length > 1024) return { ...r, variant: 's0' };
  } catch (e) {
    // Fall through to fallback
  }
  // 2) Fallback /s1600/
  const r = await tryFetch(fallbackUrl, 's1600');
  if (!r) throw new Error(`Both /s0/ and /s1600/ failed for ${preferredUrl}`);
  return { ...r, variant: 's1600' };
}

// -----------------------------------------------------------------------------
// Dedup: SHA-256 voči existing Media Library
// -----------------------------------------------------------------------------

async function loadExistingMediaIndex() {
  // GET /api/upload/files vráti všetky media. Pre v5 to vyžaduje populate prípadne paginate.
  const out = { byHash: new Map(), files: [] };
  let page = 1;
  while (true) {
    const j = await strapiGet(`/api/upload/files?pagination[page]=${page}&pagination[pageSize]=100`);
    const items = Array.isArray(j) ? j : (j.results || j.data || []);
    if (!items.length) break;
    for (const f of items) out.files.push(f);
    if (items.length < 100) break;
    page++;
    if (page > 50) break;
  }
  return out;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// -----------------------------------------------------------------------------
// Tag resolver
// -----------------------------------------------------------------------------

async function resolveTag(name) {
  const slug = slugify(name);
  const found = await strapiGet(`/api/blog-tags?filters[slug][$eq]=${encodeURIComponent(slug)}`);
  const items = found.data || [];
  if (items.length > 0) {
    return { documentId: items[0].documentId, slug, name: items[0].name, action: 'reused' };
  }
  const created = await strapiPostJson('/api/blog-tags', { name, slug });
  return { documentId: created.data.documentId, slug, name: created.data.name, action: 'created' };
}

// -----------------------------------------------------------------------------
// Idempotent slug check
// -----------------------------------------------------------------------------

async function findExistingPost(slug) {
  const r = await strapiGet(
    `/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slug)}&pagination[pageSize]=1&publicationState=preview`,
  );
  const items = r.data || [];
  return items.length > 0 ? items[0] : null;
}

// -----------------------------------------------------------------------------
// buildPayload — z intermediate JSON do Strapi payload (s placeholdermi)
// -----------------------------------------------------------------------------

function buildPayload(intermediate, options) {
  const bp = intermediate.blogPost;
  const media = new MediaRegistry();

  let coverPlaceholder = null;
  if (bp.coverImage) {
    const idx = media.register(bp.coverImage, 'coverImage');
    if (idx !== null) coverPlaceholder = media.placeholder(idx);
  }

  const blocks = bp.blocks.map((b, bIdx) => {
    if (b.__component === 'content.image-block' && b.imageRef) {
      const idx = media.register(b.imageRef, `blocks[${bIdx}].image`, b.caption);
      return {
        __component: b.__component,
        image: idx !== null ? media.placeholder(idx) : null,
        alt: b.alt,
        caption: b.caption,
        position: b.position,
        pairWithNext: b.pairWithNext || false,
        showCaption: b.showCaption,
        width: b.width,
        aspectRatio: b.aspectRatio,
        objectPosition: b.objectPosition,
        rounded: b.rounded,
        shadow: b.shadow,
      };
    }
    if (b.__component === 'content.image-gallery' && Array.isArray(b.imageRefs)) {
      const images = b.imageRefs.map((r, i) => {
        const idx = media.register(r, `blocks[${bIdx}].images[${i}]`);
        return idx !== null ? media.placeholder(idx) : null;
      });
      return { __component: b.__component, images, columns: b.columns };
    }
    return b;
  });

  const location = bp.location
    ? {
        name: bp.location.name,
        latitude: bp.location.latitude,
        longitude: bp.location.longitude,
        region: bp.location.region,
        country: bp.location.country,
      }
    : null;

  const category = options.categoryDocumentId
    ? { connect: [{ documentId: options.categoryDocumentId }] }
    : null;

  const tagsPlaceholder = (bp.tags || []).map((name) => ({ name, _resolve: 'pending' }));

  // Top-level gallery: obrázky bez popisu (extract.mjs ich vyberá z článku do
  // bp.gallery zoznamu). Zaregistruj ich do MediaRegistry aby boli stiahnuté,
  // dedup zaistí MediaRegistry (rovnaký sourceUrl ako captioned/cover → rovnaký index).
  // Gallery: každý ref už nesie `caption` (z extract.mjs dedup-u). Register preto
  // s caption — MediaRegistry pri prvom uploade nastaví Strapi media.caption.
  const galleryPlaceholders = (bp.gallery || [])
    .map((r, i) => {
      const idx = media.register(r, `gallery[${i}]`, r.caption);
      return idx !== null ? media.placeholder(idx) : null;
    })
    .filter((v) => v !== null);

  const payload = {
    data: {
      title: normalizeTitle(bp.title),
      slug: bp.slug,
      excerpt: bp.excerpt,
      authorName: bp.authorName,
      featured: bp.featured,
      readingTime: bp.readingTime,
      publishedAt: bp.publishedAt,
      originalPublishedDate: bp.originalPublishedDate || bp.publishedAt,
      coverImage: coverPlaceholder,
      gallery: galleryPlaceholders, // obrázky bez popisu (Fotogaléria sekcia)
      category,
      tags: tagsPlaceholder,
      location,
      keyFacts: bp.keyFacts || [],
      timeline: bp.timeline || [],
      quotes: bp.quotes || [],
      blocks,
    },
  };

  return { payload, media };
}

// -----------------------------------------------------------------------------
// Notes
// -----------------------------------------------------------------------------

function buildNotes(intermediate, payload, mediaArray, options) {
  const bp = intermediate.blogPost;
  const notes = [];
  notes.push(`category = ${options.categoryDocumentId} (Kniežacie sídla). Natvrdo.`);
  if (bp.tags?.length) {
    notes.push(
      `tags (${bp.tags.length}): ${JSON.stringify(bp.tags)}. Pred POST sa resolveuje po slugu (create-if-missing).`,
    );
  }
  notes.push(`Idempotencia: pred POST sa overí slug="${bp.slug}". Ak existuje → PUT na documentId, inak POST.`);
  if (intermediate.$meta?.commentCount > 0) {
    notes.push(
      `commentCount=${intermediate.$meta.commentCount}: komentáre v $meta.comments, NIE v payloade — Strapi schéma nemá komentárový komponent.`,
    );
  }
  if (payload.data.location?.country && payload.data.location.country !== 'Slovensko') {
    notes.push(`location.country="${payload.data.location.country}" (prepíše Strapi default "Slovensko").`);
  }
  if (payload.data.location && !payload.data.location.region) {
    notes.push(`location.region=null (Fáza 0 #4 — v texte nestojí doslovný názov regiónu).`);
  }
  if (intermediate.$meta?.coverImageNeedsReview) {
    notes.push(
      `coverImageNeedsReview=true: prvý obrázok ("${bp.coverImage?.filename}") auto-zvolený. Over v admin.`,
    );
  }
  notes.push(
    `Plánovaný download obrázkov: ${mediaArray.length} unikátnych. /s0/ → fallback /s1600/, SHA-256 dedup, POST /api/upload.`,
  );
  notes.push(`gallery: [] (prázdne — obrázky sú len v blocks, žiadny top-level top duplikát).`);
  notes.push(`title: normalizovaný na single space.`);
  notes.push(`content.embed schéma v DB (components_content_embeds tabuľka existuje — Strapi dev hot-reload zachytil).`);
  return notes;
}

// -----------------------------------------------------------------------------
// Real upload (--dry-run=false)
// -----------------------------------------------------------------------------

async function doRealUpload(intermediate, payload, mediaArray, options) {
  console.log('\n=== REAL UPLOAD — Blatnohrad ===\n');
  if (!STRAPI_TOKEN) {
    console.warn(
      '[warn] STRAPI_TOKEN nie je nastavený. Strapi Public role pravdepodobne vráti 403 na POST/PUT.\n' +
        '       Vytvor token: Strapi admin → Settings → API Tokens → Create new token (Full Access, Unlimited).\n' +
        '       Použi: --token=<token>  alebo  STRAPI_TOKEN=<token> node scripts/blog-migrate/upload.mjs --dry-run=false\n',
    );
  }

  // -- Step 1: Tag resolve ---------------------------------------------------
  console.log('[1/5] Tag resolve...');
  const tagDocIds = [];
  for (const t of intermediate.blogPost.tags || []) {
    const r = await resolveTag(t);
    tagDocIds.push(r.documentId);
    console.log(`     "${t}" → slug="${r.slug}" documentId=${r.documentId} (${r.action})`);
  }

  // -- Step 2: Load existing media + sha256 dedup ---------------------------
  console.log('\n[2/5] Load existing Media Library...');
  const existing = await loadExistingMediaIndex();
  console.log(`     existing files: ${existing.files.length}`);

  // Snímka pred uploadom — počítame fyzické súbory v public/uploads/
  const beforeUploadCount = readdirSync(UPLOADS_DIR).filter((n) => !n.startsWith('.')).length;
  console.log(`     public/uploads/ before: ${beforeUploadCount} files`);

  // -- Step 3: Download + SHA-256 dedup + upload --------------------------
  console.log(`\n[3/5] Download + upload obrázkov (${mediaArray.length})...`);
  console.log(`     Stratégia: continue-on-error, multi-pass — failed items skúsi opätovne.`);

  // BUG (objavené pri spätnej kontrole integrity Mocenské centrá batchu): pôvodná
  // verzia tejto funkcie robila dedup PODĽA MENA SÚBORU (`existingByName`) ako
  // "pragmatický pre-check" bez sťahovania — komentár zdôvodňoval, že prvých 54
  // súborov (Blatnohrad batch) nemalo kolízne mená, takže je to bezpečné. To sa
  // rozpadlo hneď ako viac článkov od rôznych autorov použilo generické mená
  // (`a.jpg`, `mapa.jpg`, `IMG_4111.JPG`...) — 20 rôznych súborov sa takto omylom
  // "recyklovalo" naprieč 12+ nesúvisiacimi článkami (napr. Ducové aj Vyšný Kubín
  // dostali FOTOGRAFIE zo Spišských Tomášoviec, vrátane ich popisov). Dedup teraz
  // ide výhradne cez SHA-256 obsahu — vždy sa stiahne, spočíta hash, a až ten sa
  // porovná (voči tomuto behu AJ voči perzistentnému indexu naprieč všetkými
  // predošlými behmi — Strapi `hash` pole nie je SHA-256, takže cudziu Media
  // Library takto lacno prehľadať nevieme).
  const shaIndexPath = resolve(__dirname, 'out', '_media-sha256-index.json');
  const shaIndex = existsSync(shaIndexPath) ? JSON.parse(readFileSync(shaIndexPath, 'utf8')) : {};
  const saveShaIndex = () => writeFileSync(shaIndexPath, JSON.stringify(shaIndex, null, 1));

  const mediaIdByIndex = []; // mediaArray.index → strapi media id
  const uploadLog = [];
  const failedThisPass = [];

  async function processItem(m) {
    let dl;
    try {
      dl = await downloadImage(m.preferredUrl, m.fallbackUrl);
    } catch (e) {
      console.error(`     [${m.index.toString().padStart(2)}] ${m.filename} → DOWNLOAD FAILED: ${e.message}`);
      return { ok: false, reason: 'download-failed' };
    }
    const sha = sha256(dl.buffer);
    const localDupe = uploadLog.find((u) => u.sha === sha);
    if (localDupe) {
      mediaIdByIndex[m.index] = localDupe.mediaId;
      uploadLog.push({ index: m.index, filename: m.filename, action: 'reused-by-sha', variant: dl.variant, mediaId: localDupe.mediaId, sha });
      console.log(`     [${m.index.toString().padStart(2)}] ${m.filename} → REUSE by SHA (${dl.variant}, id=${localDupe.mediaId})`);
      return { ok: true };
    }
    const persisted = shaIndex[sha];
    if (persisted) {
      mediaIdByIndex[m.index] = persisted.mediaId;
      uploadLog.push({ index: m.index, filename: m.filename, action: 'reused-by-sha-persisted', variant: dl.variant, mediaId: persisted.mediaId, sha });
      console.log(`     [${m.index.toString().padStart(2)}] ${m.filename} → REUSE by SHA, prior run (${dl.variant}, id=${persisted.mediaId})`);
      return { ok: true };
    }
    try {
      const uploaded = await strapiUploadFile(dl.buffer, m.filename, dl.mimeType, m.caption);
      mediaIdByIndex[m.index] = uploaded.id;
      uploadLog.push({ index: m.index, filename: m.filename, action: 'uploaded', variant: dl.variant, size: dl.buffer.length, mediaId: uploaded.id, sha });
      shaIndex[sha] = { mediaId: uploaded.id, filename: m.filename };
      saveShaIndex();
      console.log(
        `     [${m.index.toString().padStart(2)}] ${m.filename} → ${dl.variant} (${(dl.buffer.length / 1024).toFixed(1)} KB) → media id=${uploaded.id}`,
      );
      await new Promise((r) => setTimeout(r, 1000));
      return { ok: true };
    } catch (e) {
      console.error(`     [${m.index.toString().padStart(2)}] ${m.filename} → UPLOAD FAILED (will retry next pass): ${e.message?.slice(0, 80)}`);
      // Dlhšia pauza po fail — daj Strapi/socket čas
      await new Promise((r) => setTimeout(r, 3000));
      return { ok: false, reason: 'upload-failed' };
    }
  }

  // Multi-pass: opakuje len failnuté downloady/uploady (žiadny "existing index" refresh
  // netreba — dedup je teraz sha-based cez shaIndex, ktorý sa aktualizuje priebežne).
  let remaining = [...mediaArray];
  for (let pass = 1; pass <= 6 && remaining.length > 0; pass++) {
    if (pass > 1) {
      console.log(`\n     === PASS ${pass} (${remaining.length} remaining) — retry po chybe... ===`);
      await new Promise((r) => setTimeout(r, 2000));
    }
    const nextRemaining = [];
    for (const m of remaining) {
      const r = await processItem(m);
      if (!r.ok) nextRemaining.push(m);
    }
    remaining = nextRemaining;
  }

  if (remaining.length > 0) {
    console.error(`\n[err] ${remaining.length} obrázkov sa po 6 passes nepodarilo nahrať:`);
    for (const m of remaining) console.error(`        [${m.index}] ${m.filename}`);
    throw new Error(`Upload incomplete: ${remaining.length} obrázkov failed.`);
  }

  // -- Step 3b: Update metadata pre REUSE-existing files čo dostali caption ----
  // (nové uploady už majú caption nastavený cez fileInfo pri POST /api/upload)
  const captionUpdates = [];
  for (const m of mediaArray) {
    if (!m.caption) continue;
    const mediaId = mediaIdByIndex[m.index];
    if (!mediaId) continue;
    const logEntry = uploadLog.find((u) => u.index === m.index);
    if (logEntry?.action !== 'uploaded') {
      // REUSE — POST /api/upload?id=<id> s fileInfo bez files (update only metadata)
      try {
        await strapiUpdateFileMetadata(mediaId, m.caption);
        captionUpdates.push({ index: m.index, mediaId, caption: m.caption });
      } catch (e) {
        console.warn(`     [warn] caption update failed for media ${mediaId}: ${e.message?.slice(0, 100)}`);
      }
    }
  }
  if (captionUpdates.length > 0) {
    console.log(`     ✓ ${captionUpdates.length} REUSE media files got caption update.`);
  }

  // -- Step 4: Substitute media-refs in payload --------------------------
  console.log('\n[4/5] Substitúcia <media-ref:N> reálnymi id...');
  function substitute(value) {
    if (typeof value === 'string') {
      const m = value.match(/^<media-ref:(\d+)>$/);
      if (m) return mediaIdByIndex[parseInt(m[1], 10)];
      return value;
    }
    if (Array.isArray(value)) return value.map(substitute);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = substitute(v);
      return out;
    }
    return value;
  }
  const finalData = substitute(payload.data);

  // Tags substitúcia: _resolve:'pending' placeholder → connect documentIds
  finalData.tags = tagDocIds.length ? { connect: tagDocIds.map((d) => ({ documentId: d })) } : [];

  // -- Step 4b: Aplikuj manual overrides z out/<slug>.overrides.json ----------
  // Ten súbor je voliteľný — ak existuje, jeho top-level kľúče sa zlúčia DO finalData
  // ako posledný krok pred PUT/POST. Použitie: prepíš coverImage media id, vlastný excerpt,
  // location.name doplnenie, prípadne aj keyFacts/timeline/category — bez toho aby
  // ich auto-flow stratil pri ďalšom upload behu. shallow merge na top-level fields,
  // pre nested objekty (location) urobíme jednu úroveň hlbšie.
  const overridesPath = resolve(dirname(INPUT_PATH), `${intermediate.blogPost.slug}.overrides.json`);
  if (existsSync(overridesPath)) {
    const overrides = JSON.parse(readFileSync(overridesPath, 'utf8'));
    // Špeciálny meta-field: blocksPrepend — pole blokov ktoré sa pripoja PRED auto-blocks.
    // Užitočné na manuálny úvodný odsek (drop cap), upozornenie, atď. bez prepísania
    // celých blocks z extract.
    if (Array.isArray(overrides.blocksPrepend)) {
      finalData.blocks = [...overrides.blocksPrepend, ...(finalData.blocks || [])];
      delete overrides.blocksPrepend;
    }
    // Špeciálny meta-field: blocksAppend — pole blokov ktoré sa pripoja ZA auto-blocks.
    if (Array.isArray(overrides.blocksAppend)) {
      finalData.blocks = [...(finalData.blocks || []), ...overrides.blocksAppend];
      delete overrides.blocksAppend;
    }
    // Špeciálny meta-field: blocksInsertAt — vloženie blokov na pozíciu definovanú
    // markerom. Položka: { afterHeading: "<text>", offset: 1, block: {...} }.
    // `afterHeading` matchuje text heading-u (presná zhoda, case-sensitive). `offset`
    // určuje koľko blokov za heading-om sa vloží (default 1 = priamo po hlavičke).
    if (Array.isArray(overrides.blocksInsertAt)) {
      for (const item of overrides.blocksInsertAt) {
        if (!item?.block || !item?.afterHeading) continue;
        const idx = (finalData.blocks || []).findIndex(
          (b) =>
            b?.__component === 'content.rich-text' &&
            b.body?.[0]?.type === 'heading' &&
            b.body[0].children?.[0]?.text === item.afterHeading,
        );
        if (idx === -1) {
          console.log(`     ! blocksInsertAt: heading "${item.afterHeading}" nenájdený, preskakujem`);
          continue;
        }
        const offset = typeof item.offset === 'number' ? item.offset : 1;
        const insertPos = Math.min((finalData.blocks || []).length, idx + offset);
        finalData.blocks = [
          ...finalData.blocks.slice(0, insertPos),
          item.block,
          ...finalData.blocks.slice(insertPos),
        ];
      }
      delete overrides.blocksInsertAt;
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v) && finalData[k] && typeof finalData[k] === 'object') {
        finalData[k] = { ...finalData[k], ...v }; // shallow merge (napr. location)
      } else {
        finalData[k] = v;
      }
    }
    console.log(`     ✓ overrides applied (${overridesPath.split(/[\\/]/).pop()}): ${Object.keys(overrides).join(', ')}`);
  }

  // -- Step 5: Idempotent POST/PUT ---------------------------------------
  console.log('\n[5/5] Idempotent POST/PUT...');
  const slug = finalData.slug;
  const existingPost = await findExistingPost(slug);
  let result;
  if (existingPost) {
    console.log(`     existing post found: documentId=${existingPost.documentId}, PUT ...`);
    result = await strapiPutJson(`/api/blog-posts/${existingPost.documentId}`, finalData);
  } else {
    console.log(`     no existing post for slug="${slug}", POST ...`);
    result = await strapiPostJson('/api/blog-posts', finalData);
  }

  const documentId = result.data?.documentId;
  console.log(`     ✓ ${existingPost ? 'PUT' : 'POST'} OK — documentId=${documentId}`);

  // -- Step 6: Import blog-comments z $meta.comments (2-pass: create + threading) ---
  const sourceComments = intermediate.$meta?.comments || [];
  if (sourceComments.length > 0) {
    console.log(`\n[6/6] Import komentárov (${sourceComments.length}, 2-pass)...`);
    // Lookup existujúce komentáre tohto postu (dedup cez bloggerPostId)
    const existingComments = await strapiGet(
      `/api/blog-comments?filters[post][documentId][$eq]=${documentId}&filters[sourceBlogger][$eq]=true&pagination[pageSize]=200`,
    );
    // Map: bloggerPostId (číselný) → strapi documentId
    const bloggerIdToDocId = new Map();
    for (const ec of existingComments.data || []) {
      if (ec.sourceBloggerId) bloggerIdToDocId.set(ec.sourceBloggerId, ec.documentId);
    }

    // -- Pass 1: vytvorenie všetkých komentárov bez inReplyTo (zachytíme documentId) --
    console.log(`     Pass 1 — create/reuse:`);
    for (const c of sourceComments) {
      const key = c.bloggerPostId || c.id;
      if (bloggerIdToDocId.has(key)) {
        console.log(`       ${c.author}: REUSE (sourceBloggerId=${key.slice(-12)})`);
        continue;
      }
      // Blogger komentáre sú HTML — po odstránení tagov treba ešte dekódovať entity
      // (&quot; &amp; &lt; &gt; &#39; &nbsp;...), inak ostanú v texte surové ako "&quot;".
      // decodeHTML dekóduje &nbsp; na skutočný U+00A0 (nie medzeru) — normalizuj naspäť
      // na bežnú medzeru, konzistentne s NBSP_RE normalizáciou v extract.mjs.
      const cleanText = decodeHtmlEntities((c.content || '').replace(/<[^>]+>/g, ''))
        .replace(/ /g, ' ')
        .trim();
      try {
        const data = {
          authorName: c.author,
          authorProfile: c.authorProfile,
          content: cleanText,
          approved: true,
          sourceBlogger: true,
          sourceBloggerId: key, // číselný Blogger post-id (nie full tag — kvôli ľahšiemu lookup-u)
          originalDate: c.published,
          // inReplyTo nastavujeme až v Pass 2 keď máme všetky documentId k dispozícii
          post: documentId,
        };
        const r = await strapiPostJson('/api/blog-comments', data);
        const docId = r.data?.documentId;
        if (docId) bloggerIdToDocId.set(key, docId);
        console.log(`       ${c.author} (${c.published?.slice(0, 10)}): created id=${r.data?.id} docId=${docId}`);
      } catch (e) {
        console.error(`       ${c.author}: FAILED — ${e.message?.slice(0, 100)}`);
      }
    }

    // -- Pass 2: threading — nastav inReplyTo na parent documentId ---
    console.log(`     Pass 2 — threading:`);
    let threadingApplied = 0;
    for (const c of sourceComments) {
      if (!c.replyToBloggerId) continue;
      const parentDocId = bloggerIdToDocId.get(c.replyToBloggerId);
      const myDocId = bloggerIdToDocId.get(c.bloggerPostId || c.id);
      if (!parentDocId || !myDocId) {
        console.log(`       ${c.author}: SKIP (parent=${parentDocId || '?'} my=${myDocId || '?'})`);
        continue;
      }
      try {
        await strapiPutJson(`/api/blog-comments/${myDocId}`, { inReplyTo: parentDocId });
        console.log(`       ${c.author} → reply on parent docId=${parentDocId}`);
        threadingApplied++;
      } catch (e) {
        console.error(`       ${c.author}: PUT FAILED — ${e.message?.slice(0, 100)}`);
      }
    }
    console.log(`     ✓ ${threadingApplied} threading link(s) applied.`);
  }

  // -- Verify -------------------------------------------------------------
  console.log('\n=== VERIFY — GET /api/blog-posts?filters[slug][$eq]=...&populate=* ===\n');
  const verify = await strapiGet(
    `/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slug)}&populate=*`,
  );
  const post = verify.data?.[0];
  if (!post) {
    console.error('[err] verify failed: no post found by slug');
    return;
  }

  const blockCounts = {};
  for (const b of post.blocks || []) {
    blockCounts[b.__component] = (blockCounts[b.__component] || 0) + 1;
  }

  // Image filenames z blocks (rekurzia)
  const blockImages = [];
  for (const b of post.blocks || []) {
    if (b.image?.name) blockImages.push(b.image.name);
    if (Array.isArray(b.images)) for (const img of b.images) if (img?.name) blockImages.push(img.name);
  }

  console.log(`documentId:    ${post.documentId}`);
  console.log(`id:            ${post.id}`);
  console.log(`title:         ${post.title}`);
  console.log(`slug:          ${post.slug}`);
  console.log(`publishedAt:   ${post.publishedAt}`);
  console.log(`authorName:    ${post.authorName}`);
  console.log(`readingTime:   ${post.readingTime}`);
  console.log(`blocks total:  ${(post.blocks || []).length}`);
  console.log(`  blockCounts: ${JSON.stringify(blockCounts)}`);
  console.log(`coverImage:    ${post.coverImage?.name || 'NONE'} (id=${post.coverImage?.id})`);
  console.log(`gallery:       ${(post.gallery || []).length} items`);
  console.log(`category:      ${post.category?.name || 'NONE'} (slug=${post.category?.slug}, documentId=${post.category?.documentId})`);
  console.log(`tags:          ${(post.tags || []).map((t) => `${t.name} (${t.slug})`).join(', ') || 'NONE'}`);
  console.log(`location:      ${post.location ? `${post.location.name} ${post.location.latitude},${post.location.longitude} (${post.location.country}, region=${post.location.region})` : 'NONE'}`);
  console.log('');
  console.log(`Images in blocks (${blockImages.length} unique by name, ${new Set(blockImages).size}):`);
  const uniqueNames = [...new Set(blockImages)];
  uniqueNames.slice(0, 30).forEach((n, i) => console.log(`  [${i}] ${n}`));
  if (uniqueNames.length > 30) console.log(`  ... +${uniqueNames.length - 30}`);

  // -- File count diff -----------------------------------------------------
  const afterUploadCount = readdirSync(UPLOADS_DIR).filter((n) => !n.startsWith('.')).length;
  console.log(`\npublic/uploads/ files:  before=${beforeUploadCount}  after=${afterUploadCount}  diff=+${afterUploadCount - beforeUploadCount}`);
  // Strapi vytvára aj thumbnaily (thumbnail_, small_, medium_, large_) pre väčšie obrázky,
  // takže diff môže byť >25 ak boli obrázky veľké.

  // Write detailed upload log
  const logPath = resolve(dirname(INPUT_PATH), `${slug}.upload-log.json`);
  writeFileSync(
    logPath,
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        action: existingPost ? 'updated' : 'created',
        documentId,
        slug,
        uploads: uploadLog,
        verify: {
          blocksTotal: (post.blocks || []).length,
          blockCounts,
          coverImage: post.coverImage?.name,
          galleryCount: (post.gallery || []).length,
          category: post.category?.name,
          tags: (post.tags || []).map((t) => t.name),
          location: post.location,
          uniqueBlockImages: uniqueNames.length,
        },
        fileCountDelta: { before: beforeUploadCount, after: afterUploadCount },
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\n✓ Upload log: ${logPath}`);
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  if (!existsSync(INPUT_PATH)) {
    console.error(`[err] intermediate JSON not found: ${INPUT_PATH}`);
    process.exit(1);
  }
  const intermediate = JSON.parse(readFileSync(INPUT_PATH, 'utf8'));
  const bp = intermediate.blogPost;
  if (!bp?.slug) {
    console.error(`[err] intermediate has no blogPost.slug`);
    process.exit(1);
  }

  const { payload, media } = buildPayload(intermediate, { categoryDocumentId: CATEGORY_DOC_ID });
  const mediaArray = media.toArray();
  const notes = buildNotes(intermediate, payload, mediaArray, { categoryDocumentId: CATEGORY_DOC_ID });

  const outDir = dirname(INPUT_PATH);
  const outFile = args.out
    ? resolve(__dirname, args.out)
    : resolve(outDir, `${bp.slug}.payload.json`);
  const dryRunOutput = {
    dryRun: DRY_RUN,
    target: { strapiUrl: STRAPI_URL, method: 'POST', endpoint: '/api/blog-posts', idempotencyKey: `slug=${bp.slug}` },
    imagesToUpload: mediaArray,
    payload,
    notes,
  };
  writeFileSync(outFile, JSON.stringify(dryRunOutput, null, 2), 'utf8');

  if (DRY_RUN) {
    console.log(`\n=== DRY-RUN — ${bp.slug} ===\n`);
    console.log(`payload written: ${outFile}`);
    console.log(`media: ${mediaArray.length} unique`);
    console.log(`title (normalized): "${payload.data.title}"`);
    console.log(`gallery (top-level): [] (empty)`);
    console.log(`category: ${CATEGORY_DOC_ID}`);
    console.log('\nNa reálny upload:  node scripts/blog-migrate/upload.mjs --dry-run=false');
    return;
  }

  await doRealUpload(intermediate, payload, mediaArray, { categoryDocumentId: CATEGORY_DOC_ID });
}

main().catch((e) => {
  console.error('\n[fatal]', e.message);
  console.error(e.stack);
  process.exit(1);
});

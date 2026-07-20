// Upload aktualít do kolekcie `aktualita` (iný content-type než blog-post).
// Transform: blog-post-tvarový intermediate → aktualita polia
//   nazov ← title | obsah ← blocks→Markdown | fotky ← gallery (upload) |
//   datum ← originalPublishedDate | typAktivity ← data/_aktuality-typ.json | zvyraznene ← map
//
// Idempotentné cez `nazov` (GET filter → PUT, inak POST). Fotky dedup cez SHA-256
// voči existujúcej Media Library (rovnako ako upload.mjs).
//
// CLI:
//   node _upload-aktuality.mjs                       # dry-run všetkých (payloady do out/, 0 network write)
//   node _upload-aktuality.mjs --dry-run=false       # reálny upload všetkých
//   node _upload-aktuality.mjs --slug=<slug> --dry-run=false   # jeden článok
//   node _upload-aktuality.mjs --limit=3 --dry-run=false       # prvé 3 z fronty
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = getArg('token') || process.env.STRAPI_TOKEN || '';
const AUTH_HEADERS = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
// Strapi-side upload (sharp thumbnaily + SQLite + ~20k plochých súborov, 8 GB RAM)
// bežne trvá 60–120 s na veľký s0 obrázok — klientský timeout musí byť nad tým,
// inak klient abortuje (ECONNRESET) hoci Strapi upload dokončí. Override cez --timeout=.
const FETCH_TIMEOUT_MS = getArg('timeout') ? parseInt(getArg('timeout'), 10) : 180000;
const DRY_RUN = getArg('dry-run') !== 'false';
const ONLY_SLUG = getArg('slug') || null;
const LIMIT = getArg('limit') ? parseInt(getArg('limit'), 10) : null;
// --prefer=s1600: nahrávaj rovno menší 1600px variant namiesto s0 originálu.
// Pre veľké grafiky (letáky/plagáty v PNG) s0 choke-uje sharp → upload timeout;
// s1600 je pre web plne dostačujúci a spracuje sa rýchlo.
const PREFER_S1600 = getArg('prefer') === 's1600';
// --force-new: preskoč dedup podľa `nazov` (findExisting) a vždy sprav POST.
// Použitie pri legitímnych rovnomenných článkoch (napr. každoročné „Darujte nám 2% z dane"),
// kde dedup podľa nazov nesprávne PUT-ne jeden cez druhý.
const FORCE_NEW = process.argv.includes('--force-new');

const OUT = resolve(__dirname, 'out');
const DATA = resolve(__dirname, 'data');

function getArg(name) {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.split('=').slice(1).join('=') : null;
}

// ── Strapi helpers (rovnaká sémantika ako upload.mjs) ────────────────────────
async function sGet(path) {
  const r = await fetch(`${STRAPI_URL}${path}`, {
    headers: { ...AUTH_HEADERS },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const b = await r.text();
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${b.slice(0, 300)}`);
  return JSON.parse(b);
}
async function sJson(method, path, data) {
  const r = await fetch(`${STRAPI_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const b = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${b.slice(0, 500)}`);
  return JSON.parse(b);
}
async function sUploadFile(buffer, filename, mimeType, caption) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const fd = new FormData();
      fd.append('files', new Blob([buffer], { type: mimeType }), filename);
      if (caption) fd.append('fileInfo', JSON.stringify({ caption, alternativeText: caption, name: filename }));
      const r = await fetch(`${STRAPI_URL}/api/upload`, {
        method: 'POST',
        headers: { ...AUTH_HEADERS, Connection: 'close' },
        body: fd,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const b = await r.text();
      if (!r.ok) throw new Error(`UPLOAD ${filename} → ${r.status}: ${b.slice(0, 400)}`);
      const j = JSON.parse(b);
      return Array.isArray(j) ? j[0] : j;
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await sleep(attempt * 1500);
    }
  }
  throw lastErr;
}
async function downloadImage(preferredUrl, fallbackUrl) {
  async function tryFetch(url) {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
        if (!r.ok) { if (r.status === 404) return null; throw new Error(`HTTP ${r.status}`); }
        return { buffer: Buffer.from(await r.arrayBuffer()), mimeType: r.headers.get('content-type') || 'image/jpeg' };
      } catch (e) { lastErr = e; if (attempt < 3) await sleep(attempt * 1500); }
    }
    throw lastErr;
  }
  try { const r = await tryFetch(preferredUrl); if (r && r.buffer.length > 1024) return { ...r, variant: 's0' }; } catch {}
  const r = await tryFetch(fallbackUrl);
  if (!r) throw new Error(`Both s0/s1600 failed for ${preferredUrl}`);
  return { ...r, variant: 's1600' };
}
async function loadExistingMediaIndex() {
  const files = [];
  let page = 1;
  const PAGE = 100;
  while (true) {
    const j = await sGet(`/api/upload/files?pagination[page]=${page}&pagination[pageSize]=${PAGE}`);
    const items = Array.isArray(j) ? j : (j.results || j.data || []);
    if (!items.length) break;
    files.push(...items);
    if (items.length !== PAGE) break; // endpoint ignoruje pagináciu → kompletný zoznam
    page++;
    if (page > 50) break;
  }
  const byName = new Map();
  for (const f of files) if (f?.name && !byName.has(f.name)) byName.set(f.name, f);
  return { byName };
}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Blocks → Markdown (obsah je richtext = Markdown) ─────────────────────────
function inlineToMd(node) {
  if (node.type === 'link') {
    const inner = (node.children || []).map(inlineToMd).join('');
    return `[${inner || node.url}](${node.url})`;
  }
  let t = node.text ?? '';
  if (!t) return '';
  if (node.code) t = '`' + t + '`';
  if (node.bold) t = `**${t}**`;
  if (node.italic) t = `*${t}*`;
  return t;
}
function richTextBlockToMd(block) {
  const out = [];
  for (const node of block.body || []) {
    if (node.type === 'heading') {
      const lvl = Math.min(Math.max(node.level || 2, 1), 6);
      out.push('#'.repeat(lvl) + ' ' + (node.children || []).map(inlineToMd).join('').trim());
    } else if (node.type === 'paragraph') {
      // Odsek = súvislá próza: zbav sa zdrojových vnútorných zalomení/odsadení
      // (Blogger `\n  ` mäkké zlomy) a viacnásobných medzier.
      const txt = (node.children || []).map(inlineToMd).join('')
        .replace(/\s*\n\s*/g, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
      if (txt) out.push(txt);
    } else if (node.type === 'list') {
      const bullet = node.format === 'ordered' ? '1.' : '-';
      for (const li of node.children || []) {
        out.push(`${bullet} ` + (li.children || []).map(inlineToMd).join('').trim());
      }
    }
  }
  return out.join('\n\n');
}
function blocksToMarkdown(blocks) {
  const parts = [];
  for (const b of blocks || []) {
    if (b.__component === 'content.rich-text') {
      const md = richTextBlockToMd(b);
      if (md.trim()) parts.push(md);
    } else if (b.__component === 'content.quote-block') {
      const q = (b.text || '').trim();
      if (q) parts.push(q.split('\n').map((l) => `> ${l}`).join('\n') + (b.author ? `\n>\n> — ${b.author}` : ''));
    } else if (b.__component === 'content.poem') {
      const p = (b.text || '').trim();
      if (p) parts.push(p.split('\n').map((l) => `*${l}*`).join('  \n'));
    } else if (b.__component === 'content.embed') {
      const url = b.url || (b.provider === 'youtube' && b.embedId ? `https://www.youtube.com/watch?v=${b.embedId}` : '');
      if (url) parts.push(`[${b.caption || 'Video'}](${url})`);
    }
    // content.image-block / content.sources → obrázky idú do fotky, zdroje nateraz vynechané z obsah
  }
  return parts.join('\n\n').trim();
}

// Blogger `/img/a/` URL má ako posledný segment len 190+ znakový hash s príponou
// veľkosti (=s811, =w1600-h900) a bez prípony súboru → Strapi/sharp taký filename
// odmietne. Sanitizuj na krátky, deterministický (dedup) názov s .jpg príponou.
function safeFilename(raw) {
  let f = (raw || '').split('?')[0].replace(/=[a-z]\d+(-[a-z]\d+)*$/i, '');
  const hasExt = /\.(jpe?g|png|gif|webp|avif)$/i.test(f);
  if (f.length > 80 || !hasExt || /[=]/.test(f)) {
    const base = (f.replace(/[^a-zA-Z0-9]/g, '').slice(-32) || 'img');
    f = base + '.jpg';
  }
  return f;
}

// ── Fotky: dedup gallery cez sourceUrl ───────────────────────────────────────
function galleryImageRefs(bp) {
  const seen = new Set();
  const refs = [];
  for (const g of bp.gallery || []) {
    if (!g?.sourceUrl || seen.has(g.sourceUrl)) continue;
    seen.add(g.sourceUrl);
    const s1600 = g.fallbackUrl || g.sourceUrl;
    refs.push({
      preferredUrl: PREFER_S1600 ? s1600 : g.sourceUrl,
      fallbackUrl: PREFER_S1600 ? g.sourceUrl : s1600,
      filename: safeFilename(g.filename || g.sourceUrl.split('/').pop()),
      caption: g.caption || null,
    });
  }
  return refs;
}

// ── Transform jedného článku ─────────────────────────────────────────────────
function buildAktualita(inter, typMap, slug) {
  const bp = inter.blogPost || {};
  const meta = typMap[slug] || {};
  const nazov = (bp.title || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const obsah = blocksToMarkdown(bp.blocks);
  const rawDate = bp.originalPublishedDate || bp.publishedAt || null;
  const datum = rawDate ? String(rawDate).slice(0, 10) : null; // YYYY-MM-DD
  return {
    nazov,
    obsah,
    datum,
    typAktivity: meta.typAktivity || 'ine',
    zvyraznene: !!meta.zvyraznene,
    _fotkyRefs: galleryImageRefs(bp),
  };
}

// ── Idempotentný upload obrázkov → media ids ─────────────────────────────────
async function uploadFotky(refs, mediaIndex, shaCache) {
  const ids = [];
  for (const ref of refs) {
    const existing = mediaIndex.byName.get(ref.filename);
    if (existing) { ids.push(existing.id); continue; }
    const dl = await downloadImage(ref.preferredUrl, ref.fallbackUrl);
    const hash = sha256(dl.buffer);
    if (shaCache.has(hash)) { ids.push(shaCache.get(hash)); continue; }
    const uploaded = await sUploadFile(dl.buffer, ref.filename, dl.mimeType, ref.caption);
    shaCache.set(hash, uploaded.id);
    mediaIndex.byName.set(ref.filename, uploaded);
    ids.push(uploaded.id);
    await sleep(1000); // throttle (SQLite + thumbnaily)
  }
  return ids;
}

async function findExisting(nazov) {
  const j = await sGet(`/api/aktuality?filters[nazov][$eq]=${encodeURIComponent(nazov)}&publicationState=preview&pagination[pageSize]=1`);
  return (j.data || [])[0] || null;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const queue = JSON.parse(readFileSync(resolve(DATA, '_aktuality-queue.json'), 'utf8'));
  const arr = Array.isArray(queue) ? queue : Object.values(queue);
  const typMap = JSON.parse(readFileSync(resolve(DATA, '_aktuality-typ.json'), 'utf8'));

  let items = arr;
  if (ONLY_SLUG) items = items.filter((x) => x.slug === ONLY_SLUG);
  if (LIMIT) items = items.slice(0, LIMIT);

  console.log(`\n=== AKTUALITY UPLOAD ${DRY_RUN ? '(DRY-RUN)' : '(REAL)'} — ${items.length} položiek ===\n`);

  let mediaIndex = { byName: new Map() };
  const shaCache = new Map();
  if (!DRY_RUN) {
    process.stdout.write('  načítavam Media Library index... ');
    mediaIndex = await loadExistingMediaIndex();
    console.log(`${mediaIndex.byName.size} súborov`);
  }

  const results = [];
  for (const item of items) {
    const interPath = resolve(OUT, item.file);
    if (!existsSync(interPath)) { console.log(`SKIP  ${item.slug} — chýba ${item.file}`); continue; }
    const inter = JSON.parse(readFileSync(interPath, 'utf8'));
    const a = buildAktualita(inter, typMap, item.slug);

    if (!a.nazov || !a.datum) {
      console.log(`FAIL  ${item.slug} — chýba nazov/datum (nazov="${a.nazov}" datum="${a.datum}")`);
      results.push({ slug: item.slug, status: 'fail-missing-required' });
      continue;
    }

    if (DRY_RUN) {
      const payload = { nazov: a.nazov, obsah: a.obsah, datum: a.datum, typAktivity: a.typAktivity, zvyraznene: a.zvyraznene, _fotky: a._fotkyRefs.length };
      writeFileSync(resolve(OUT, `${item.slug}.aktualita-payload.json`), JSON.stringify(payload, null, 2));
      console.log(`DRY   ${item.slug} — [${a.typAktivity}] ${a.datum} | fotky ${a._fotkyRefs.length} | obsah ${a.obsah.length} zn | "${a.nazov.slice(0, 50)}"`);
      results.push({ slug: item.slug, status: 'dry', typAktivity: a.typAktivity, fotky: a._fotkyRefs.length, obsahLen: a.obsah.length });
      continue;
    }

    try {
      const fotky = await uploadFotky(a._fotkyRefs, mediaIndex, shaCache);
      const data = { nazov: a.nazov, obsah: a.obsah, datum: a.datum, typAktivity: a.typAktivity, zvyraznene: a.zvyraznene, fotky };
      const existing = FORCE_NEW ? null : await findExisting(a.nazov);
      let docId;
      if (existing) {
        await sJson('PUT', `/api/aktuality/${existing.documentId}`, data);
        docId = existing.documentId;
        console.log(`PUT   ${item.slug} — ${docId} [${a.typAktivity}] fotky ${fotky.length}`);
      } else {
        const created = await sJson('POST', '/api/aktuality', data);
        docId = created.data.documentId;
        console.log(`POST  ${item.slug} — ${docId} [${a.typAktivity}] fotky ${fotky.length}`);
      }
      results.push({ slug: item.slug, status: existing ? 'updated' : 'created', documentId: docId, typAktivity: a.typAktivity, fotky: fotky.length });
      await sleep(500);
    } catch (e) {
      console.log(`FAIL  ${item.slug} — ${e.message?.slice(0, 200)}`);
      results.push({ slug: item.slug, status: 'fail', error: e.message?.slice(0, 200) });
    }
  }

  writeFileSync(resolve(OUT, '_aktuality-upload-results.json'), JSON.stringify(results, null, 2));
  const by = (s) => results.filter((r) => r.status === s).length;
  console.log(`\n=== SPOLU ${results.length} | created=${by('created')} updated=${by('updated')} dry=${by('dry')} fail=${by('fail') + by('fail-missing-required')} ===`);
}

main().catch((e) => { console.error('[fatal]', e); process.exit(1); });

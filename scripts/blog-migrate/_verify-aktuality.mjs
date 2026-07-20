// Fáza 6 — verifikácia migrácie aktualít.
// Pre každú z 67 položiek fronty over v živej Strapi DB:
//   live? | publikovaná? | nazov sedí (gram. titulok) | typAktivity | počet fotiek
// Použitie (až po dobehnutí uploadov, nech nesúperí o SQLite zámok):
//   node scripts/blog-migrate/_verify-aktuality.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });
const URL = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN || '';
const H = { Authorization: `Bearer ${TOKEN}` };
const DATA = resolve(__dirname, 'data');
const OUT = resolve(__dirname, 'out');

const queue = JSON.parse(readFileSync(resolve(DATA, '_aktuality-queue.json'), 'utf8'));
const arr = Array.isArray(queue) ? queue : Object.values(queue);
const typMap = JSON.parse(readFileSync(resolve(DATA, '_aktuality-typ.json'), 'utf8'));

const uniqGallery = (bp) => new Set((bp.gallery || []).map(g => g.sourceUrl).filter(Boolean)).size;

let live = 0, missing = 0, draft = 0, typBad = 0, fotkyBad = 0;
const problems = [];

for (const it of arr) {
  const interPath = resolve(OUT, it.file);
  if (!existsSync(interPath)) { problems.push(`${it.slug}: intermediate chýba`); continue; }
  const bp = JSON.parse(readFileSync(interPath, 'utf8')).blogPost;
  const nazov = (bp.title || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const expTyp = (typMap[it.slug] || {}).typAktivity || 'ine';
  const expFotky = uniqGallery(bp);

  const url = `${URL}/api/aktuality?filters[nazov][$eq]=${encodeURIComponent(nazov)}&populate=fotky&publicationState=preview&pagination[pageSize]=1`;
  let rec = null;
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(30000) });
    rec = (await r.json()).data?.[0] || null;
  } catch (e) { problems.push(`${it.slug}: GET zlyhal — ${e.message}`); continue; }

  if (!rec) { missing++; problems.push(`MISSING  ${it.slug} — "${nazov}"`); continue; }
  live++;
  if (!rec.publishedAt) { draft++; problems.push(`DRAFT    ${it.slug}`); }
  if (rec.typAktivity !== expTyp) { typBad++; problems.push(`TYP      ${it.slug}: DB=${rec.typAktivity} exp=${expTyp}`); }
  const gotFotky = (rec.fotky || []).length;
  if (gotFotky !== expFotky) { fotkyBad++; problems.push(`FOTKY    ${it.slug}: DB=${gotFotky} exp=${expFotky}`); }
}

console.log(`\n=== VERIFIKÁCIA AKTUALÍT (${arr.length} vo fronte) ===`);
console.log(`live=${live} | chýba=${missing} | draft=${draft} | typ-nesedí=${typBad} | fotky-nesedia=${fotkyBad}`);
if (problems.length) { console.log('\n--- Nálezy ---'); problems.forEach(p => console.log('  ' + p)); }
else console.log('\n✓ Všetko sedí.');

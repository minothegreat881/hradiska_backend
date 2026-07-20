// Dávkový extract pre aktuality: pre každý data/aktuality-<key>.json spustí extract.mjs,
// ošetrí kolízie slugov (rok-suffix) a prázdny titul, vyrobí data/_aktuality-queue.json.
import { readdirSync, readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, 'data');
const OUT = resolve(__dirname, 'out');

// key → { slug?, title? } prepis (kolízie + prázdny titul)
const OVERRIDES = {
  '2014-05-anketa': { slug: 'anketa-2014-maj' },
  '2014-07-anketa': { slug: 'anketa-2014-jul' },
  '2016-02-darujte-nam-2-z-dane': { slug: 'darujte-nam-2-z-dane-2016' },
  '2018-03-darujte-nam-2-z-dane': { slug: 'darujte-nam-2-z-dane-2018' },
  '2014-04-blog-post': { slug: 'historicky-festival-pozvanka-lh-2014', title: 'Historický festival – pozvánka (LH)' },
};

const files = readdirSync(DATA).filter(f => /^aktuality-.*\.json$/.test(f) && !f.includes('fetch-report')).sort();
const queue = [];
const seenSlugs = new Set();

for (const f of files) {
  const key = f.replace(/^aktuality-/, '').replace(/\.json$/, '');
  let stdout;
  try {
    stdout = execFileSync('node', ['extract.mjs', `--post=data/${f}`, '--out=out'], { cwd: __dirname, encoding: 'utf8' });
  } catch (e) {
    console.log(`FAIL  ${key} — extract error: ${e.message.split('\n')[0]}`);
    continue;
  }
  const m = stdout.match(/slug:\s*(\S+)/);
  const cm = stdout.match(/comments: fetched (\d+)\/(\d+)/);
  const comments = cm ? +cm[1] : 0;
  if (!m) { console.log(`FAIL  ${key} — no slug in output`); continue; }
  let naturalSlug = m[1];
  const producedFile = resolve(OUT, `${naturalSlug}.intermediate.json`);
  if (!existsSync(producedFile)) { console.log(`FAIL  ${key} — produced file missing (${naturalSlug})`); continue; }

  const ov = OVERRIDES[key] || {};
  let finalSlug = ov.slug || naturalSlug;
  // ochrana proti nečakaným kolíziám
  if (!ov.slug && seenSlugs.has(finalSlug)) finalSlug = `${finalSlug}-${key.slice(0, 7)}`;
  seenSlugs.add(finalSlug);

  const inter = JSON.parse(readFileSync(producedFile, 'utf8'));
  inter.blogPost.slug = finalSlug;
  if (ov.title) inter.blogPost.title = ov.title;

  const finalFile = resolve(OUT, `aktuality-${key}.intermediate.json`);
  writeFileSync(finalFile, JSON.stringify(inter, null, 2), 'utf8');
  if (producedFile !== finalFile) { try { unlinkSync(producedFile); } catch {} }

  queue.push({
    key, fileBase: `aktuality-${key}`, file: `aktuality-${key}.intermediate.json`,
    slug: finalSlug, title: inter.blogPost.title,
    blocks: (inter.blogPost.blocks || []).length,
    images: (inter.blogPost.gallery || []).length,
    comments,
  });
  console.log(`OK    ${key} → slug=${finalSlug} | blocks=${queue.at(-1).blocks} img=${queue.at(-1).images} com=${comments} | "${inter.blogPost.title.trim().slice(0,50)}"`);
}

writeFileSync(resolve(DATA, '_aktuality-queue.json'), JSON.stringify(queue, null, 2), 'utf8');
console.log(`\n=== EXTRACT SPOLU: ${queue.length}/${files.length} | queue → data/_aktuality-queue.json ===`);

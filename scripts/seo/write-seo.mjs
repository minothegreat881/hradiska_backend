/**
 * Bezpečný zápis per-article SEO (metaTitle, metaDescription) do Strapi.
 *
 * Vstup: JSON súbor { "<slug>": { "t": "<metaTitle>", "d": "<metaDescription>" }, … }
 * cesta ako 1. argument (default ./seo-batch.json vedľa skriptu).
 *
 * Pre každý článok: načíta počet blokov PRED, spraví PUT len meta polí
 * (PUT zachová neuvedené polia → telo ostáva), overí že blokov je rovnako a meta
 * sa zapísalo. Continue-on-error, log na koniec + súhrn.
 *
 * Spustenie:  node scripts/seo/write-seo.mjs [cesta-k-batch.json]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN;
if (!TOKEN) { console.error('Chýba STRAPI_TOKEN v .env'); process.exit(1); }

const __dirname = dirname(fileURLToPath(import.meta.url));
const batchPath = resolve(process.argv[2] || resolve(__dirname, 'seo-batch.json'));
const batch = JSON.parse(readFileSync(batchPath, 'utf8'));

const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getPost(slug) {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slug)}&populate[blocks]=true&fields[0]=title&fields[1]=metaTitle&fields[2]=metaDescription`);
  const j = await r.json();
  return j.data?.[0] || null;
}

const entries = Object.entries(batch);
let ok = 0, fail = 0;
console.log(`SEO zápis: ${entries.length} článkov → ${BASE}\n`);

for (const [slug, { t, d }] of entries) {
  try {
    if (!t || !d) { console.log(`⚠ ${slug}: chýba t/d, preskakujem`); fail++; continue; }
    if (t.length > 60) console.log(`  ! ${slug}: metaTitle ${t.length}>60 zn.`);
    if (d.length > 160) console.log(`  ! ${slug}: metaDescription ${d.length}>160 zn.`);

    const before = await getPost(slug);
    if (!before) { console.log(`❌ ${slug}: nenájdený`); fail++; continue; }
    const blocksBefore = (before.blocks || []).length;

    const put = await fetch(`${BASE}/api/blog-posts/${before.documentId}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ data: { metaTitle: t, metaDescription: d } }),
    });
    if (!put.ok) { console.log(`❌ ${slug}: PUT ${put.status}`); fail++; continue; }

    await sleep(400);
    const after = await getPost(slug);
    const blocksAfter = (after.blocks || []).length;
    const good = after?.metaTitle === t && blocksAfter === blocksBefore;
    console.log(`${good ? '✓' : '⚠'} ${slug}  blocks ${blocksBefore}→${blocksAfter}  title[${t.length}] desc[${d.length}]`);
    if (good) ok++; else fail++;
  } catch (e) {
    console.log(`❌ ${slug}: ${e.message}`); fail++;
  }
}

console.log(`\n===== HOTOVO: ${ok} OK, ${fail} problém =====`);

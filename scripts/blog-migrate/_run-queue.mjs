// Sekvenčný driver pre finálnu fázu migrácie (upload).
// Spracuje _upload-queue.json JEDEN článok naraz — žiadny reštart Strapi, continue-on-error.
// Po každom úspešnom uploade overí keyFacts/timeline; ak sú prázdne (a intermediate ich má),
// dorobí poistný PUT. Progres do _queue-progress.json, per-článok log do out/<slug>.queue-upload.log.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });
const TOKEN = process.env.STRAPI_TOKEN || '';
const BASE = 'http://localhost:1337';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const ARTICLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 min wall-clock na článok

const queue = JSON.parse(readFileSync(resolve(__dirname, '_upload-queue.json'), 'utf8'));
const progressPath = resolve(__dirname, '_queue-progress.json');
const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, 'utf8')) : {};
const saveProgress = () => writeFileSync(progressPath, JSON.stringify(progress, null, 2));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getLivePost(slug) {
  const url = `${BASE}/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slug)}` +
    `&populate[0]=keyFacts&populate[1]=timeline&populate[2]=category` +
    `&pagination[pageSize]=1&publicationState=preview`;
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    const j = await r.json();
    return j.data?.[0] || null;
  } catch { return null; }
}

async function main() {
  console.log(`=== QUEUE START — ${queue.length} článkov — ${new Date().toISOString()} ===`);
  let done = 0, failed = 0, skipped = 0, i = 0;
  for (const item of queue) {
    i++;
    const { file, slug, category, kind, images } = item;
    const tag = `[${i}/${queue.length}] ${slug}`;

    // Už live? (idempotentný skip — prežije reštart driveru)
    const existing = await getLivePost(slug);
    if (existing) {
      progress[slug] = { status: 'already-live', documentId: existing.documentId, at: new Date().toISOString() };
      saveProgress();
      skipped++;
      console.log(`SKIP  ${tag} — už live (documentId=${existing.documentId})`);
      continue;
    }

    console.log(`START ${tag} — ${kind}, obrázkov=${images ?? '?'}`);
    const logPath = resolve(__dirname, 'out', `${slug}.queue-upload.log`);
    const res = spawnSync('node', ['upload.mjs', `--input=out/${file}`, `--category=${category}`, '--dry-run=false'], {
      cwd: __dirname,
      encoding: 'utf8',
      timeout: ARTICLE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    });
    const out = (res.stdout || '') + '\n----STDERR----\n' + (res.stderr || '');
    writeFileSync(logPath, out);

    if (res.status !== 0 || res.error) {
      const reason = res.error ? (res.error.code === 'ETIMEDOUT' ? 'wall-clock timeout 15min' : res.error.message) : `exit ${res.status}`;
      progress[slug] = { status: 'failed', reason, at: new Date().toISOString() };
      saveProgress();
      failed++;
      console.log(`FAIL  ${tag} — ${reason} (log: out/${slug}.queue-upload.log)`);
      await sleep(2000);
      continue;
    }

    // Verify + poistný keyFacts/timeline PUT
    await sleep(1500);
    const live = await getLivePost(slug);
    let note = '';
    if (live) {
      const inter = JSON.parse(readFileSync(resolve(__dirname, 'out', file), 'utf8')).blogPost || {};
      const wantKF = (inter.keyFacts || []).length, wantTL = (inter.timeline || []).length;
      const haveKF = (live.keyFacts || []).length, haveTL = (live.timeline || []).length;
      if ((wantKF > 0 && haveKF === 0) || (wantTL > 0 && haveTL === 0)) {
        try {
          const r = await fetch(`${BASE}/api/blog-posts/${live.documentId}`, {
            method: 'PUT', headers: H, signal: AbortSignal.timeout(30000),
            body: JSON.stringify({ data: { keyFacts: inter.keyFacts || [], timeline: inter.timeline || [] } }),
          });
          note = r.ok ? ` +poistný PUT keyFacts/timeline (${wantKF}/${wantTL})` : ` !PUT keyFacts/timeline zlyhal ${r.status}`;
        } catch (e) { note = ` !PUT keyFacts/timeline error ${e.message}`; }
      } else {
        note = ` keyFacts=${haveKF} timeline=${haveTL} (POST OK)`;
      }
      progress[slug] = { status: 'done', documentId: live.documentId, keyFacts: wantKF, timeline: wantTL, at: new Date().toISOString() };
    } else {
      progress[slug] = { status: 'done-unverified', at: new Date().toISOString() };
      note = ' (POST prešiel, GET verify sa nepodaril)';
    }
    saveProgress();
    done++;
    console.log(`DONE  ${tag}${note}`);
    await sleep(1500);
  }
  console.log(`=== QUEUE END — done=${done} failed=${failed} skipped=${skipped} — ${new Date().toISOString()} ===`);
}

main();

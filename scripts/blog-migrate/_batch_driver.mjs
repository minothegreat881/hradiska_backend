// Sekventný upload driver pre 34 zvyšných článkov (Odborné texty + 3D modely).
// Jeden upload naraz (8GB RAM). Po každom: verify kf/tl, prípadný corrective PUT. Continue-on-error.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
const TOKEN = process.env.STRAPI_TOKEN;
const BASE = 'http://localhost:1337';

const ODBORNE = 'xffbpfyel46l2xro9s7hwm8d';
const MODELY3D = 'dv132j3g3ek629nwpmbnugun';

const JOBS = [
  // Odborné texty (6)
  ['z-stegmann-rajtar-predbezne-vysledky-archeologickeho-vyskumu-na-zibrici-vyskumy-v-r-2002-2003-a-2005-2006', ODBORNE],
  ['sidliska-otomanskej-kultury-na-vychodnom-slovensku', ODBORNE],
  ['peter-schreiber-osidlenie-ziliny-a-okolia-od-doby-rimskej-po-stredovek-lokalita-divinka', ODBORNE],
  ['simunky-siroka-hradiste-koscelisko-mozne-suvislosti', ODBORNE],
  ['tragedia-jedneho-uspesneho-obsadenia-vlasti', ODBORNE],
  ['robert-muller-okolie-rieky-zala-v-8-10-storoci', ODBORNE],
  // 3D modely (28) — keltska-osada-3d (8 obrázkov) zámerne posledné
  ['nitrianska-blatnica-rotunda-3d', MODELY3D],
  ['pobedim-3d', MODELY3D],
  ['3d-rekonstrukcie', MODELY3D],
  ['zvolen-motova-3d-panorama', MODELY3D],
  ['slovanka-devuska', MODELY3D],
  ['velkomoravsky-kovac-z-vrsatca', MODELY3D],
  ['slovansky-velmozsky-dvorec', MODELY3D],
  ['bratislava', MODELY3D], // slug už premenovaný na bratislava-kresba v intermediate.json
  ['vidiecke-opevnene-sidlisko', MODELY3D],
  ['slovanska-svatyna-most-pri-bratislave', MODELY3D],
  ['bojna-3d-rekonstrukcia-slovanskeho-hradiska', MODELY3D],
  ['detva-kalamarka-3-d', MODELY3D],
  ['devin-velkomoravsky-palac-s-kostolom-3d', MODELY3D],
  ['divin-3d', MODELY3D],
  ['liptovsky-hrad', MODELY3D],
  ['nosice-hradisko-3d', MODELY3D],
  ['pohanska-svatyna-most-pri-bratislave-nove-3d', MODELY3D],
  ['bina-kresba', MODELY3D],
  ['zvolen-motova-kresba', MODELY3D],
  ['muzla-cenkov-nova-rekonstrukcia', MODELY3D],
  ['rekonstrukcia-opevnenia-hradisk', MODELY3D],
  ['surany-v-16-storoci-3d', MODELY3D],
  ['mohyla-z-doby-bronzovej-v-palarikove-3d', MODELY3D],
  ['osada-z-mladsej-doby-kamennej', MODELY3D],
  ['svaty-jur-nestich-3d', MODELY3D],
  ['velmozska-mohyla-holasky-1', MODELY3D],
  ['velkomoravske-hradisko-zvolen-motova-3d', MODELY3D],
  ['keltska-osada-3d', MODELY3D],
];

const LOGDIR = path.join(__dirname, 'out', '_batch-logs');
fs.mkdirSync(LOGDIR, { recursive: true });
const RESULTS = path.join(__dirname, 'out', '_batch-results.json');
const results = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : {};

async function getLive(slug) {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slug)}&populate[keyFacts][fields][0]=id&populate[timeline][fields][0]=id&populate[category][fields][0]=name&publicationState=preview`);
  const j = await r.json();
  return j.data?.[0] || null;
}

function log(msg) { console.log(msg); }

for (let i = 0; i < JOBS.length; i++) {
  const [base, cat] = JOBS[i];
  const file = `out/${base}.intermediate.json`;
  const inter = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  const slug = inter.blogPost.slug;
  const wantKf = (inter.blogPost.keyFacts || []).length;
  const wantTl = (inter.blogPost.timeline || []).length;

  log(`\n[${i + 1}/${JOBS.length}] START ${slug}  (kf:${wantKf} tl:${wantTl}) cat=${cat === ODBORNE ? 'Odborné' : '3D'}`);
  const t0 = Date.now();
  const logfile = path.join(LOGDIR, `${base}.log`);
  const res = spawnSync('node', ['upload.mjs', `--input=${file}`, `--category=${cat}`, '--dry-run=false'], {
    cwd: __dirname, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64, timeout: 20 * 60 * 1000,
  });
  fs.writeFileSync(logfile, (res.stdout || '') + '\n===STDERR===\n' + (res.stderr || ''));
  const secs = ((Date.now() - t0) / 1000).toFixed(0);

  if (res.status !== 0) {
    log(`[${i + 1}/${JOBS.length}] ❌ FAIL ${slug}  exit=${res.status} (${secs}s) — log: ${logfile}`);
    results[slug] = { status: 'fail', exit: res.status, secs };
    fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));
    continue;
  }

  // Verify + corrective PUT for kf/tl
  await new Promise((r) => setTimeout(r, 1500));
  let live = await getLive(slug);
  let liveKf = (live?.keyFacts || []).length, liveTl = (live?.timeline || []).length;
  let fixed = false;
  if (live && ((wantKf > 0 && liveKf < wantKf) || (wantTl > 0 && liveTl < wantTl))) {
    const put = await fetch(`${BASE}/api/blog-posts/${live.documentId}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { keyFacts: inter.blogPost.keyFacts || [], timeline: inter.blogPost.timeline || [] } }),
    });
    fixed = put.ok;
    await new Promise((r) => setTimeout(r, 800));
    live = await getLive(slug);
    liveKf = (live?.keyFacts || []).length; liveTl = (live?.timeline || []).length;
  }
  const ok = live && liveKf >= wantKf && liveTl >= wantTl;
  log(`[${i + 1}/${JOBS.length}] ${ok ? '✓ OK' : '⚠ CHECK'} ${slug}  docId=${live?.documentId} kf:${liveKf}/${wantKf} tl:${liveTl}/${wantTl}${fixed ? ' (kf/tl PUT)' : ''} cat=${live?.category?.name} (${secs}s)`);
  results[slug] = { status: ok ? 'ok' : 'check', documentId: live?.documentId, kf: liveKf, tl: liveTl, wantKf, wantTl, fixedKfTl: fixed, secs };
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2));
}

log('\n===== BATCH DONE =====');
const done = Object.values(results);
log(`ok: ${done.filter((r) => r.status === 'ok').length}  check: ${done.filter((r) => r.status === 'check').length}  fail: ${done.filter((r) => r.status === 'fail').length}`);

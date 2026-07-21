/**
 * Nahrá všetky pripravené chýbajúce články PO JEDNOM (apply-audit → upload.mjs).
 * Bezpečné pre PC: sekvenčne, throttle medzi článkami, continue-on-error,
 * resumovateľné (preskočí tie, čo už v Strapi sú — kontrola cez slug).
 * Poradie: ľahšie prv, obrázkovo ťažké výpravy na koniec.
 *
 * Použitie: node _upload-all.mjs            (všetky zostávajúce)
 *           node _upload-all.mjs --limit=5  (len prvých 5 zostávajúcich)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';

const CAT_ID = {
  'kniezacie-sidla': 'l148rpkbsf47iy63jb0afpwn', 'mocenske-centra': 'iei9y9c9x3fd4yy1z6uz6osz',
  'strazna-funkcia': 'xl5emzcwsvq6m9hzy66avvmt', 'refugia': 'ju7qzoselv8vtk40oiddwps8',
  'staroveke-sidla': 'pc1i0qyu1ghzecz9ntunboof', 'ostatne': 'vophy6w40xd2rak2z5hr55yg',
  'vseobecne-o-hradiskach': 'u4sopv9mmxstlicww25pldjc', 'svatyne-a-sakralne-objekty': 'v1w38fn24cvwd18r9c538wzk',
  'povesti': 'gkl6r8p9t71feu4wxt6dclua', 'listiny-a-pisomne-zdroje': 'skof8do5athszi97mp2wkj3u',
  'odborne-texty': 'xffbpfyel46l2xro9s7hwm8d', '3d-modely': 'dv132j3g3ek629nwpmbnugun',
  'aktuality': 'u2b10w6rht97aijttkdja2s2', 'informacne-tabule': 'p35lgrkwzfg3vc0y6ngz9xun',
};
const limit = parseInt((process.argv.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || '0', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function exists(slug) {
  try {
    const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slug)}&publicationState=preview&fields[0]=slug`);
    const j = await r.json(); return (j.data || []).length > 0;
  } catch { return false; }
}

async function main() {
  const q = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', 'hradiska-migration', 'out_completion-queue.json'), 'utf8')).items;
  // poradie: výpravy (obrázkovo ťažké) na koniec, inak podľa textLen vzostupne
  const order = q.slice().sort((a, b) => {
    const av = /vyprava/.test(a.interSlug || a.slug) ? 1 : 0, bv = /vyprava/.test(b.interSlug || b.slug) ? 1 : 0;
    return av - bv || (a.textLen || 0) - (b.textLen || 0);
  });
  let done = 0, skip = 0, fail = 0, n = 0;
  for (const it of order) {
    const slug = it.interSlug || it.slug;
    if (!existsSync(resolve(__dirname, 'out', `${slug}.intermediate.json`))) { console.log(`⚠ ${slug}: chýba intermediate`); continue; }
    if (await exists(slug)) { skip++; continue; }
    if (limit && n >= limit) break;
    n++;
    const catId = CAT_ID[it.category] || CAT_ID['ostatne'];
    process.stdout.write(`\n[${n}] ${slug}  [${it.category}] … `);
    try {
      execFileSync('node', [resolve(__dirname, 'apply-audit.mjs'), slug], { stdio: 'ignore' });
      const out = execFileSync('node', [resolve(__dirname, 'upload.mjs'), `--input=out/${slug}.final.json`, `--category=${catId}`, '--dry-run=false'], { cwd: resolve(__dirname, '..', '..'), encoding: 'utf8', timeout: 300000 });
      const ok = /POST OK|PUT OK/.test(out);
      const m = out.match(/blockCounts:\s*(\{[^}]*\})/);
      console.log(ok ? `✓ OK ${m ? m[1] : ''}` : '⚠ CHECK');
      ok ? done++ : fail++;
    } catch (e) {
      console.log(`❌ ${String(e.message).slice(0, 80)}`);
      fail++;
    }
    await sleep(2500); // nechaj Strapi/SQLite oddýchnuť
  }
  console.log(`\n\n===== HOTOVO: ${done} nahraných, ${skip} preskočených (už existujú), ${fail} problém =====`);
}
main();

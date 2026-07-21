/**
 * Wave A — bezpečné textové/titulkové/caption opravy FLAG-ov.
 * Upraví out/<slug>.final.json a re-uploadne (upload.mjs PUT, médiá reused → SEO ostáva).
 *   node _flag-fixes-A.mjs           → len upraví final.json + vypíše diff (bez uploadu)
 *   node _flag-fixes-A.mjs --commit  → aj re-upload
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

const CAT_ID = {
  'staroveke-sidla': 'pc1i0qyu1ghzecz9ntunboof', 'aktuality': 'u2b10w6rht97aijttkdja2s2',
  'informacne-tabule': 'p35lgrkwzfg3vc0y6ngz9xun', 'listiny-a-pisomne-zdroje': 'skof8do5athszi97mp2wkj3u',
  'svatyne-a-sakralne-objekty': 'v1w38fn24cvwd18r9c538wzk',
};

// Wave A: { slug: { cat, title?, body:[[find,replace]...], captionStripCss? } }
const FIX = {
  'stupava-draci-hradok': { cat: 'staroveke-sidla', captionStripCss: true },
  'na-slovensku-objavili-novy-keltsky-symbol': { cat: 'aktuality', title: 'Na Slovensku objavili nový keltský symbol' },
  'kronika-dusi-roman-o-tatarskom-vpade': { cat: 'listiny-a-pisomne-zdroje', body: [['o Tatárskom vpáde', 'o tatárskom vpáde']] },
  'skalica-hradisko-na-kalvarii': { cat: 'staroveke-sidla', body: [['staromadarského', 'staromaďarského']] },
  'informacna-tabula-marikova-simunky': { cat: 'informacne-tabule', body: [[' pri slovanskom hradisku v lokalite', ' pri slovanskom hradisku v lokalite Šimunky.']] },
  'skalka-zahadny-kostolik-na-hradisku': { cat: 'svatyne-a-sakralne-objekty', body: [['V strednej časti slovanského', 'V strednej časti slovanského hradiska']] },
  'informacna-tabula-pruzina': { cat: 'informacne-tabule', body: [['Kvalitné modranské a dobrá nálada', 'Kvalitné modranské víno a dobrá nálada']] },
  'stary-plast-plavecky-mikulas': { cat: 'staroveke-sidla', body: [['na fóre na našej ', 'na fóre na našej facebookovej skupine ']] },
  'lh': { cat: 'aktuality', title: 'Pozvánka na historický festival' },
};

let editedTotal = 0;
for (const [slug, cfg] of Object.entries(FIX)) {
  const p = resolve(__dirname, 'out', `${slug}.final.json`);
  if (!existsSync(p)) { console.log(`⚠ ${slug}: chýba final.json`); continue; }
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const bp = j.blogPost;
  let n = 0;
  if (cfg.title && bp.title !== cfg.title) { console.log(`  [${slug}] title: "${bp.title.trim()}" → "${cfg.title}"`); bp.title = cfg.title; n++; }
  for (const [find, repl] of cfg.body || []) {
    for (const b of bp.blocks || []) {
      if (b.__component !== 'content.rich-text') continue;
      for (const node of b.body || []) for (const c of node.children || []) {
        if (typeof c.text === 'string' && c.text.includes(find)) { c.text = c.text.split(find).join(repl); n++; }
      }
    }
    console.log(`  [${slug}] body: "${find.trim().slice(0, 40)}" → "${repl.trim().slice(0, 40)}"`);
  }
  if (cfg.captionStripCss) {
    for (const b of bp.blocks || []) {
      if (b.__component === 'content.image-block' && typeof b.caption === 'string') {
        const before = b.caption;
        b.caption = b.caption.replace(/\s*[Pp]\s*\{[^}]*\}/g, '').replace(/\s+$/, '').trim();
        if (b.caption !== before) { n++; console.log(`  [${slug}] caption CSS strip: "...${before.slice(-40)}"`); }
      }
    }
  }
  if (n) { writeFileSync(p, JSON.stringify(j, null, 2), 'utf8'); editedTotal++; }
}
console.log(`\nUpravených súborov: ${editedTotal}`);
if (!COMMIT) { console.log('(dry — spusti s --commit na re-upload)'); process.exit(0); }

// re-upload postihnutých
let ok = 0, fail = 0;
for (const [slug, cfg] of Object.entries(FIX)) {
  const catId = CAT_ID[cfg.cat];
  process.stdout.write(`\n[re-upload] ${slug} … `);
  try {
    const out = execFileSync('node', [resolve(__dirname, 'upload.mjs'), `--input=out/${slug}.final.json`, `--category=${catId}`, '--dry-run=false'],
      { cwd: resolve(__dirname, '..', '..'), encoding: 'utf8', timeout: 300000 });
    const okk = /PUT OK|POST OK/.test(out);
    console.log(okk ? '✓ OK' : '⚠ CHECK');
    okk ? ok++ : fail++;
  } catch (e) { console.log(`❌ ${String(e.message).slice(0, 70)}`); fail++; }
}
console.log(`\n\n===== WAVE A HOTOVO: ${ok} re-uploadnutých, ${fail} problém =====`);

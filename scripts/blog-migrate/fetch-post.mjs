/**
 * Stiahne jednopostový Blogger feed a uloží ho do data/<slug>.json v tvare, ktorý
 * očakáva extract.mjs ({ feed: { entry: [ … ] } }).
 *
 * Jednopostový feed `/feeds/posts/default/<postId>?alt=json` vracia `{ version,
 * encoding, entry }` (entry na najvyššej úrovni, single object) — obalíme ho.
 *
 * Použitie:
 *   node scripts/blog-migrate/fetch-post.mjs --id=<postId> --slug=<slug>
 *   node scripts/blog-migrate/fetch-post.mjs --queue   # stiahne všetky z out_completion-queue.json (../../../hradiska-migration)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, 'data');
mkdirSync(DATA, { recursive: true });

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOne(id, slug) {
  const out = resolve(DATA, `${slug}.json`);
  if (existsSync(out) && !args.force) return { slug, status: 'skip (existuje)' };
  const url = `http://www.hradiska.sk/feeds/posts/default/${id}?alt=json`;
  const r = await fetch(url, { signal: AbortSignal.timeout(40000) });
  if (!r.ok) return { slug, status: `HTTP ${r.status}` };
  const j = await r.json();
  const entry = j.feed?.entry?.[0] || j.entry;
  if (!entry) return { slug, status: 'bez entry' };
  // Normalizuj do tvaru, ktorý číta extract.mjs
  const wrapped = { feed: { entry: Array.isArray(entry) ? entry : [entry] } };
  writeFileSync(out, JSON.stringify(wrapped), 'utf8');
  const html = (Array.isArray(entry) ? entry[0] : entry)?.content?.$t || '';
  return { slug, status: `OK ${(html.length / 1024).toFixed(0)}kB img:${(html.match(/<img/gi) || []).length}` };
}

async function main() {
  if (args.id && args.slug) {
    console.log(await fetchOne(args.id, args.slug));
    return;
  }
  if (args.queue) {
    const qPath = resolve(__dirname, '..', '..', '..', 'hradiska-migration', 'out_completion-queue.json');
    const q = JSON.parse(readFileSync(qPath, 'utf8')).items;
    const old = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', 'hradiska-migration', 'link_audit', 'data', 'all_posts_full.json'), 'utf8'));
    const idByUrl = new Map(Object.entries(old).map(([tag, p]) => [p.url, tag.split('post-')[1]]));
    console.log(`Sťahujem ${q.length} feedov…`);
    let ok = 0;
    for (const it of q) {
      const id = idByUrl.get(it.url);
      if (!id) { console.log(`  ⚠ ${it.slug}: bez ID`); continue; }
      try {
        const res = await fetchOne(id, it.slug);
        console.log(`  ${res.status.startsWith('OK') || res.status.startsWith('skip') ? '✓' : '⚠'} ${it.slug} — ${res.status}`);
        if (res.status.startsWith('OK')) ok++;
        await sleep(500); // throttle voči starému serveru
      } catch (e) { console.log(`  ❌ ${it.slug}: ${e.message}`); }
    }
    console.log(`\nHotovo: ${ok} nových stiahnutých.`);
    return;
  }
  console.log('Použi: --id=<postId> --slug=<slug>  alebo  --queue');
}

main();

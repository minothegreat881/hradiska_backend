/**
 * Link-checker pre migráciu — overí ŽIVOTNOSŤ odkazov v článku.
 *
 * Vstup: intermediate JSON (alebo --urls=a,b,c). Kontroluje LEN obsahové/referenčné
 * odkazy (rich-text link uzly, holé URL v texte, sources items, embed url).
 * Obrázky (coverImage/gallery/image-block) NEkontroluje — tie rieši media pipeline.
 *
 * YouTube/Vimeo overuje cez oEmbed (zistí, či video reálne existuje, nie len či
 * /embed/ vráti 200). Ostatné cez HEAD → fallback GET, s follow redirectov.
 *
 * Výstup: tabuľka url → status → verdikt (ALIVE / DEAD / REDIRECT / UNKNOWN).
 *
 *   node scripts/blog-migrate/check-links.mjs --input=out/<slug>.intermediate.json
 *   node scripts/blog-migrate/check-links.mjs --urls=https://a.sk,https://b.cz
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));

function collectFromIntermediate(j) {
  const urls = new Map(); // url → {usedAs:[]}
  const add = (u, where) => { if (!u) return; const e = urls.get(u) || { usedAs: [] }; e.usedAs.push(where); urls.set(u, e); };
  const bp = j.blogPost || {};
  for (const b of bp.blocks || []) {
    if (b.__component === 'content.rich-text') {
      for (const n of b.body || []) for (const c of n.children || []) {
        if (c.type === 'link' && c.url) add(c.url, 'link');
        if (c.type === 'text' && c.text) (c.text.match(/https?:\/\/[^\s)<>"]+/g) || []).forEach(u => add(u.replace(/[).,;:]+$/, ''), 'bare-url'));
      }
    }
    if (b.__component === 'content.sources') for (const it of b.items || []) if (it.url) add(it.url, 'source');
    if (b.__component === 'content.embed' && b.url) add(b.url, 'embed');
  }
  return urls;
}

function ytId(u) {
  const m = u.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

async function checkOne(url) {
  // YouTube → oEmbed (autoritatívne: existuje video?)
  const yid = ytId(url);
  if (yid) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${yid}&format=json`, { redirect: 'follow' });
      if (r.ok) { const j = await r.json(); return { status: r.status, verdict: 'ALIVE', note: `YouTube: "${(j.title || '').slice(0, 60)}"` }; }
      if (r.status === 401 || r.status === 403) return { status: r.status, verdict: 'DEAD', note: 'video private/embedding disabled' };
      if (r.status === 404) return { status: 404, verdict: 'DEAD', note: 'video deleted/unavailable' };
      return { status: r.status, verdict: 'UNKNOWN', note: 'oEmbed neisté' };
    } catch (e) { return { status: 0, verdict: 'UNKNOWN', note: e.message.slice(0, 60) }; }
  }
  // Ostatné: HEAD → fallback GET
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0 link-check' } });
      const redirected = r.redirected && new URL(r.url).host !== new URL(url).host;
      if (r.ok) return { status: r.status, verdict: redirected ? 'REDIRECT' : 'ALIVE', note: redirected ? `→ ${r.url.slice(0, 70)}` : '' };
      if (r.status === 404 || r.status === 410) return { status: r.status, verdict: 'DEAD', note: '' };
      if (method === 'GET') return { status: r.status, verdict: r.status >= 500 ? 'UNKNOWN' : 'DEAD', note: '' };
    } catch (e) {
      if (method === 'GET') return { status: 0, verdict: 'UNKNOWN', note: e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code || e.message).toString().slice(0, 40) };
    }
  }
  return { status: 0, verdict: 'UNKNOWN', note: '' };
}

async function main() {
  let urls;
  if (args.urls) urls = new Map(String(args.urls).split(',').map(u => [u.trim(), { usedAs: ['cli'] }]));
  else {
    const p = resolve(__dirname, args.input || '');
    urls = collectFromIntermediate(JSON.parse(readFileSync(p, 'utf8')));
  }
  console.log(`Kontrolujem ${urls.size} odkazov…\n`);
  const results = [];
  for (const [u, meta] of urls) {
    const r = await checkOne(u);
    results.push({ url: u, ...r, usedAs: [...new Set(meta.usedAs)].join(',') });
    const icon = r.verdict === 'ALIVE' ? '✅' : r.verdict === 'DEAD' ? '❌' : r.verdict === 'REDIRECT' ? '↪️ ' : '⚠️ ';
    console.log(`${icon} [${String(r.status).padStart(3)}] ${r.verdict.padEnd(8)} ${u}`);
    if (r.note) console.log(`         ${r.note}`);
  }
  const dead = results.filter(r => r.verdict === 'DEAD');
  console.log(`\nSÚHRN: ${results.length} spolu | ✅ ${results.filter(r=>r.verdict==='ALIVE').length} | ❌ ${dead.length} DEAD | ↪️ ${results.filter(r=>r.verdict==='REDIRECT').length} | ⚠️ ${results.filter(r=>r.verdict==='UNKNOWN').length}`);
  if (dead.length) { console.log('\nMŔTVE ODKAZY (na ošetrenie):'); dead.forEach(d => console.log(`  - ${d.url}  [použité ako: ${d.usedAs}]`)); }
}
main().catch(e => { console.error('[fatal]', e); process.exit(1); });

// Stiahne Blogger JSON pre každý príspevok zo zoznamu ciest → data/aktuality-<key>.json
// key = cesta bez lomiek a .html (napr. 2014-05-anketa) — unikátny aj pri rovnakých basenamoch.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://www.hradiska.sk';
const paths = readFileSync(resolve(__dirname, 'data/_aktuality-paths.txt'), 'utf8')
  .split('\n').map(s => s.trim()).filter(Boolean);

const pathKey = (p) => p.replace(/^\//, '').replace(/\.html$/, '').replace(/\//g, '-');

const results = [];
for (const p of paths) {
  const key = pathKey(p);
  const url = `${BASE}/feeds/posts/default?alt=json&path=${p}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log(`ERR   ${key} — HTTP ${r.status}`); results.push({ key, ok: false, http: r.status }); continue; }
    const j = await r.json();
    const e = j.feed?.entry?.[0];
    if (!e) { console.log(`EMPTY ${key} — 0 entries`); results.push({ key, ok: false, empty: true }); continue; }
    writeFileSync(resolve(__dirname, `data/aktuality-${key}.json`), JSON.stringify(j), 'utf8');
    const title = e.title?.$t || '';
    const labels = (e.category || []).map(c => c.term).join(', ');
    const clen = (e.content?.$t || '').length;
    const cCount = e.thr$total?.$t || '0';
    console.log(`OK    ${key} | "${title}" | labels=[${labels}] | text=${clen} | comments=${cCount}`);
    results.push({ key, ok: true, title, labels, clen, cCount: +cCount });
  } catch (err) {
    console.log(`FAIL  ${key} — ${err.message}`);
    results.push({ key, ok: false, err: err.message });
  }
}
writeFileSync(resolve(__dirname, 'data/_aktuality-fetch-report.json'), JSON.stringify(results, null, 2), 'utf8');
const ok = results.filter(r => r.ok).length;
console.log(`\n=== SPOLU: ${results.length} | OK=${ok} | zlyhalo=${results.length - ok} ===`);

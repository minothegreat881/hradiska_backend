/**
 * PLNÁ RE-MIGRÁCIA zakladne-zasady-obcianskeho-zdruzenia-hradiska z originálu (VERBATIM).
 * Migrácia odrezala ~80 % dokumentu — tu obnovíme celý (nadpisy, číslované body, zoznamy).
 * Bez gramatických opráv (tie dodá používateľ neskôr). Logo obrázok (id 5100) zachovaný.
 *   node _remigrate-zasady.mjs            → náhľad štruktúry
 *   node _remigrate-zasady.mjs --commit   → zápis
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '.env') });
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN;
const COMMIT = process.argv.includes('--commit');
const FEED = resolve(__dirname, 'data', 'aktuality-2026-02-zakladne-zasady-obcianskeho-zdruzenia.json');

function getHtml() {
  const j = JSON.parse(readFileSync(FEED, 'utf8'));
  const find = (o) => { if (!o || typeof o !== 'object') return null; if (o.content && (o.content.$t || typeof o.content === 'string')) return o.content.$t || o.content; if (Array.isArray(o)) { for (const e of o) { const r = find(e); if (r) return r; } } for (const k of Object.keys(o)) { const r = find(o[k]); if (r) return r; } return null; };
  return find(j) || '';
}
const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function parse(html) {
  // odstráň obrázkový <a><img></a> a prázdne
  let s = html.replace(/<a\b[^>]*>\s*<img[^>]*>\s*<\/a>/gi, '\n[[IMG]]\n');
  // ponechaj inline <a href> (napr. www.hradiska.sk) ako text
  const els = [];
  // rozdeľ na bloky podľa h2 / b (nadpisy), ul (zoznamy), a p/div (odseky)
  // najprv zjednoť <ul>..</ul> na marker so zoznamom položiek
  s = s.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (m, inner) => {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(x => clean(x[1])).filter(Boolean);
    return '\n[[UL]]' + JSON.stringify(items) + '[[/UL]]\n';
  });
  // nadpisy: <h2..>..</h2> a <b>..</b>
  s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (m, t) => '\n[[H]]' + clean(t) + '[[/H]]\n');
  s = s.replace(/<b>([\s\S]*?)<\/b>/gi, (m, t) => '\n[[H]]' + clean(t) + '[[/H]]\n');
  // odseky: rozdeľ podľa </p> a </div>
  s = s.replace(/<\/(p|div)>/gi, '\n@@@\n');
  // teraz segmentuj
  const parts = s.split(/\n/).map(x => x).filter(x => x !== undefined);
  let buf = '';
  const flush = () => { const t = clean(buf); if (t) els.push({ type: 'paragraph', text: t }); buf = ''; };
  for (const line of s.split('\n')) {
    const L = line.trim();
    if (L === '[[IMG]]') { flush(); els.push({ type: 'image' }); }
    else if (L === '@@@') { flush(); }
    else if (L.startsWith('[[H]]')) { flush(); els.push({ type: 'heading', text: clean(L.replace(/\[\[\/?H\]\]/g, '')) }); }
    else if (L.startsWith('[[UL]]')) { flush(); const items = JSON.parse(L.replace('[[UL]]', '').replace('[[/UL]]', '')); els.push({ type: 'list', items }); }
    else buf += ' ' + line;
  }
  flush();
  return els.filter(e => e.type === 'image' || e.type === 'list' || (e.text && e.text.length));
}

const els = parse(getHtml());
console.log('ELEMENTOV:', els.length);
els.forEach((e, i) => {
  if (e.type === 'image') console.log(String(i).padStart(2) + ' [IMG]');
  else if (e.type === 'heading') console.log(String(i).padStart(2) + ' [H] ' + e.text);
  else if (e.type === 'list') console.log(String(i).padStart(2) + ' [UL ' + e.items.length + '] ' + JSON.stringify(e.items).slice(0, 120));
  else console.log(String(i).padStart(2) + ' [P] ' + e.text.slice(0, 110));
});

// build blocks
function buildBlocks(imgBlock) {
  const blocks = [];
  for (const e of els) {
    if (e.type === 'image') { if (imgBlock) blocks.push(imgBlock); }
    else if (e.type === 'heading') blocks.push({ __component: 'content.rich-text', body: [{ type: 'heading', level: 2, children: [{ type: 'text', text: e.text }] }] });
    else if (e.type === 'list') blocks.push({ __component: 'content.rich-text', body: [{ type: 'list', format: 'unordered', children: e.items.map(t => ({ type: 'list-item', children: [{ type: 'text', text: t }] })) }] });
    else blocks.push({ __component: 'content.rich-text', body: [{ type: 'paragraph', children: [{ type: 'text', text: e.text }] }] });
  }
  return blocks;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=zakladne-zasady-obcianskeho-zdruzenia-hradiska&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  // existujúci image-block (logo)
  const img = (d.blocks || []).find(b => b.__component === 'content.image-block');
  const imgBlock = img ? (() => { const { id, image, ...rest } = img; return { __component: 'content.image-block', ...Object.fromEntries(Object.entries(rest).filter(([k]) => k !== 'id')), image: image?.id ?? image }; })() : null;
  const blocks = buildBlocks(imgBlock);
  console.log('\nBLOKOV:', blocks.length, '| nadpisy:', blocks.filter(b => b.body?.[0]?.type === 'heading').length, '| zoznamy:', blocks.filter(b => b.body?.[0]?.type === 'list').length, '| obrázok:', blocks.some(b => b.__component === 'content.image-block'));

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks } }) });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
}
main();

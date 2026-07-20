// Prevedie existujúci blog-post → aktualitu (kolekcia `aktualita`).
// Obrázky sú už v Strapi media → len referencujeme ich ID (žiadny re-upload).
// Usage: node _blogpost-to-aktualita.mjs <blog-post-slug> [--typ=ine] [--dry-run=false]
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });

const URL = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN || '';
const H = { Authorization: `Bearer ${TOKEN}` };
const arg = (n) => { const p = process.argv.find(a => a.startsWith(`--${n}=`)); return p ? p.split('=').slice(1).join('=') : null; };
const SLUG = process.argv[2];
const TYP = arg('typ') || 'ine';
const DRY = arg('dry-run') !== 'false';
if (!SLUG) { console.error('usage: node _blogpost-to-aktualita.mjs <slug> [--typ=] [--dry-run=false]'); process.exit(1); }

// ── rich-text (Strapi blocks) → Markdown ─────────────────────────────────────
function inlineToMd(node) {
  if (node.type === 'link') { const inner = (node.children || []).map(inlineToMd).join(''); return `[${inner || node.url}](${node.url})`; }
  let t = node.text ?? '';
  if (!t) return '';
  if (node.code) t = '`' + t + '`';
  if (node.bold) t = `**${t}**`;
  if (node.italic) t = `*${t}*`;
  return t;
}
function richTextToMd(body) {
  const out = [];
  for (const node of body || []) {
    if (node.type === 'heading') out.push('#'.repeat(Math.min(Math.max(node.level || 2, 1), 6)) + ' ' + (node.children || []).map(inlineToMd).join('').trim());
    else if (node.type === 'paragraph') { const t = (node.children || []).map(inlineToMd).join('').replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim(); if (t) out.push(t); }
    else if (node.type === 'list') { const b = node.format === 'ordered' ? '1.' : '-'; for (const li of node.children || []) out.push(`${b} ` + (li.children || []).map(inlineToMd).join('').trim()); }
    else if (node.type === 'quote') out.push('> ' + (node.children || []).map(inlineToMd).join('').trim());
  }
  return out.join('\n\n');
}

async function main() {
  const q = `filters[slug][$eq]=${encodeURIComponent(SLUG)}&populate[0]=coverImage&populate[1]=gallery&populate[2]=blocks.image&populate[3]=blocks.images`;
  const r = await fetch(`${URL}/api/blog-posts?${q}`, { headers: H });
  const bp = (await r.json()).data?.[0];
  if (!bp) { console.error('blog-post not found:', SLUG); process.exit(1); }

  // obsah = rich-text bloky → markdown (image-block sa vynecháva, obrázky idú do fotky)
  const parts = [];
  for (const b of bp.blocks || []) {
    if (b.__component === 'content.rich-text') { const md = richTextToMd(b.body); if (md.trim()) parts.push(md); }
  }
  const obsah = parts.join('\n\n').trim();

  // fotky = cover + gallery + obrázky z blokov (unikátne media ID)
  const ids = [];
  const seen = new Set();
  const add = (m) => { if (m?.id && !seen.has(m.id)) { seen.add(m.id); ids.push(m.id); } };
  add(bp.coverImage);
  (bp.gallery || []).forEach(add);
  for (const b of bp.blocks || []) { add(b.image); (b.images || []).forEach(add); }

  const datum = String(bp.publishedAt || bp.createdAt || '').slice(0, 10);
  const data = { nazov: bp.title, obsah, datum, typAktivity: TYP, zvyraznene: false, fotky: ids };

  console.log(`nazov: ${data.nazov}`);
  console.log(`datum: ${datum} | typ: ${TYP} | fotky(ids): ${ids.join(',')} | obsah: ${obsah.length} zn`);
  if (DRY) { console.log('\n--- obsah (markdown) ---\n' + obsah.slice(0, 800)); console.log('\n[DRY-RUN] nič sa nezapísalo. Spusti s --dry-run=false'); return; }

  // idempotencia: ak už aktualita s týmto nazov existuje, iba oznám
  const ex = await (await fetch(`${URL}/api/aktuality?filters[nazov][$eq]=${encodeURIComponent(data.nazov)}&publicationState=preview&pagination[pageSize]=1`, { headers: H })).json();
  if (ex.data?.[0]) { console.log(`už existuje aktualita: ${ex.data[0].documentId} — preskakujem POST`); return; }

  const cr = await fetch(`${URL}/api/aktuality`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...H }, body: JSON.stringify({ data }) });
  const cb = await cr.text();
  if (!cr.ok) { console.error('POST zlyhal:', cr.status, cb.slice(0, 400)); process.exit(1); }
  console.log(`POST OK → aktualita ${JSON.parse(cb).data.documentId}`);
}
main().catch(e => { console.error('[fatal]', e); process.exit(1); });

// Read-only: pre každý slug v _upload-queue.json zistí reálny live stav z API.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') });
const TOKEN = process.env.STRAPI_TOKEN || '';
const BASE = 'http://localhost:1337';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const queue = JSON.parse(readFileSync(resolve(__dirname, '_upload-queue.json'), 'utf8'));

async function getLive(slug) {
  const url = `${BASE}/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slug)}` +
    `&populate[0]=keyFacts&populate[1]=timeline&populate[2]=category` +
    `&pagination[pageSize]=1&publicationState=preview`;
  const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(30000) });
  if (!r.ok) return { err: r.status };
  const j = await r.json();
  return { post: j.data?.[0] || null };
}

let live = 0, missing = 0, needPut = 0;
const missingList = [], putList = [];
for (const item of queue) {
  const inter = JSON.parse(readFileSync(resolve(__dirname, 'out', item.file), 'utf8')).blogPost || {};
  const wantKF = (inter.keyFacts || []).length, wantTL = (inter.timeline || []).length;
  const { post, err } = await getLive(item.slug);
  if (err) { console.log(`ERR   ${item.slug} — HTTP ${err}`); continue; }
  if (!post) {
    missing++; missingList.push(item.slug);
    console.log(`MISS  ${item.slug} — nie je live (want KF=${wantKF} TL=${wantTL})`);
    continue;
  }
  const haveKF = (post.keyFacts || []).length, haveTL = (post.timeline || []).length;
  const gap = (wantKF > 0 && haveKF === 0) || (wantTL > 0 && haveTL === 0);
  if (gap) { needPut++; putList.push({ slug: item.slug, documentId: post.documentId, wantKF, wantTL }); }
  live++;
  console.log(`LIVE  ${item.slug} — KF ${haveKF}/${wantKF} TL ${haveTL}/${wantTL}${gap ? '  <-- treba PUT' : ''}`);
}
console.log(`\n=== SPOLU: ${queue.length} | live=${live} | chýba=${missing} | treba-PUT=${needPut} ===`);
if (missingList.length) console.log('CHÝBA:\n  ' + missingList.join('\n  '));
if (putList.length) console.log('TREBA PUT:\n  ' + putList.map(p => `${p.slug} (${p.documentId}) KF${p.wantKF}/TL${p.wantTL}`).join('\n  '));

/**
 * Doplní threading (inReplyTo) migrovaným komentárom 60 nových článkov.
 * Pri uploade Pass 2 padal na 401 (update controller vyžadoval usera) — teraz
 * je api-token povolený. Mapu sourceBloggerId → documentId beriem z DB (read-only),
 * PUT inReplyTo cez token.  node _rethread-comments.mjs [--commit]
 */
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '.env') });
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN;
const COMMIT = process.argv.includes('--commit');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// mapa sourceBloggerId → documentId (z DB, iba migrované komentáre)
const db = new Database(resolve(__dirname, '..', '..', '.tmp', 'data.db'), { readonly: true });
const rows = db.prepare('select document_id, source_blogger_id, in_reply_to from blog_comments where source_blogger_id is not null').all();
const map = new Map();      // id → Set(documentId)
const already = new Map();  // document_id → má in_reply_to?
for (const r of rows) {
  if (!map.has(r.source_blogger_id)) map.set(r.source_blogger_id, new Set());
  map.get(r.source_blogger_id).add(r.document_id);
  already.set(r.document_id, r.in_reply_to != null);
}
const uniq = (id) => { const s = map.get(id); return s && s.size === 1 ? [...s][0] : null; };

const q = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', 'hradiska-migration', 'out_completion-queue.json'), 'utf8')).items;
const tasks = [];
let totalReplies = 0, collide = 0, miss = 0, alreadyOk = 0;
for (const i of q) {
  const s = i.interSlug || i.slug;
  const p = resolve(__dirname, 'out', `${s}.intermediate.json`);
  if (!existsSync(p)) continue;
  const cs = (JSON.parse(readFileSync(p, 'utf8')).$meta || {}).comments || [];
  for (const c of cs) {
    if (!c.replyToBloggerId) continue;
    totalReplies++;
    const childKey = c.bloggerPostId || c.id;
    const childDoc = uniq(childKey), parentDoc = uniq(c.replyToBloggerId);
    if (!childDoc || !parentDoc) {
      if ((map.get(childKey)?.size > 1) || (map.get(c.replyToBloggerId)?.size > 1)) collide++;
      else miss++;
      continue;
    }
    if (already.get(childDoc)) { alreadyOk++; continue; }
    tasks.push({ slug: s, author: c.author, childDoc, parentDoc });
  }
}
console.log(`Odpovedí spolu: ${totalReplies} | už zanorené: ${alreadyOk} | na doplnenie: ${tasks.length} | kolízia id: ${collide} | nenájdené: ${miss}`);
if (!COMMIT) { console.log('\n(dry-run — spusti s --commit)'); process.exit(0); }
if (!TOKEN) { console.error('CHÝBA STRAPI_TOKEN'); process.exit(1); }

let ok = 0, fail = 0;
for (const t of tasks) {
  try {
    const r = await fetch(`${BASE}/api/blog-comments/${t.childDoc}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ data: { inReplyTo: t.parentDoc } }),
    });
    if (r.ok) { ok++; process.stdout.write('.'); }
    else { fail++; console.log(`\n❌ ${t.slug}/${t.author}: ${r.status} ${(await r.text()).slice(0, 100)}`); }
  } catch (e) { fail++; console.log(`\n❌ ${t.slug}/${t.author}: ${e.message}`); }
  await sleep(250);
}
console.log(`\n\n===== THREADING HOTOVO: ${ok} doplnených, ${fail} problém =====`);

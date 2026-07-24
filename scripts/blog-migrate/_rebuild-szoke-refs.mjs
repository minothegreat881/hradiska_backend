/**
 * REKONŠTRUKCIA referenčného aparátu m-szoke-blatnohrad z feedu.
 * Nahradí 230-položkový mangled sources blok dvomi čistými: „Poznámky pod čiarou" (1–55) + „Zdroje a literatúra".
 *   node _rebuild-szoke-refs.mjs [--commit]
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
const FEED = resolve(__dirname, 'data', 'newsite3-m-szoke-najnovsie-vyskumy-v-blatnohrade-a-okoli.json');
const nfc = (s) => (s == null ? s : String(s).normalize('NFC'));
const stripIds = (o) => Array.isArray(o) ? o.map(stripIds) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)])) : o);
const fix = (s) => nfc(s).split('řø').join('ř').split('ﬂ').join('fl').split('ﬁ').join('fi').split('Szõke').join('Szőke').split('Dezsõsziget').join('Dezsősziget').split('WienKöln-Graz').join('Wien-Köln-Graz').split('Wien­Köln­Graz').join('Wien-Köln-Graz').replace(/\s+([.,;)])/g, '$1').replace(/\s+/g, ' ').trim();

function getHtml() { const j = JSON.parse(readFileSync(FEED, 'utf8')); const find = (o) => { if (!o || typeof o !== 'object') return null; if (o.content && (o.content.$t || typeof o.content === 'string')) return o.content.$t || o.content; if (Array.isArray(o)) { for (const e of o) { const r = find(e); if (r) return r; } } for (const k of Object.keys(o)) { const r = find(o[k]); if (r) return r; } return null; }; return find(j) || ''; }

const raw = getHtml();
let s = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const lines = s.split('\n').map(x => x.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
const BIB_RE = /^[A-ZŠČŘŽÉ][^:]{1,55}?\b\d{4}[a-z]?:/;

const notes = {}; let cur = 0; let started = false;
for (const L of lines) { const m = L.match(/^(\d{1,2})\s+(.+)/); if (m && Number(m[1]) === cur + 1 && cur <= 54) { cur = Number(m[1]); notes[cur] = m[2]; started = true; continue; } if (started && cur >= 1 && notes[cur] !== undefined) notes[cur] += ' ' + L; }
if (notes[55] && notes[55].includes('Bibliography:')) notes[55] = notes[55].split('Bibliography:')[0].trim();
const biIdx = lines.findIndex(l => /Bibliography:/.test(l));
const bibLines = biIdx >= 0 ? lines.slice(biIdx) : [];
if (bibLines.length) bibLines[0] = bibLines[0].replace(/^.*?Bibliography:\s*/, '');
const biblio = []; let entry = '';
for (const L of bibLines) { if (BIB_RE.test(L)) { if (entry) biblio.push(entry.trim()); entry = L; } else entry = entry ? entry + ' ' + L : L; }
if (entry) biblio.push(entry.trim());

const noteItems = []; for (let n = 1; n <= 55; n++) noteItems.push({ text: n + '. ' + fix(notes[n] || ''), url: null });
const bibItems = biblio.map(e => ({ text: fix(e), url: null }));

async function main() {
  const missing = [];
  for (let n = 1; n <= 55; n++) if (!notes[n]) missing.push(n);
  console.log('poznámok:', Object.keys(notes).length, '/55', missing.length ? '(CHÝBA: ' + missing + ')' : '(kompletné)');
  console.log('bibliografia:', bibItems.length, 'záznamov');

  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=m-szoke-najnovsie-vyskumy-v-blatnohrade-a-okoli&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  const srcOld = d.blocks.find(b => b.__component === 'content.sources');
  console.log('starý sources blok položiek:', srcOld?.items?.length);

  let replaced = false;
  const blocks = [];
  for (const b of d.blocks) {
    if (b.__component === 'content.sources' && !replaced) {
      replaced = true;
      blocks.push({ __component: 'content.sources', title: 'Poznámky pod čiarou', intro: null, items: noteItems });
      blocks.push({ __component: 'content.sources', title: 'Zdroje a literatúra', intro: null, items: bibItems });
    } else if (b.__component === 'content.rich-text') blocks.push({ __component: 'content.rich-text', body: stripIds(b.body || []) });
    else if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; blocks.push({ __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }); }
    else blocks.push(stripIds(b));
  }
  console.log('blokov:', d.blocks.length, '→', blocks.length);
  console.log('\nUKÁŽKA poznámok (predtým prázdne):');
  for (const n of [11, 12, 15, 17, 18, 20, 23, 28, 30, 41, 45, 47, 49, 51, 52, 53, 54]) console.log('  ' + n + '. ' + fix(notes[n]));

  if (!COMMIT) { console.log('\n(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

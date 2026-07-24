/**
 * Parser referenčného aparátu z feedu m-szoke-blatnohrad: poznámky 1–55 + bibliografia.
 * Diagnostika (bez zápisu). Aplikuje OCR opravy (řø, ligatúry, Szőke) rovno pri parsovaní.
 *   node _parse-szoke-refs.mjs
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const FEED = resolve(__dirname, 'data', 'newsite3-m-szoke-najnovsie-vyskumy-v-blatnohrade-a-okoli.json');
const nfc = (s) => (s == null ? s : String(s).normalize('NFC'));

function getHtml() {
  const j = JSON.parse(readFileSync(FEED, 'utf8'));
  const find = (o) => { if (!o || typeof o !== 'object') return null; if (o.content && (o.content.$t || typeof o.content === 'string')) return o.content.$t || o.content; if (Array.isArray(o)) { for (const e of o) { const r = find(e); if (r) return r; } } for (const k of Object.keys(o)) { const r = find(o[k]); if (r) return r; } return null; };
  return find(j) || '';
}
// OCR/typo normalizácia (rovnaká ako telo)
const fix = (s) => nfc(s).split('řø').join('ř').split('ﬂ').join('fl').split('ﬁ').join('fi').split('Szõke').join('Szőke').split('Dezsõsziget').join('Dezsősziget')
  .split('WienKöln-Graz').join('Wien-Köln-Graz').split('Wien­Köln­Graz').join('Wien-Köln-Graz')
  .replace(/\s+([.,;)])/g, '$1').replace(/\s+/g, ' ').trim();

const raw = getHtml();
let s = raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const lines = s.split('\n').map(x => x.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);

// --- poznámky 1..55 ---
const BIB_RE = /^[A-ZŠČŘŽÉ][^:]{1,55}?\b\d{4}[a-z]?:/;
const notes = {}; let cur = 0; let started = false;
let biblioText = '';
for (let i = 0; i < lines.length; i++) {
  const L = lines[i];
  const m = L.match(/^(\d{1,2})\s+(.+)/);
  if (m && Number(m[1]) === cur + 1 && cur <= 54) { cur = Number(m[1]); notes[cur] = m[2]; started = true; continue; }
  if (started && cur >= 1 && notes[cur] !== undefined) notes[cur] += ' ' + L;
}
// pozn. 55 pohltila „Bibliography:"; odrež
if (notes[55] && notes[55].includes('Bibliography:')) notes[55] = notes[55].split('Bibliography:')[0].trim();
// --- bibliografia: od riadku obsahujúceho „Bibliography:" po koniec ---
const biIdx = lines.findIndex(l => /Bibliography:/.test(l));
const bibLines = biIdx >= 0 ? lines.slice(biIdx) : [];
if (bibLines.length) bibLines[0] = bibLines[0].replace(/^.*?Bibliography:\s*/, '');
const biblio = [];
let entry = '';
for (const L of bibLines) {
  if (BIB_RE.test(L)) { if (entry) biblio.push(entry.trim()); entry = L; }
  else entry = entry ? entry + ' ' + L : L;
}
if (entry) biblio.push(entry.trim());

console.log('=== POZNÁMKY: ' + Object.keys(notes).length + '/55 ===');
for (let n = 1; n <= 55; n++) console.log('  ' + n + '. ' + (notes[n] ? fix(notes[n]).slice(0, 95) : '❌ CHÝBA'));
console.log('\n=== BIBLIOGRAFIA: ' + biblio.length + ' záznamov ===');
biblio.forEach(e => console.log('  • ' + fix(e).slice(0, 95)));

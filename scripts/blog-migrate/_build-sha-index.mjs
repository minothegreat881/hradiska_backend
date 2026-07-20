// Naplní out/_media-sha256-index.json mapou { sha256(originálneho súboru) -> {mediaId, filename} }
// pre VŠETKY existujúce médiá. Vďaka tomu upload.mjs (ktorý stiahne zdroj, spočíta SHA a
// porovná voči tomuto indexu) EXISTUJÚCE obrázky REUSE-ne namiesto re-uploadu.
// Párovanie je výlučne cez SHA-256 obsahu → NIKDY sa nepomiešajú (na rozdiel od dedupu podľa mena).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = readFileSync(resolve(__dirname, '..', '..', '.env'), 'utf8').match(/^STRAPI_TOKEN=(.*)$/m)[1];
const UPLOADS = resolve(__dirname, '..', '..', 'public', 'uploads');
const IDX_PATH = resolve(__dirname, 'out', '_media-sha256-index.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const r = await fetch('http://localhost:1337/api/upload/files?pagination[pageSize]=100', { headers: { Authorization: `Bearer ${TOKEN}` } });
const j = await r.json();
const media = Array.isArray(j) ? j : (j.results || j.data || []);
console.log('médií z API:', media.length);

const idx = existsSync(IDX_PATH) ? JSON.parse(readFileSync(IDX_PATH, 'utf8')) : {};
const before = Object.keys(idx).length;

let hashed = 0, missing = 0, added = 0;
for (const m of media) {
  const fname = basename(m.url || '');
  if (!fname) { missing++; continue; }
  const fpath = resolve(UPLOADS, fname);
  if (!existsSync(fpath)) { missing++; continue; }
  let buf;
  try { buf = readFileSync(fpath); } catch { missing++; continue; }
  const sha = sha256(buf);
  hashed++;
  if (!idx[sha]) { idx[sha] = { mediaId: m.id, filename: m.name || fname }; added++; }
}
writeFileSync(IDX_PATH, JSON.stringify(idx, null, 1));
console.log(`hashnutých: ${hashed} | chýbajúci súbor: ${missing}`);
console.log(`index: ${before} → ${Object.keys(idx).length} (+${added})`);

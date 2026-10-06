#!/usr/bin/env node
/**
 * rozsahy-en.mjs — číselné rozsahy bez medzier vo vstupných súboroch prekladu.
 *
 * Slovník (§11e) žiada „8th–9th century" a „1–1.5 mm", nie „8th – 9th century".
 * Prekladatelia prenášali slovenskú sadzbu s medzerami a každá terminologická
 * dávka to hlásila znova, takže sa to patrí spraviť raz a hromadne.
 *
 * Mení LEN pomlčku medzi dvoma číslami — pomlčka s písmenom na niektorej strane
 * (vsuvka vo vete) sa nedotkne.
 *
 *   node scripts/opravy/rozsahy-en.mjs            # nasucho, s ukážkami
 *   node scripts/opravy/rozsahy-en.mjs --zapis
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const PREKLADY = resolve(TU, '..', 'preklad', 'preklady');
const ZAPIS = process.argv.includes('--zapis');
const slugy = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/* číslo (aj poradové, aj s desatinnou časťou) – pomlčka v medzerách – číslo */
const VZOR = /(\d+(?:[.,]\d+)?(?:st|nd|rd|th)?)[  ]+[–—-][  ]+(?=\d)/g;
/* percento sa v angličtine píše bez medzery (§11e) */
const VZOR_PERCENT = /(\d)[  ]+%/g;

const uprav = (t) => {
  let pocet = 0;
  let von = t.replace(VZOR, (_, cislo) => { pocet++; return `${cislo}–`; });
  von = von.replace(VZOR_PERCENT, (_, cislo) => { pocet++; return `${cislo}%`; });
  return { text: von, pocet };
};

const fronta = slugy.length
  ? slugy
  : readdirSync(PREKLADY).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => basename(f, '.json'));

let suborov = 0, zmien = 0;
for (const slug of fronta) {
  const cesta = resolve(PREKLADY, `${slug}.json`);
  let d;
  try { d = JSON.parse(readFileSync(cesta, 'utf8')); } catch { continue; }

  let pocet = 0;
  const ukazky = [];
  const prejdi = (n) => {
    if (Array.isArray(n)) return n.forEach(prejdi);
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) {
      if (typeof v === 'string') {
        const r = uprav(v);
        if (r.pocet) {
          if (ukazky.length < 3) {
            const i = Math.max(0, Math.min(...[v.search(VZOR), v.search(VZOR_PERCENT)].filter((x) => x >= 0)));
            ukazky.push(v.slice(Math.max(0, i - 25), i + 35).replace(/\s+/g, ' '));
          }
          n[k] = r.text;
          pocet += r.pocet;
        }
      } else prejdi(v);
    }
  };
  prejdi(d.data);
  if (!pocet) continue;

  suborov++; zmien += pocet;
  console.log(`• ${slug}: ${pocet}`);
  for (const u of ukazky) console.log(`    ${u}`);
  if (ZAPIS) writeFileSync(cesta, JSON.stringify(d, null, 1), 'utf8');
}

console.log(`\nsúborov ${suborov} · opravených rozsahov ${zmien}`);
if (!ZAPIS) console.log('(nasucho — nič sa nezapísalo)');

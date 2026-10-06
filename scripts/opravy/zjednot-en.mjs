#!/usr/bin/env node
/**
 * zjednot-en.mjs — celokorpusové zjednotenie termínov vo vstupných súboroch.
 *
 * Veci, pri ktorých sa jednotlivé dávky terminológa rozchádzali a slovník ich
 * medzitým rozhodol (§11e). Dávka opraví len to, čo má práve pred sebou, takže
 * zvyšok korpusu treba dorovnať naraz — inak zostane „central Europe" v 35
 * článkoch a „Central Europe" v 86.
 *
 * Len jednoznačné náhrady: nič, čo závisí od kontextu (napr. *small fort*, ktoré
 * pri rímskom objekte ostáva správne, alebo *the Turks* mimo 16.–17. storočia).
 *
 *   node scripts/opravy/zjednot-en.mjs            # nasucho, s počtami
 *   node scripts/opravy/zjednot-en.mjs --zapis
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const PREKLADY = resolve(TU, '..', 'preklad', 'preklady');
const ZAPIS = process.argv.includes('--zapis');

/** [vzor, náhrada, prečo] */
const NAHRADY = [
  [/\bcentral Europe\b/g, 'Central Europe', 'región sa píše veľkým (§0)'],
  [/\bcentral European\b/g, 'Central European', 'to isté v prívlastku'],
  [/\beastern Europe\b/g, 'Eastern Europe', 'to isté'],
  [/\bcounty castle\b/g, 'comital castle', '§11e župný hrad'],
  [/\bcounty castles\b/g, 'comital castles', '§11e župný hrad'],
  [/\bmagnate's residence\b/g, "magnate's court", '§11e dvorec'],
  [/\bmagnate's residences\b/g, "magnate's courts", '§11e dvorec'],
  [/\bPovažské Museum\b/g, 'Považie Museum', '§11e Považské múzeum'],
  [/\bafterworld\b/g, 'afterlife', '§11e záhrobie'],
  [/\bupland settlement\b/g, 'hilltop settlement', '§11e výšinné sídlisko'],
  [/\bupland settlements\b/g, 'hilltop settlements', '§11e výšinné sídlisko'],
  [/\bpellet bell\b/g, 'rattle', '§11e rolnička'],
  [/\bpellet bells\b/g, 'rattles', '§11e rolnička'],
  [/\brock bedrock\b/g, 'bedrock', '§11e skalné podložie'],
  [/\brock subsoil\b/g, 'bedrock', '§11e skalné podložie'],
  [/\bopen-air archaeological museum\b/g, 'archaeological open-air museum', '§11d skanzen'],
  [/\bwestern Europe\b/g, 'Western Europe', 'región sa píše veľkým (§0)'],
  [/\bwest(ern)? European\b/g, 'Western European', 'to isté v prívlastku'],
  [/\beast(ern)? European\b/g, 'Eastern European', 'to isté v prívlastku'],
  [/crown of the rampart/g, 'crest of the rampart', '§11e koruna valu'],
  [/\bin the terrain\b/g, 'on the ground', '§11e terénna situácia'],
];

const fronta = readdirSync(PREKLADY)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => basename(f, '.json'));

const spolu = new Map();
let suborov = 0, zmien = 0;
for (const slug of fronta) {
  const cesta = resolve(PREKLADY, `${slug}.json`);
  let d;
  try { d = JSON.parse(readFileSync(cesta, 'utf8')); } catch { continue; }

  let pocet = 0;
  const prejdi = (n) => {
    if (Array.isArray(n)) return n.forEach(prejdi);
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) {
      if (typeof v !== 'string') { prejdi(v); continue; }
      let t = v;
      for (const [vzor, na, preco] of NAHRADY) {
        const kolko = (t.match(vzor) || []).length;
        if (!kolko) continue;
        t = t.replace(vzor, na);
        pocet += kolko;
        spolu.set(preco, (spolu.get(preco) || 0) + kolko);
      }
      if (t !== v) n[k] = t;
    }
  };
  prejdi(d.data);
  if (!pocet) continue;

  suborov++; zmien += pocet;
  console.log(`• ${slug}: ${pocet}`);
  if (ZAPIS) writeFileSync(cesta, JSON.stringify(d, null, 1), 'utf8');
}

console.log('');
for (const [preco, kolko] of [...spolu].sort((a, b) => b[1] - a[1])) console.log(`  ${kolko}× ${preco}`);
console.log(`\nsúborov ${suborov} · zmien ${zmien}`);
if (!ZAPIS) console.log('(nasucho — nič sa nezapísalo)');

#!/usr/bin/env node
/**
 * odseknute-polia.mjs — polia, ktoré vyzerajú odseknuté na limite schémy.
 *
 * Keď preklad narazil na `maxLength`, niekde sa veta jednoducho odrezala:
 * `timeline.year` zostal ako „Turn of the 9th and 10th centuries – beginning of."
 * (presne 50 znakov). Takýto text treba preformulovať, nie predĺžiť.
 *
 * Hľadá sa dvoje: dĺžka tesne na limite a veta, ktorá končí na spojku,
 * predložku alebo čiarku.
 *
 * Nič nemení, nepotrebuje ani API.
 *
 *   node scripts/kontrola/odseknute-polia.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const PREKLADY = resolve(TU, '..', 'preklad', 'preklady');

/* limity schémy, pri ktorých sa text reže */
const LIMITY = [
  ['title', 255], ['slug', 255], ['excerpt', 500], ['metaTitle', 70], ['metaDescription', 160],
  ['year', 50], ['label', 255], ['value', 255], ['caption', 500], ['alt', 255], ['description', 500],
  ['source', 255], ['author', 255],   // `text` citátu a zdrojov limit nemá
];
const LIMIT = new Map(LIMITY);
/* Koniec, ktorý nemá kde skončiť. Pozor: po anglicky sa veta legitímne končí
   na „…he was looking for." — predložka na konci teda sama nestačí. Hlási sa:
   slovo, ktoré vetu ukončiť nemôže ani s bodkou; predložka či spojka BEZ
   koncovej interpunkcie; a koniec na čiarke alebo pomlčke. */
const NIKDY = /(?<![\p{L}\p{N}])(?:and|or|of|the|an?|with|from|by|that|which|its|their|was|were|is|are)\s*[.]?\s*$/iu;
const BEZ_BODKY = /(?<![\p{L}\p{N}])(?:in|on|at|to|for|as|than|into|over|under|about|between)\s*$/iu;
const KONCI_SPOJKOU = /[,–—]\s*$/;   // dvojbodka pred odkazom je v poriadku
const visiaci = (t) => NIKDY.test(t) || BEZ_BODKY.test(t) || KONCI_SPOJKOU.test(t);

const fronta = readdirSync(PREKLADY)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => basename(f, '.json'));

let suborov = 0, naleznov = 0;
for (const slug of fronta) {
  let d;
  try { d = JSON.parse(readFileSync(resolve(PREKLADY, `${slug}.json`), 'utf8')); } catch { continue; }

  const najdene = [];
  const prejdi = (n, cesta) => {
    if (Array.isArray(n)) return n.forEach((x, i) => prejdi(x, `${cesta}[${i}]`));
    if (!n || typeof n !== 'object') return;
    for (const [k, v] of Object.entries(n)) {
      /* `body` je rich text rozsekaný na úseky podľa formátovania — úsek
         končiaci na „the" je tam normálny, nie odseknutá veta. */
      if (k === 'body') continue;
      if (typeof v === 'string') {
        const limit = LIMIT.get(k);
        const dlzka = v.length;
        const tesne = limit && dlzka >= limit - 2;
        const visi = dlzka > 25 && visiaci(v);
        if (tesne || visi) {
          najdene.push(`${cesta}.${k} (${dlzka}${limit ? '/' + limit : ''}${tesne ? ' NA LIMITE' : ''}${visi ? ' VISIACI KONIEC' : ''}): …${v.slice(-70)}`);
        }
      } else prejdi(v, `${cesta}.${k}`);
    }
  };
  prejdi(d.data, 'data');
  if (!najdene.length) continue;

  suborov++; naleznov += najdene.length;
  console.log(`• ${slug}`);
  for (const n of najdene) console.log(`    ${n}`);
}

console.log(`\nsúborov ${suborov} · nálezov ${naleznov}`);

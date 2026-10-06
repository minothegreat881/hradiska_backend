#!/usr/bin/env node
/**
 * kostra-zo-sk.mjs — poskladá bloky vstupného súboru prekladu na slovenskej kostre.
 *
 * `zrovnaj-bloky.mjs` stačí, keď prekladateľ bloky len poprehadzoval. Keď sa
 * nezhodujú ani počty, preusporiadanie nepomôže a poradie obrázkov sa nedá
 * uhádnuť z poradia v súbore. Tu sa postupuje naopak: vezme sa slovenská
 * kostra (vrátane rozvrhu obrázkov, ktorý má byť v oboch jazykoch rovnaký)
 * a doplní sa do nej anglický text:
 *
 *   • obrázok  — všetky polia rozvrhu zo slovenčiny; popis a alt z `mediaTexts`
 *                podľa id obrázka (fotka, ktorej autor popis nedal, ostáva bez
 *                popisu aj v angličtine)
 *   • text     — anglické bloky toho istého typu v poradí, 1 : 1
 *   • zdroje   — len nadpis a úvod; položky kopíruje zapisovač zo slovenčiny
 *
 * Keď počet textových blokov niektorého typu nesedí, súbor sa nechá na pokoji —
 * prebytočné bloky treba najprv vyriešiť (zliať alebo zmazať), lebo o texte
 * skript rozhodovať nemá.
 *
 *   node scripts/opravy/kostra-zo-sk.mjs <slug> [--zapis]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TU = dirname(fileURLToPath(import.meta.url));
const PREKLADY = resolve(TU, '..', 'preklad', 'preklady');
const API = 'http://188.245.47.29';
const ZAPIS = process.argv.includes('--zapis');
const slugy = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** Polia obrázkového bloku, ktoré sa berú zo slovenčiny. */
const ROZVRH = ['width', 'position', 'aspectRatio', 'objectPosition', 'showCaption', 'rounded', 'shadow', 'pairWithNext'];

async function skClanok(slug) {
  const q = new URLSearchParams({ 'filters[slug][$eq]': slug, 'populate[blocks][populate]': '*' });
  const r = await fetch(`${API}/api/blog-posts?${q}`);
  const j = await r.json();
  if (!j.data?.length) throw new Error('slovenský článok sa nenašiel');
  return j.data[0];
}

for (const slug of slugy) {
  const cesta = resolve(PREKLADY, `${slug}.json`);
  const d = JSON.parse(readFileSync(cesta, 'utf8'));
  const en = d.data.blocks || [];
  const sk = (await skClanok(slug)).blocks || [];

  /* anglické bloky podľa typu, v poradí */
  const zasoby = new Map();
  for (const b of en) {
    if (b.__component === 'content.image-block') continue;   // obrázky idú z kostry
    if (!zasoby.has(b.__component)) zasoby.set(b.__component, []);
    zasoby.get(b.__component).push(b);
  }
  const popisy = new Map((d.data.mediaTexts || []).map((m) => [m.mediaId, m]));

  /* kontrola počtov pred zásahom */
  const treba = new Map();
  for (const b of sk) {
    if (b.__component === 'content.image-block') continue;
    treba.set(b.__component, (treba.get(b.__component) || 0) + 1);
  }
  let sedi = true;
  for (const [typ, n] of treba) {
    const m = (zasoby.get(typ) || []).length;
    if (m !== n) { console.log(`!! ${slug}: ${typ.replace('content.', '')} sk ${n} ≠ en ${m}`); sedi = false; }
  }
  for (const [typ, zoz] of zasoby) {
    if (!treba.has(typ)) { console.log(`!! ${slug}: ${typ.replace('content.', '')} je v angličtine navyše (${zoz.length})`); sedi = false; }
  }
  if (!sedi) { console.log(`   ${slug} — nechávam na pokoji`); continue; }

  const nove = [];
  for (const b of sk) {
    if (b.__component === 'content.image-block') {
      const id = b.image?.id;
      const p = popisy.get(id);
      const blok = { __component: 'content.image-block', caption: p?.caption || '', alt: p?.alt || b.alt || '.' };
      for (const k of ROZVRH) blok[k] = b[k];
      nove.push(blok);
      continue;
    }
    const z = zasoby.get(b.__component).shift();
    if (b.__component === 'content.sources') {
      nove.push({ __component: 'content.sources', title: z.title, intro: z.intro ?? null, items: [] });
      continue;
    }
    nove.push(z);
  }

  const obr = nove.filter((b) => b.__component === 'content.image-block').length;
  console.log(`• ${slug}: blokov ${nove.length} (obrázkov ${obr}, z toho s popisom ${nove.filter((b) => b.__component === 'content.image-block' && b.caption).length})`);
  if (!ZAPIS) continue;
  d.data.blocks = nove;
  writeFileSync(cesta, JSON.stringify(d, null, 1), 'utf8');
}

if (!ZAPIS) console.log('(nasucho — nič sa nezapísalo)');

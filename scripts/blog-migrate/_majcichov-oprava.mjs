/**
 * OPRAVA MIGRÁCIE — Majcichov.
 *
 * Článok prešiel extrakciou 12. 6. 2026, teda v prvej dávke ešte pred
 * pravidlami §17 (rytmus obrázkov + „galéria obsahuje všetky"). Dôsledok:
 * z 19 fotografií originálu sa nahralo 5, galéria ostala prázdna, tri
 * obrázky stáli za sebou hneď na začiatku a desaťtisíc znakov textu
 * o výskume nemalo ani jednu ilustráciu.
 *
 * Čo tento skript robí:
 *   1. dotiahne 14 chýbajúcich fotografií z Blogger CDN a nahrá ich,
 *   2. rozdelí ten jeden 9 645-znakový odsek na časti podľa medzititulkov,
 *      ktoré v ňom UŽ SÚ ako tučné uzly (Priekopa, Čelná plenta, Komora,
 *      Nálezy, Datovanie) — ani jeden znak textu sa pritom nemení,
 *   3. rozloží obrázky do vzniknutých medzier (nikdy dva za sebou),
 *   4. naplní galériu všetkými fotografiami,
 *   5. z tela vyhodí hlavičku starého webu (nie je to obsah článku) a
 *      titulnú fotku, ktorá tam stála druhýkrát.
 *
 * Text článku sa NEPREPISUJE. Berie sa zo živého článku, teda aj s opravami
 * z korektorského priechodu — preto sa nepoužíva čerstvý extrakt, len jeho
 * zoznam obrázkov.
 *
 * Spustenie:
 *   node _majcichov-oprava.mjs --strapiUrl=http://188.245.47.29          (nasucho)
 *   node _majcichov-oprava.mjs --strapiUrl=http://188.245.47.29 --apply  (zapíše)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/* .env z koreňa backendu — STRAPI_TOKEN */
const envPath = resolve(__dirname, '../../.env');
if (existsSync(envPath)) {
  for (const r of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = r.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true];
}));
const STRAPI = (args.strapiUrl ?? 'http://localhost:1337').replace(/\/$/, '');
const TOKEN = process.env.STRAPI_TOKEN;
const APPLY = !!args.apply;
const HLAVA = { Authorization: `Bearer ${TOKEN}` };
const SLUG = 'majcichov';

if (!TOKEN) { console.error('[chyba] chýba STRAPI_TOKEN'); process.exit(1); }

async function get(cesta) {
  const r = await fetch(STRAPI + cesta, { headers: HLAVA, signal: AbortSignal.timeout(120000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`GET ${cesta} → ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t);
}

/* ─── 1 · živý článok ──────────────────────────────────────────────────── */
const dotaz = '/api/blog-posts?filters[slug][$eq]=' + SLUG
  + '&populate[blocks][on][content.image-block][populate][image][fields][0]=name'
  + '&populate[blocks][on][content.rich-text][populate]=*'
  + '&populate[gallery][fields][0]=name';
const zivy = (await get(dotaz)).data?.[0];
if (!zivy) { console.error('[chyba] článok sa nenašiel'); process.exit(1); }
console.log(`[živý] ${zivy.title} · documentId ${zivy.documentId} · blokov ${zivy.blocks.length} · galéria ${(zivy.gallery || []).length}`);

/* Mená sa porovnávajú v NFC. Strapi má časť súborov uloženú v NFD (rozložená
   diakritika), takže „Bez názvu 4.jpg" z extraktu by sa inak s tým istým
   súborom v médiách nestretlo a nahrali by sme ho druhýkrát. */
const nfc = (s) => (s || '').normalize('NFC');
const zivePodlaMena = new Map();
for (const b of zivy.blocks) if (b.__component === 'content.image-block' && b.image) zivePodlaMena.set(nfc(b.image.name), { id: b.image.id, blok: b });

/* ─── 2 · obrázky z čerstvého extraktu (len zoznam, nie text) ──────────── */
const extrakt = JSON.parse(readFileSync(resolve(__dirname, 'out/majcichov.intermediate.json'), 'utf8')).blogPost;
const JE_HLAVICKA = (n) => /Hlavi/i.test(n);
const vsetky = extrakt.gallery.filter((g) => !JE_HLAVICKA(g.filename));
console.log(`[extrakt] fotografií v origináli: ${vsetky.length} (+1 hlavička webu, tú vynechávame)`);

/** Meno, pod ktorým obrázok leží v médiách — Strapi si ho pri nahratí nechá. */
const normMeno = (f) => nfc(decodeURIComponent(decodeURIComponent(f)));

async function najdiVMediach(meno) {
  const j = await get(`/api/upload/files?filters[name][$eq]=${encodeURIComponent(meno)}`);
  const pole = Array.isArray(j) ? j : (j.results ?? j.data ?? []);
  return pole[0]?.id ?? null;
}

async function stiahni(url, zaloha) {
  for (const u of [url, zaloha]) {
    if (!u) continue;
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(90000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 1000) return { buf, typ: r.headers.get('content-type') || 'image/jpeg' };
    } catch { /* skúsime záložnú */ }
  }
  return null;
}

async function nahraj(buf, meno, typ, popis) {
  const fd = new FormData();
  fd.append('files', new Blob([buf], { type: typ }), meno);
  if (popis) fd.append('fileInfo', JSON.stringify({ caption: popis, alternativeText: popis, name: meno }));
  const r = await fetch(`${STRAPI}/api/upload`, { method: 'POST', headers: { ...HLAVA, Connection: 'close' }, body: fd, signal: AbortSignal.timeout(180000) });
  const t = await r.text();
  if (!r.ok) throw new Error(`UPLOAD ${meno} → ${r.status}: ${t.slice(0, 300)}`);
  const j = JSON.parse(t);
  return (Array.isArray(j) ? j[0] : j).id;
}

const idPodlaMena = new Map();
for (const g of vsetky) {
  const meno = normMeno(g.filename);
  const zive = zivePodlaMena.get(nfc(g.filename)) || zivePodlaMena.get(meno);
  if (zive) { idPodlaMena.set(meno, zive.id); console.log(`  = už je v článku: ${meno} (id ${zive.id})`); continue; }
  const vMediach = await najdiVMediach(meno);
  if (vMediach) { idPodlaMena.set(meno, vMediach); console.log(`  = už je v médiách: ${meno} (id ${vMediach})`); continue; }
  if (!APPLY) { console.log(`  + CHÝBA, nahral by som: ${meno}`); idPodlaMena.set(meno, null); continue; }
  const st = await stiahni(g.sourceUrl, g.fallbackUrl);
  if (!st) { console.warn(`  ! nedá sa stiahnuť: ${meno}`); idPodlaMena.set(meno, null); continue; }
  const id = await nahraj(st.buf, meno, st.typ, g.caption || undefined);
  idPodlaMena.set(meno, id);
  console.log(`  + nahrané: ${meno} → id ${id} (${(st.buf.length / 1024).toFixed(0)} kB)`);
}


/* ─── 3 · rozdelenie veľkého odseku ────────────────────────────────────── */
/**
 * Blok 5 je JEDEN odsek s 9 645 znakmi, v ktorom sú medzititulky (Priekopa,
 * Čelná plenta, Komora, Nálezy, Datovanie) len tučné textové uzly uprostred.
 * Rozdelíme ho na samostatné bloky PODĽA TÝCHTO UZLOV — text sa nemení, len
 * sa prestane liať v jednom kuse. Bez toho nie je kam dať fotografie
 * z výskumu, ktoré k nemu patria.
 */
const ODSEK = (deti) => ({ type: 'paragraph', children: deti });
const TEXT = (t, tucne) => (tucne ? { type: 'text', text: t, bold: true } : { type: 'text', text: t });
const RICH = (odseky) => ({ __component: 'content.rich-text', body: odseky });

function rozdelVelkyOdsek(blok) {
  const deti = blok.body[0].children;
  const casti = [];
  let bezna = [];
  for (const d of deti) {
    if (d.bold && (d.text || '').trim().length < 40) { if (bezna.length) casti.push(bezna); bezna = [d]; }
    else bezna.push(d);
  }
  if (bezna.length) casti.push(bezna);

  const bloky = [];
  for (const cast of casti) {
    const [prvy, ...zvysok] = cast;
    if (prvy.bold) {
      // medzititulok ako vlastný odsek, zvyšok pod ním
      const telo = zvysok.map((d) => ({ ...d, text: d.text.replace(/^[ \t]*\n[ \t]*/, '') }));
      bloky.push(RICH([ODSEK([prvy]), ODSEK(telo)]));
    } else {
      // úvodná časť je samá na 4 700 znakov — rozdelíme ju na odseky tam,
      // kde sa v origináli začínala nová myšlienka (vety sú v texte, nemeníme ich)
      const t = cast.map((d) => d.text).join('');
      const rezy = ['Prvý zisťovací výskum', 'Geofyzikálne merania naznačili'];
      let zvysokT = t;
      const kusy = [];
      for (const r of rezy) {
        const i = zvysokT.indexOf(r);
        if (i > 0) { kusy.push(zvysokT.slice(0, i)); zvysokT = zvysokT.slice(i); }
      }
      kusy.push(zvysokT);
      for (const k of kusy) bloky.push(RICH([ODSEK([TEXT(k.replace(/^[ \t\n]+/, ''))])]));
    }
  }
  return bloky;
}

const telo = [];
for (let i = 0; i < zivy.blocks.length; i++) {
  const b = zivy.blocks[i];
  if (b.__component === 'content.image-block') continue;        // obrázky skladáme nanovo
  if (i === 5) { telo.push(...rozdelVelkyOdsek(b)); continue; } // veľký odsek rozbijeme
  telo.push(RICH(b.body));
}
console.log(`\n[text] blokov textu po rozdelení: ${telo.length} (pôvodne ${zivy.blocks.filter((b) => b.__component === 'content.rich-text').length})`);
telo.forEach((t, i) => {
  const dlzka = t.body.reduce((n, o) => n + o.children.reduce((m, c) => m + (c.text || '').length, 0), 0);
  console.log(`   [${String(i).padStart(2)}] ${String(dlzka).padStart(5)} zn.  ${t.body[0].children.map((c) => c.text).join('').slice(0, 58)}`);
});

/* ─── 4 · rozmiestnenie obrázkov ───────────────────────────────────────── */
/**
 * Pravidlo z MIGRATION.md §17: obrázok do tela len ak od posledného pribudlo
 * ≥ 800 znakov a nikdy dva za sebou. Dve miesta sú vedome pod prahom —
 * veta „Ako zachytáva obrázok…" a dvojica Variant A/B sa na konkrétne
 * obrázky priamo odvolávajú, takže patria k nim, nie o tri odseky ďalej.
 */
const PLAN = [
  { po: 1,  subor: 'map.jpg' },
  { po: 2,  subor: 'Majcichov-35.jpg' },
  { po: 3,  subor: 'geofyz.jpg' },
  { po: 4,  subor: 'Majcichov-10.jpg' },
  { po: 6,  subor: 'Majcichov-21.jpg' },
  { po: 7,  subor: 'Majcichov-23.jpg' },
  { po: 8,  subor: 'Majcichov-36.jpg' },
  { po: 10, subor: 'Bez+názvu+4.jpg' },
  { po: 11, subor: 'rekonštrukcia+Majcichov.jpg', popis: 'Staršie rekonštrukcie hradby' },
  { po: 13, subor: 'majc.jpg' },
];

/** Popisy a nastavenia z už existujúcich blokov sa preberajú — sú po korektúre. */
const zivyBlokPodlaMena = new Map();
for (const b of zivy.blocks) if (b.__component === 'content.image-block' && b.image) zivyBlokPodlaMena.set(nfc(b.image.name), b);

function obrazokBlok(subor, popisNavyse) {
  const meno = nfc(subor);
  const id = idPodlaMena.get(meno);
  const stary = zivyBlokPodlaMena.get(meno) || zivyBlokPodlaMena.get(nfc(subor.replace(/ /g, '+')));
  const popis = stary?.caption || popisNavyse || '';
  return {
    __component: 'content.image-block',
    caption: popis, alt: popis || 'Majcichov',
    width: '60', aspectRatio: 'auto', objectPosition: 'center center',
    showCaption: !!popis, rounded: true, shadow: true, position: 'center', pairWithNext: false,
    image: id,
  };
}

const bloky = [];
telo.forEach((t, i) => {
  bloky.push(t);
  for (const p of PLAN.filter((x) => x.po === i)) bloky.push(obrazokBlok(p.subor, p.popis));
});

/* Galéria: VŠETKY fotografie originálu (telo ⊆ galéria). Hlavička webu nie. */
const galeria = vsetky.map((g) => idPodlaMena.get(normMeno(g.filename))).filter(Boolean);

const chybajuce = PLAN.filter((p) => !idPodlaMena.get(nfc(p.subor)));
console.log(`\n[telo] blokov spolu: ${bloky.length} (text ${telo.length}, obrázky ${PLAN.length})`);
console.log(`[galéria] ${galeria.length} z ${vsetky.length} fotografií`);
if (chybajuce.length) console.log(`[pozor] bez id (nasucho je to normálne): ${chybajuce.map((c) => c.subor).join(', ')}`);

let dvaZaSebou = 0, poslednyObr = -9;
bloky.forEach((b, i) => { if (b.__component === 'content.image-block') { if (i - poslednyObr === 1) dvaZaSebou++; poslednyObr = i; } });
console.log(`[kontrola] dva obrázky za sebou: ${dvaZaSebou}`);

if (!APPLY) {
  console.log('\nNasucho — nič sa nezapísalo. Spusti s --apply.');
  process.exit(0);
}
if (galeria.length !== vsetky.length || chybajuce.length) {
  console.error('[chyba] nie sú nahrané všetky obrázky, zápis nespúšťam.');
  process.exit(1);
}

/* ─── 5 · zápis ────────────────────────────────────────────────────────── */
const r = await fetch(`${STRAPI}/api/blog-posts/${zivy.documentId}`, {
  method: 'PUT',
  headers: { ...HLAVA, 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { blocks: bloky, gallery: galeria } }),
  signal: AbortSignal.timeout(180000),
});
const odpoved = await r.text();
if (!r.ok) { console.error(`[chyba] PUT → ${r.status}: ${odpoved.slice(0, 600)}`); process.exit(1); }
console.log('[ok] zapísané');

const po = (await get(dotaz)).data?.[0];
console.log(`[po zápise] blokov ${po.blocks.length} · obrázkov v tele ${po.blocks.filter((b) => b.__component === 'content.image-block').length} · galéria ${(po.gallery || []).length}`);


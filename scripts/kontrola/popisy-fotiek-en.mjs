#!/usr/bin/env node
/**
 * popisy-fotiek-en.mjs — fotky, ktoré sú na anglickej stránke po slovensky.
 *
 * Popis a `alt` sú v knižnici médií spoločné pre oba jazyky; anglické znenie
 * nesie pole `mediaTexts`. Keď pre obrázok so slovenským popisom anglická
 * verzia `mediaTexts` nemá, stránka ukáže slovenský popis.
 *
 * Pre každý článok sa teda zoberú všetky médiá so slovenským textom (obrázkový
 * blok, galéria, obálka) a overí sa, že anglická verzia má pre ne popis.
 *
 * Číta verejné API, nič nemení. Pri 429 čaká a skúša znova.
 *
 *   node scripts/kontrola/popisy-fotiek-en.mjs            # len články s medzerou
 *   node scripts/kontrola/popisy-fotiek-en.mjs --vsetko   # aj počty pri úplných
 */

const API = 'http://188.245.47.29';
const VSETKO = process.argv.includes('--vsetko');
const pockaj = (ms) => new Promise((r) => setTimeout(r, ms));
const prazdne = (t) => !t || !String(t).trim() || String(t).trim() === '.' || String(t).trim() === '-';

async function ziskaj(url) {
  for (let pokus = 1; ; pokus++) {
    const r = await fetch(url);
    if (r.status === 429 && pokus <= 8) { await pockaj(2000 * pokus); continue; }
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  }
}

async function clanky(locale) {
  const von = [];
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({
      locale, 'pagination[page]': String(page), 'pagination[pageSize]': '50',
      'fields[0]': 'slug', 'fields[1]': 'documentId',
      'populate[blocks][populate]': '*', 'populate[gallery]': 'true',
      'populate[coverImage]': 'true', 'populate[mediaTexts]': 'true',
    });
    const j = await ziskaj(`${API}/api/blog-posts?${q}`);
    von.push(...j.data);
    if (von.length >= j.meta.pagination.total) return von;
  }
}

const sk = await clanky('sk');
const en = await clanky('en');
const enPodlaId = new Map(en.map((c) => [c.documentId, c]));

let clankovSMedzerou = 0, fotiekSMedzerou = 0, fotiekSPopisom = 0, viditelnych = 0;
for (const s of sk) {
  const e = enPodlaId.get(s.documentId);
  if (!e) continue;

  /* médiá, ktoré v slovenčine nejaký text majú */
  const soSlovenskym = new Map();
  const zapis = (m, caption, alt) => {
    if (!m || typeof m.id !== 'number') return;
    /* Viditeľný popis je to, čo čitateľ vidí pod fotkou; `alt` číta len
       čítačka a vyhľadávač — v hlásení sa to rozlišuje. */
    const vidno = [caption, m.caption].find((x) => !prazdne(x));
    const skryte = [alt, m.alternativeText].find((x) => !prazdne(x));
    if (vidno || skryte) soSlovenskym.set(m.id, { text: vidno || skryte, vidno: !!vidno });
  };
  /* Obrázok v bloku má vlastný anglický popis priamo v bloku — pozerá sa naň
     skôr než do knižnice médií, takže cez `mediaTexts` ho riešiť netreba.
     Na `mediaTexts` sú odkázané len fotky v galérii a obálka. */
  const vBloku = new Set();
  (s.blocks || []).forEach((b, i) => {
    if (!b.image) return;
    vBloku.add(b.image.id);
    const eb = (e.blocks || [])[i];
    const maAnglicky = eb && (!prazdne(eb.caption) || !prazdne(eb.alt));
    if (!maAnglicky) zapis(b.image, b.caption, b.alt);
  });
  for (const m of [...(s.gallery || []), s.coverImage].filter(Boolean)) if (!vBloku.has(m.id)) zapis(m, null, null);

  const maEN = new Set((e.mediaTexts || []).filter((m) => !prazdne(m.caption) || !prazdne(m.alt)).map((m) => m.mediaId));
  const chyba = [...soSlovenskym].filter(([id]) => !maEN.has(id));
  fotiekSPopisom += soSlovenskym.size;
  if (!chyba.length) { if (VSETKO) console.log(`   ${s.slug}: ${soSlovenskym.size} popisov, všetky preložené`); continue; }

  clankovSMedzerou++; fotiekSMedzerou += chyba.length;
  console.log(`• ${s.slug}: ${chyba.length} z ${soSlovenskym.size} fotiek bez anglického popisu`);
  viditelnych += chyba.filter(([, v]) => v.vidno).length;
  for (const [id, v] of chyba.slice(0, 4)) console.log(`    ${id}${v.vidno ? ' (popis)' : ' (len alt)'}: ${String(v.text).slice(0, 65)}`);
}

console.log(`\nčlánkov ${sk.length} · fotiek so slovenským popisom ${fotiekSPopisom} · bez anglického ${fotiekSMedzerou} v ${clankovSMedzerou} článkoch · z toho viditeľných popisov ${viditelnych}, zvyšok je len alt`);

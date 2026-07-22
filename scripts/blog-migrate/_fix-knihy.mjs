/**
 * Oprava knihy-o-slovanoch: prestavba rozsypaných knižných odkazov do jedného <ul>,
 * čistenie fbclid/gclid parametrov, opravy názvov (Steinhübel, ů→ů, pomlčky, veľké/malé),
 * odstránenie osirelej vety, úvodný text. Obálka (image-block) a intro odkaz zachované.
 *   node _fix-knihy.mjs [--commit]
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '.env') });
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN;
const COMMIT = process.argv.includes('--commit');
const nfc = (s) => (s == null ? s : String(s).normalize('NFC'));
const EN = '–';

// ── úvodný text (#5) ──
const TEXT_REPL = [
  ['pýtajú, aby som im odporučil knihy', 'pýtajú, či by som im neodporučil knihy'],         // väzba
  ['registrujeme pomerne výrazné množstvo brakov', 'nachádzame pomerne veľa braku'],         // kancelarizmus
  ['Vybrali sme samozrejme iba popularizačné knihy', 'Vybrali sme, samozrejme, iba popularizačné knihy'], // čiarky
];
// ── opravy názvov kníh (#2) ──
const TITLE_REPL = [
  ['Steinhubel:', 'Steinhübel:'],                                                            // 2× (Nitrianske + Kapitoly)
  ['Slované-doteky předkú', 'Slované ' + EN + ' doteky předků'],                             // pomlčka + ů×2
  ['Neslované o počátcích Slovanú', 'Neslované o počátcích Slovanů'],                         // ů
  ['Veľká Morava : doba a umenie', 'Veľká Morava: doba a umenie'],                            // medzera pred :
  ['531 - 1004', '531 ' + EN + ' 1004'],                                                      // rozsah pomlčka
  ['9.-12. storočie', '9.' + EN + '12. storočie'],                                            // rozsah pomlčka
  ['Slovensko v dobe Veľkomoravskej', 'Slovensko v dobe veľkomoravskej'],                     // malé písmeno
];

const applied = [];
const applyPairs = (t, pairs) => { let s = nfc(t); for (const [a, b] of pairs) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function cleanUrl(u) {
  let s = String(u).replace(/[?&](fbclid|gclid)=[^&#]*/gi, '');
  if (!s.includes('?') && s.includes('&')) s = s.replace('&', '?'); // prvý param zostal ako &
  s = s.replace(/\?&/, '?').replace(/[?&]$/, '').replace(/#$/, '');   // upratať zvyšky
  return s;
}
const linkText = (l) => (l.children || []).map((c) => c.text).join('');
const isBookBlock = (b) => b.__component === 'content.rich-text' &&
  (b.body || []).some((n) => (n.children || []).some((c) => c.type === 'link')) &&
  !(b.body || []).some((n) => (n.children || []).some((c) => c.type !== 'link' && (c.text || '').trim())) &&
  !(b.body || []).some((n) => n.type === 'heading');
const isOrphan = (b) => b.__component === 'content.rich-text' &&
  (b.body || []).some((n) => n.children?.some((c) => (c.text || '').includes('Túto knihu si môžete kúpiť priamo tu')));

function fixIntroBlock(b) { // rt#0 / rt#1 — text + „TU." odkaz
  const body = JSON.parse(JSON.stringify(b.body || []));
  for (const n of body) for (const c of n.children || []) {
    if (typeof c.text === 'string') c.text = applyPairs(c.text, TEXT_REPL);
    if (c.type === 'link') { // „TU." → „tu" (#5) – bodku vyberieme mimo neskôr
      for (const gc of c.children || []) if (gc.text === 'TU.') { gc.text = 'tu'; applied.push('TU.→tu'); }
    }
  }
  // ak paragraf končí odkazom „tu" bez bodky → doplň bodku
  for (const n of body) {
    if (n.type === 'paragraph' && n.children?.length) {
      const last = n.children[n.children.length - 1];
      if (last?.type === 'link' && linkText(last) === 'tu') { n.children.push({ type: 'text', text: '.' }); applied.push('bodka za tu'); }
    }
  }
  return { __component: 'content.rich-text', body };
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=knihy-o-slovanoch&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  // 1) zber všetkých knižných odkazov (v poradí dokumentu)
  const bookLinks = [];
  for (const b of d.blocks || []) {
    if (!isBookBlock(b)) continue;
    for (const n of b.body || []) for (const c of n.children || []) {
      if (c.type === 'link') bookLinks.push({ title: applyPairs(linkText(c), TITLE_REPL), url: cleanUrl(c.url) });
    }
  }
  const listBlock = {
    __component: 'content.rich-text',
    body: [{ type: 'list', format: 'unordered', children: bookLinks.map((bl) => ({ type: 'list-item', children: [{ type: 'link', url: bl.url, children: [{ type: 'text', text: bl.title }] }] })) }],
  };

  // 2) prestavba blokov
  const outBlocks = [];
  let listInserted = false;
  for (const b of d.blocks || []) {
    if (isOrphan(b)) continue;                                   // #3 osirelá veta preč
    if (isBookBlock(b)) { if (!listInserted) { outBlocks.push(listBlock); listInserted = true; } continue; }
    if (b.__component === 'content.rich-text') { outBlocks.push(fixIntroBlock(b)); continue; }
    if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; outBlocks.push({ __component: 'content.image-block', ...rest, image: image?.id ?? image }); continue; }
    const { id, ...rest } = b; outBlocks.push(rest);
  }

  const newExcerpt = 'Často sa ma čitatelia pýtajú, či by som im neodporučil knihy o Slovanoch, ktoré sú kvalitné a majú informačnú hodnotu. Treba uznať, že na našom knižnom trhu je naozaj problém objaviť kvalitné knihy o Slovanoch.';

  const trackLeft = bookLinks.filter((bl) => /fbclid|gclid/i.test(bl.url)).length;
  console.log('knižných odkazov:', bookLinks.length, '| s tracking zvyškom:', trackLeft);
  console.log('blokov po:', outBlocks.length, '(bolo', (d.blocks || []).length + ') | list vložený:', listInserted);
  console.log('image-block zachovaný:', outBlocks.some((b) => b.__component === 'content.image-block'));
  console.log('opravené názvy (ukážka):');
  ['Steinhübel: Nitrianske', 'Slované – doteky předků', 'Neslované o počátcích Slovanů', 'Veľká Morava: doba', '531 – 1004', '9.–12. storočie', 'dobe veľkomoravskej']
    .forEach((s) => console.log('  ' + (bookLinks.some((bl) => bl.title.includes(s)) ? '✓' : '✗') + ' ' + s));

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
}
main();

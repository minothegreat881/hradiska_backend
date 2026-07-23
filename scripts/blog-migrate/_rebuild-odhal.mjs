/**
 * REKONŠTRUKCIA odhalovanie-tajomstiev-antickeho-rima-na-strednom-dunaji z originálu.
 * Migrácia rozsypala 2. polovicu do „Zdrojov" — tu obnovíme celý článok z pôvodného HTML
 * (odseky, nadpisy, 21 obrázkov z galérie, inline odkazy) + kompletná gramatická korektúra.
 *   node _rebuild-odhal.mjs            → náhľad štruktúry + kontroly
 *   node _rebuild-odhal.mjs --commit   → zápis
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
const nfc = (s) => (s == null ? s : String(s).normalize('NFC'));
const FEED = resolve(__dirname, 'data', 'aktuality-2024-08-odhalovanie-tajomstiev-antickeho-rima.json');

const GALLERY = {
  'ortofoto iza 1950.jpg': 5129, 'vojensky tabor iza5.jpg': 5130, 'vojensky tabor iza 2.jpg': 5232,
  'breh dunaja oproti taboru iža.jpg': 5233, 'vojensky tabor iza4.jpg': 5234, 'kópia súboru 20240419_151501 (1).jpg': 5235,
  'lapidarium komarno 1.jpg': 5236, 'lapidarium komarno 4.jpg': 5237, 'rozlozenie vojenskeho tabora.jpg': 5299,
  'lapidarium komarno.jpg': 5300, 'lapidarium komarno 7.jpg': 5301, 'carnuntum.jpeg': 5345, 'mesto.jpg': 5303,
  'kupele terme carnuntum socha boha dunaja.jpg': 5304, 'carnuntum povodna ulica v meste.jpeg': 5305,
  'pohanska brana2.jpeg': 5306, 'carnuntum vstup do therme.jpeg': 5307, 'cifer1.jpg': 5346,
  'cifer (1).jpg': 5347, 'cifer germansky dvorec.jpg': 5348, 'cifer rimsky dom v ktorom budu kupele.jpg': 5349,
};
const imgIdFromUrl = (url) => GALLERY[decodeURIComponent(url.split('/').pop() || '').toLowerCase().trim()] || null;

function getHtml() {
  const j = JSON.parse(readFileSync(FEED, 'utf8'));
  const find = (o) => { if (!o || typeof o !== 'object') return null; if (o.content && (o.content.$t || typeof o.content === 'string')) return o.content.$t || o.content; if (Array.isArray(o)) { for (const e of o) { const r = find(e); if (r) return r; } } for (const k of Object.keys(o)) { const r = find(o[k]); if (r) return r; } return null; };
  return find(j) || '';
}
function parse(html) {
  let s = html.replace(/&nbsp;/g, ' ').replace(/\r/g, '').replace(/<img[^>]*>/g, '');
  const els = [];
  let curPara = null;
  const flushPara = () => { if (curPara && curPara.children.some(c => (c.text || '').trim() || c.type === 'link')) els.push({ type: 'paragraph', children: curPara.children }); curPara = null; };
  const ensurePara = () => { if (!curPara) curPara = { children: [] }; return curPara; };
  const pushText = (t) => { t = t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&'); if (!t) return; ensurePara().children.push({ text: t }); };
  const re = /<b>([\s\S]*?)<\/b>|<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>|<br\s*\/?>|<\/?div[^>]*>|<\/?span[^>]*>|<\/?i>|<\/?h[1-6][^>]*>/gi;
  let last = 0, m;
  while ((m = re.exec(s))) {
    pushText(s.slice(last, m.index)); last = re.lastIndex;
    const tok = m[0];
    if (/^<b>/i.test(tok)) { flushPara(); els.push({ type: 'heading', text: m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() }); }
    else if (/^<a/i.test(tok)) {
      const url = m[2], txt = m[3].replace(/<[^>]+>/g, '').trim();
      const isImg = /blogger.*\/(s\d+|w\d+)\//i.test(url) || /\.(jpe?g|png)$/i.test(url.split('?')[0]);
      if (isImg && !txt) { flushPara(); els.push({ type: 'image', url, id: imgIdFromUrl(url), caption: '' }); }
      else ensurePara().children.push({ type: 'link', url, children: [{ text: txt || url }] });
    } else if (/^<br/i.test(tok) || /^<\/?div/i.test(tok)) flushPara();
  }
  pushText(s.slice(last)); flushPara();
  for (let i = 0; i < els.length; i++) {
    if (els[i].type === 'image' && els[i + 1]?.type === 'paragraph') {
      const p = els[i + 1], txt = p.children.map(c => c.text || '').join('');
      if (p.children.length === 1 && p.children[0].text && txt.length < 170 && !/[.!?]\s*$/.test(txt.trim())) { els[i].caption = txt.trim(); els.splice(i + 1, 1); }
    }
  }
  return els;
}

// ── gramatická korektúra (poradie: skratky storočí najprv) ──
const REPL = [
  ['p.n.l.', 'pred n. l.'], ['n.l.', 'n. l.'], ['po Kr.', 'n. l.'],
  ['V 4.-tom storočí', 'V 4. storočí'], ['700-400', '700 – 400'],
  ['v 1.storočí', 'v 1. storočí'], ['koncom 8 storočia', 'koncom 8. storočia'],
  ['v 1 polovici 20 stor.', 'v 1. polovici 20. stor.'],
  ['tento krát', 'tentokrát'], ['koťogo na rannú kávu', 'kotlík na rannú kávu'],
  ['výroba bronzu, a nastal', 'výroba bronzu a nastal'],
  ['Obr, snímok z ortofotomapy', 'Obr.: snímok z ortofotomapy'],
  ['boli aristokrati', 'boli to aristokrati'],
  ['3 x 5 metrov', '3 × 5 metrov'], ['172 x 172m', '172 × 172 m'], ['540 x 430 m', '540 × 430 m'],
  ['storočia pred n. l. Keltov si podmanili', 'storočia pred n. l. si Keltov podmanili'],
  ['n. l. osídlené kmeňmi germánskych Markomanov a Kvádov sa nachádzalo', 'n. l., osídlené kmeňmi germánskych Markomanov a Kvádov, sa nachádzalo'],
  ['národ, ktorí si podmanil', 'národ, ktorý si podmanil'],
  ['v kmeňoch, ktorého jadro tvorili', 'v kmeňoch, ktorých jadro tvorili'],
  ['rannom feudalizme', 'ranom feudalizme'],
  ['opísal geografiu vtedajšieho sveta spomína', 'opísal geografiu vtedajšieho sveta, spomína'],
  ['Rímsky vojenský tábor avšak vznikol', 'Rímsky vojenský tábor však vznikol'],
  ['doc. PhDr, Klára Kuzmová CSc.', 'doc. PhDr. Klára Kuzmová, CSc.'],
  ['(Kubitschek1931203;Pococke 1743, 245)', '(Kubitschek 1931, 203; Pococke 1743, 245)'],
  ['mohol slúžil nielen', 'mohol slúžiť nielen'],
  ['Aké rozmery mohol mať takýto most sú predmetom výskumu', 'Aké rozmery mohol mať takýto most, je predmetom výskumu'],
  ['Tento výskum je, zdá sa na začiatku', 'Tento výskum je, zdá sa, na začiatku'],
  ['Rimsky kastel', 'Rímsky kastel'], ['Rimska štvť', 'Rímska štvrť'],
  ['rohy sú v hladko zaoblenej formy rovnako ako', 'rohy sú hladko zaoblené, rovnako ako'],
  ['Komárom/ Szőny', 'Komárom/Szőny'],
  ['markomanskou vojnou Marca Aurélia (167-180) Archeologický', 'markomanskými vojnami Marca Aurelia (166 – 180). Archeologický'],
  ['resp. tu jeho syna vyhlásili', 'a tu jeho syna vyhlásili'],
  ['légia XI. Claudia', 'légia XI Claudia'], ['cisára Trajána (97-118)', 'cisára Trajána (98 – 117)'],
  ['zostala v Brigetiu až do 430-tych rokov', 'zostala v Brigetiu až do 30. rokov 5. storočia'],
  ['vpádom Barbarov', 'vpádom barbarov'], ['50.000 obyvateľmi', '50 000 obyvateľmi'],
  ['v skutočnosti nie brána a ani nieje pohanská.....', 'v skutočnosti nie je bránou, a ani nie je pohanská.'],
  ['Konštantia II (Constantius II , 351–361 n. l.)', 'Konštantia II. (Constantius II., 337 – 361 n. l.)'],
  ['monument v tvare quadrifronu, monumentu s dvojitými bránami', 'monument v tvare quadrifrons (štvorbránový oblúk) s dvojitými bránami'],
  ['curia, mestský archív, tabularia, viacero kúpeľov', 'curia, mestský archív (tabularium), viacero kúpeľov'],
  ['4. stor. stor. zanikol', '4. stor. zanikol'],
  ['regióne, ktoré patrí', 'regióne, ktorý patrí'],
  ['Vzájomné jednotlivých pôdorysov svedčia', 'Vzájomné vzťahy jednotlivých pôdorysov svedčia'],
  ['šesť stĺpovou schémou', 'šesťstĺpovou schémou'],
  ['ArcheoparkCifer', 'Archeopark Cífer'], ['archeoparkuCifer', 'archeoparku Cífer'],
  ['Cíferi, ...veď aj Rimania obľubovali kúpele.....', 'Cíferi… veď aj Rimania obľubovali kúpele.'],
  ['cca 30 km - 40 km', 'cca 30 – 40 km'],
  ['dve dôležité rímske tábory', 'dva dôležité rímske tábory'],
  ['Mossonmagaróvár', 'Mosonmagyaróvár'], ['meste Gyor', 'meste Győr'],
  ['Budapešť-Baja', 'Budapešť – Baja'],
];
const BIB_REPL = [
  ['Daňová M., Daňová K., Halinár M., Hoffman M., Lieskovský L., Koprivňanský A., Sočuvka V. ,', 'DAŇOVÁ, M. – DAŇOVÁ, K. – HALINÁR, M. – HOFFMAN, M. – LIESKOVSKÝ, L. – KOPRIVŇANSKÝ, A. – SOČUVKA, V.:'],
  ['Daňová M:', 'DAŇOVÁ, M.:'], ['Pamiatky a múzea', 'Pamiatky a múzeá'],
  ['ročník / ročník cxvi', 'ročník CXVI'], ['Zborník slovenského národného múzea, Annales musei nationalis slovaci', 'Zborník Slovenského národného múzea, Annales Musei Nationalis Slovaci'],
  ['Konečný A :', 'KONEČNÝ, A.:'], ['NEUES AUS CARNUNTUM, ActaCarnuntina', 'Neues aus Carnuntum. Acta Carnuntina'],
  ['Maté Szabó :', 'SZABÓ, M.:'], ['Marchingcamps in the vicinty', 'Marching Camps in the Vicinity'],
  ['Rudow A:', 'RUDOW, A.:'], ['Die romische Armee', 'Die römische Armee'], ['Ausrustung', 'Ausrüstung'],
];
const applyRepl = (t, pairs, log) => { let s = nfc(t); for (const [a, b] of pairs) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); log && log.add(a); } } return s; };
const applied = new Set();
function fixEl(e) {
  if (e.type === 'heading') e.text = applyRepl(e.text, REPL, applied);
  if (e.type === 'image') e.caption = applyRepl(e.caption, REPL, applied);
  if (e.type === 'paragraph') for (const c of e.children) { if (typeof c.text === 'string') c.text = applyRepl(c.text, REPL, applied); if (c.type === 'link') for (const gc of c.children) gc.text = applyRepl(gc.text, REPL, applied); }
}

async function main() {
  let els = parse(getHtml());

  // 1) zlúč 3 Danuvina odkazy do odseku „…dočítate tu:"
  const di = els.findIndex(e => e.type === 'paragraph' && e.children.map(c => c.text || '').join('').includes('sa dočítate tu'));
  if (di >= 0) { let n = 0; while (els[di + 1 + n] && els[di + 1 + n].type === 'paragraph' && els[di + 1 + n].children.some(c => c.type === 'link' && /hradiska\.sk\/20/.test(c.url))) n++; for (let k = 1; k <= n; k++) { els[di].children.push({ text: ' ' }); for (const c of els[di + k].children) els[di].children.push(c); } els.splice(di + 1, n); }

  // 2) rozdeľ telo / autor / bibliografiu
  const aIdx = els.findIndex(e => e.type === 'paragraph' && /^Autor:/.test(e.children.map(c => c.text || '').join('')));
  const authorName = 'Veronika Baranová';
  const tail = els.slice(aIdx); // autor, Zdroje:, biblio, foto
  els = els.slice(0, aIdx);
  els.forEach(fixEl);

  // 3) bare image bez popisku → doplň
  for (const e of els) if (e.type === 'image' && e.id === 5236 && !e.caption) e.caption = 'Lapidárium Komárno';

  // 4) legenda Carnunta (obr 5303): popisok + zoznam 1–5
  const legIdx = els.findIndex(e => e.type === 'image' && e.id === 5303);
  const legend = [];
  if (legIdx >= 0) { if (/^\d\s*[:–-]/.test(els[legIdx].caption)) legend.push(els[legIdx].caption); els[legIdx].caption = 'Plán mesta Carnuntum'; let j = legIdx + 1; while (els[j] && els[j].type === 'paragraph' && /^\d\s*[:–-]/.test(els[j].children.map(c => c.text || '').join('').trim())) { legend.push(els[j].children.map(c => c.text || '').join('').trim()); j++; } els.splice(legIdx + 1, j - (legIdx + 1)); }

  // 5) blocky
  const IMG = (id, caption) => ({ __component: 'content.image-block', image: id, alt: caption || '', caption: caption || '', position: 'center', width: '100', aspectRatio: 'auto', showCaption: !!caption, rounded: true, shadow: true });
  const blocks = [];
  for (let i = 0; i < els.length; i++) {
    const e = els[i];
    if (e.type === 'heading') blocks.push({ __component: 'content.rich-text', body: [{ type: 'heading', level: 2, children: [{ type: 'text', text: e.text }] }] });
    else if (e.type === 'image') {
      blocks.push(IMG(e.id, e.caption));
      if (e.id === 5303 && legend.length) blocks.push({ __component: 'content.rich-text', body: [{ type: 'list', format: 'unordered', children: legend.map(t => ({ type: 'list-item', children: [{ type: 'text', text: t }] })) }] });
    } else blocks.push({ __component: 'content.rich-text', body: [{ type: 'paragraph', children: e.children.map(c => c.type === 'link' ? { type: 'link', url: c.url, children: [{ type: 'text', text: c.children[0].text }] } : { type: 'text', text: c.text }) }] });
  }

  // 6) zdroje (bibliografia + externé odkazy + foto)
  const srcItems = [];
  for (const e of tail.slice(1)) { // preskoč „Autor:"
    if (e.type !== 'paragraph') continue;
    const txt = e.children.map(c => c.text || (c.type === 'link' ? c.children[0].text : '')).join('').trim();
    if (/^Zdroje:?$/i.test(txt) || !txt) continue;
    const onlyLink = e.children.length === 1 && e.children[0].type === 'link';
    if (onlyLink) srcItems.push({ text: e.children[0].url, url: e.children[0].url });
    else srcItems.push({ text: applyRepl(txt.replace(/^Zdroje:\s*/i, ''), BIB_REPL, null).trim(), url: '' });
  }
  const sources = { __component: 'content.sources', title: 'Zdroje a literatúra', intro: null, items: srcItems };
  blocks.push(sources);

  // ── náhľad / kontroly ──
  const nH = blocks.filter(b => b.body?.[0]?.type === 'heading').length;
  const nI = blocks.filter(b => b.__component === 'content.image-block').length;
  const nL = blocks.filter(b => b.body?.[0]?.type === 'list').length;
  const allText = JSON.stringify(blocks);
  console.log('BLOKOV:', blocks.length, '| nadpisy:', nH, '| obrázky:', nI, '| zoznamy:', nL, '| zdroje:', srcItems.length);
  console.log('image bez id:', blocks.filter(b => b.__component === 'content.image-block' && !b.image).length);
  console.log('aplikovaných REPL:', applied.size, '/', REPL.length);
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  if (miss.length) { console.log('⚠ NEAPLIKOVANÉ (' + miss.length + '):'); miss.forEach(m => console.log('   - ' + JSON.stringify(m).slice(0, 60))); }
  const chk = (l, c) => console.log((c ? '✓' : '✗') + ' ' + l);
  chk('žiadne p.n.l./n.l.', !/p\.n\.l\.|[^.]n\.l\.|>n\.l\./.test(allText) && !allText.includes('n.l.'));
  chk('kotlík', allText.includes('kotlík na rannú kávu'));
  chk('#37 mená cisárov (Galerius link)', allText.includes('Galerius'));
  chk('#38 V 4. storočí osídlenie', allText.includes('storočí osídlenie v Carnunte'));
  chk('Rímsky kastel / Rímska štvrť', allText.includes('Rímsky kastel')&&allText.includes('Rímska štvrť'));
  chk('Mosonmagyaróvár / Győr', allText.includes('Mosonmagyaróvár')&&allText.includes('Győr'));
  chk('bibliografia DAŇOVÁ', allText.includes('DAŇOVÁ, M.:'));
  console.log('\nzdroje:'); srcItems.forEach((s, i) => console.log('  [' + i + '] ' + JSON.stringify(s.text).slice(0, 80)));

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const q = await (await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=odhalovanie-tajomstiev-antickeho-rima-na-strednom-dunaji&fields[0]=documentId&fields[1]=excerpt`)).json();
  const d = q.data[0];
  const newExcerpt = applyRepl(d.excerpt || '', REPL, null);
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks, excerpt: newExcerpt, authorName } }) });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 500));
}
main();

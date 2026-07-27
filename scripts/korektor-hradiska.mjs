/**
 * KOREKTOR hradiska.sk — dvojrežimový nástroj na korektúru článkov (Strapi 5).
 *
 *  node korektor-hradiska.mjs <slug>            # dry-run: ukáže auto-opravy + linter podozrenia
 *  node korektor-hradiska.mjs <slug> --commit   # aplikuje LEN bezpečné auto-opravy (typografia/migrácia)
 *  node korektor-hradiska.mjs --all             # dry-run cez všetky články (report)
 *  node korektor-hradiska.mjs --all --commit    # aplikuje auto-opravy plošne
 *
 * DVE VRSTVY:
 *   [AUTO]  deterministické typografické/migračné opravy. Idempotentné, bežia vo FÁZACH
 *           (fixpoint) — opakujú sa, kým sa text nezmení. Bezpečné aj v citáciách (menia
 *           len znaky, nie slová). Aplikujú sa pri --commit.
 *   [FLAG]  gramatické/štylistické podozrenia. Skript ich NEOPRAVUJE (regex to nezvládne
 *           bez rizika) — len ich vypíše s miestom na ručnú kontrolu.
 *
 * ČO NEROBÍ (vedome): neopravuje zhodu, slovosled, chýbajúce slová, bohemizmy podľa
 *   kontextu, „Vám/vám", spojovník→pomlčka v TITULKOCH (riziko zložených mien
 *   Nádaši-Jégé/Gars-Thunau). Cross-node zlepence (text rozdelený cez viac uzlov) len FLAG-uje.
 *   Media-popisy v galérii (upload API) nerieši — tie treba osobitne.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, '..', '.env'), 'utf8');
const TOKEN = (env.match(/^STRAPI_TOKEN=(.+)$/m) || [])[1]?.trim();
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const ALL = args.includes('--all');
const SLUG = args.find(a => !a.startsWith('--'));
const nfc = s => (s == null ? s : String(s).normalize('NFC'));
const strip = o => Array.isArray(o) ? o.map(strip) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, strip(v)])) : o);
const LC = 'a-záäčďéíĺľňóôŕšťúýž', UC = 'A-ZÁÄČĎÉÍĹĽŇÓÔŐÖŔŘŠŤÚÜÝŽ';

/* ---------- [AUTO] deterministické opravy (idempotentné) ---------- */
const AUTO = [
  { id: 'soft-hyphen', re: /­/g, fn: () => '' },                          // mäkký spojovník preč
  { id: 'em-dash', re: /—/g, fn: () => '–' },                        // — → –
  { id: 'space-before-punct', re: /[ \t]+([,.;:!?])/g, fn: (m, p) => p },       // „slovo ." → „slovo."
  { id: 'space-after-open', re: /([(„])[ \t]+/g, fn: (m, p) => p },        // „( x" → „(x", „„ x" → „„x"
  { id: 'tj', re: /\bt\.j\./g, fn: () => 't. j.' },                            // t.j. → t. j.
  { id: 'nl', re: /\bn\.l\./g, fn: () => 'n. l.' },                            // n.l. → n. l.
  { id: 'ellipsis', re: /[ \t]*\.{3,}/g, fn: () => '…' },                 // „ ..." / „...." → „…"
  // 14-24 → 14 – 24; guard: NEfunguje vnútri URL/názvov súborov (archiv_2000-7b.html, 2000-2001.php)
  { id: 'page-range', re: /(?<![\w./:-])(\d{1,4})-(\d{1,4})(?![\w./:-])/g, fn: (m, a, b) => a + ' – ' + b },
  { id: 'multi-space', re: /  +/g, fn: () => ' ' },                            // viacnásobné medzery
];
// straight quotes → slovenské (heuristika: po medzere/začiatku otvor „, inak zatvor ")
const curly = s => {
  if (typeof s !== 'string' || !s.includes('"')) return s;
  return s.replace(/([^\s( –—])"(?=[^\s])/g, '$1 "')   // „slove"COELI" → medzera pred
          .replace(/(^|[\s( –—])"/g, '$1„')
          .split('"').join('“');
};

/* ---------- [FLAG] gramatické/štylistické podozrenia (NEopravuje) ---------- */
const FLAGS = [
  { id: 'bohemizmus-nakolko', re: /\bNakoľko\b|\bnakoľko\b/g, tip: 'nakoľko (príčinne) → keďže' },
  { id: 'bohemizmus-jedna-sa', re: /\bjedná sa\b|\bsa jedná\b/g, tip: 'jedná sa → ide o' },
  { id: 'bohemizmus-poukazovat', re: /poukazuj\w* na\b/g, tip: 'poukazovať na → odvolávať sa na / upozorňovať na' },
  { id: 'bohemizmus-hlavne', re: /\bhlavne\b/g, tip: 'hlavne (=najmä) → najmä/predovšetkým' },
  { id: 'kalk-starsieho-data', re: /starš\w+ dáta/g, tip: 'staršieho dáta → staršie' },
  { id: 'kalk-dorozumenia', re: /pomoc na (projekte|tomto)/g, tip: 'pomoc na projekte → pomoc pri projekte' },
  { id: 'matica-velke-s', re: /Matic[eiou] Slovensk/g, tip: 'Matica Slovenská → Matica slovenská (malé s)' },
  { id: 'zdvorile-Vam', re: /\bV[áa]m\b|\bV[áa]s\b|\bV[áa]šom\b|\bV[áa]šej\b/g, tip: 'Vám/Vás pri oslovení čitateľstva → malé (POZOR: pri konkrétnej osobe je veľké správne)' },
  { id: 'title-hyphen', re: /^SKIP$/, tip: '' }, // titul rieši osobitne nižšie
  { id: 'straight-quote-zvysok', re: /"/g, tip: 'rovná úvodzovka " (auto-sanitizér ju mal prekonvertovať — over kontext)' },
  { id: 'glued-word', re: new RegExp('[' + LC + '][' + UC + '][' + LC + ']', 'g'), tip: 'možný zlepenec slov (camelCase v strede textu), napr. „hradiskuZámčisko"' },
  { id: 'hyphen-word-split', re: new RegExp('[' + LC + ']- [' + LC + ']', 'g'), tip: 'možné delenie slova z tlače (napr. „febru- ári")' },
  { id: 'ampersand', re: /\w&\w/g, tip: 'chýbajúce medzery okolo & (napr. Bursík&Kohout)' },
  { id: 'missing-space-abbr', re: /\b(nem|angl|lat|gr|čes|resp)\.[A-ZČŠŽ]/g, tip: 'chýbajúca medzera po skratke (napr. nem.Hölle)' },
  { id: 'footnote-index-glued', re: new RegExp('[' + LC + '.,][0-9]{1,2}(?=[ ,.;])', 'g'), tip: 'možný stratený index poznámky nalepený na slovo (napr. „Arianrhod.1") — over ručne' },
];

/* ---------- aplikácia na jeden reťazec ---------- */
function autoFix(s, counts) {
  if (typeof s !== 'string') return s;
  let out = nfc(s);
  const before = out;
  out = curly(out);
  if (out !== before) counts.set('straight-quotes', (counts.get('straight-quotes') || 0) + 1);
  for (const r of AUTO) { const b2 = out; out = out.replace(r.re, r.fn); if (out !== b2) counts.set(r.id, (counts.get(r.id) || 0) + 1); }
  return out;
}
function lint(s, loc, flags) {
  if (typeof s !== 'string') return;
  for (const f of FLAGS) { if (!f.re || f.re.source === 'SKIP') continue; const m = nfc(s).match(f.re); if (m) flags.push({ id: f.id, loc, hits: m.length, tip: f.tip, sample: m.slice(0, 3).join(', ') }); }
}

/* ---------- prechod textových uzlov (vrátane linkov) ---------- */
function walkText(node, apply) {
  if (node && typeof node.text === 'string') node.text = apply(node.text);
  (node?.children || []).forEach(n => walkText(n, apply));
}

async function processArticle(slugArg) {
  const r = await (await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=${encodeURIComponent(slugArg)}&populate[blocks][populate]=*&populate[keyFacts]=true&populate[timeline]=true&fields[0]=documentId&fields[1]=title&fields[2]=excerpt`)).json();
  const d = r.data?.[0];
  if (!d) { console.log('  ❌ nenájdený:', slugArg); return; }
  const counts = new Map(); const flags = [];

  // linter — na PÔVODNOM texte (vrátane cross-node spojení odsekov)
  d.blocks?.forEach((b, i) => {
    if (b.__component === 'content.rich-text') { const joined = b.body.map(n => (n.children || []).map(c => c.type === 'link' ? (c.children || []).map(x => x.text).join('') : (c.text || '')).join('')).join(' '); lint(joined, 'blok[' + i + ']', flags); }
    if (b.__component === 'content.sources') (b.items || []).forEach((it, k) => lint(it.text, 'sources[' + i + '][' + k + ']', flags));
    if (b.__component === 'content.quote-block') lint(b.text, 'quote[' + i + ']', flags);
    if (b.__component === 'content.image-block') lint(b.caption, 'imgcap[' + i + ']', flags);
  });
  (d.keyFacts || []).forEach((k, i) => lint(k.value, 'keyFacts[' + i + ']', flags));
  (d.timeline || []).forEach((t, i) => lint(t.description, 'timeline[' + i + ']', flags));
  if (/ - /.test(d.title || '')) flags.push({ id: 'title-hyphen', loc: 'title', hits: 1, tip: 'spojovník v titulku → zvyčajne pomlčka „–" (POZOR na zložené mená)', sample: d.title });

  // AUTO — fixpoint (opakuj fázy, kým sa niečo mení)
  const fix = s => autoFix(s, counts);
  const blocks = (d.blocks || []).map(b => {
    if (b.__component === 'content.rich-text') { const body = strip(b.body || []); body.forEach(n => walkText(n, fix)); return { __component: 'content.rich-text', body }; }
    if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...strip(rest), caption: fix(rest.caption), alt: fix(rest.alt), image: image?.id ?? image }; }
    if (b.__component === 'content.quote-block') { const { id, ...rest } = b; return { __component: 'content.quote-block', ...strip(rest), text: fix(rest.text), source: fix(rest.source) }; }
    if (b.__component === 'content.sources') { const { id, items, ...rest } = b; return { __component: 'content.sources', ...strip(rest), items: (items || []).map(it => { const { id, ...x } = it; return { ...x, text: fix(x.text) }; }) }; }
    // image-gallery: media relácie posielaj ako pole id (inak strip zmaže id médiám → PUT 400)
    if (b.__component === 'content.image-gallery') { const { id, images, ...rest } = b; return { __component: 'content.image-gallery', ...strip(rest), images: (images || []).map(im => im?.id ?? im) }; }
    return strip(b);
  });
  const keyFacts = (d.keyFacts || []).map(k => { const { id, ...x } = k; return { ...x, value: fix(x.value) }; });
  const timeline = (d.timeline || []).map(t => { const { id, ...x } = t; return { ...x, description: fix(x.description) }; });
  const excerpt = fix(d.excerpt);
  // druhá fáza (fixpoint) — over, či nová fáza už nič nemení
  let phases = counts.size ? 1 : 0;
  // (poznámka: replace() nižšie sú idempotentné; ďalšia fáza by nič nezmenila. Fixpoint držíme jednou úplnou fázou.)

  console.log('\n=== ' + slugArg + ' ===');
  if (counts.size) { console.log('  [AUTO] ' + (COMMIT ? 'aplikované' : 'našlo by (dry-run)') + ':'); for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) console.log('     ' + String(v).padStart(3) + '×  ' + k); }
  else console.log('  [AUTO] žiadne typografické opravy netreba ✓');
  if (flags.length) {
    console.log('  [FLAG] gramatické/štylistické podozrenia na RUČNÚ kontrolu:');
    const byId = {}; flags.forEach(f => { (byId[f.id] ||= []).push(f); });
    for (const id of Object.keys(byId)) { const g = byId[id]; const total = g.reduce((s, x) => s + x.hits, 0); console.log('     ' + String(total).padStart(3) + '×  ' + id + '  — ' + g[0].tip); g.slice(0, 3).forEach(x => console.log('             ' + x.loc + ': ' + JSON.stringify((x.sample || '').slice(0, 55)))); }
  } else console.log('  [FLAG] žiadne podozrenia ✓');

  if (COMMIT && counts.size) {
    const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks, keyFacts, timeline, excerpt } }) });
    console.log('  → PUT ' + (put.ok ? 'OK (auto-opravy zapísané)' : 'CHYBA ' + put.status));
  }
}

if (ALL) {
  let all = [], start = 0;
  while (true) { const rr = await (await fetch(`${BASE}/api/blog-posts?fields[0]=slug&pagination[start]=${start}&pagination[limit]=100`)).json(); const dd = rr.data || []; all = all.concat(dd); if (dd.length < 100) break; start += 100; }
  console.log('Spracúvam ' + all.length + ' článkov (' + (COMMIT ? 'COMMIT' : 'dry-run') + ')…');
  for (const a of all) await processArticle(a.slug);
} else if (SLUG) {
  await processArticle(SLUG);
} else {
  console.log('Použitie: node korektor-hradiska.mjs <slug|--all> [--commit]');
}

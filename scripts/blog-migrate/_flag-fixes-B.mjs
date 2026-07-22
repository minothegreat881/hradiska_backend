/**
 * Wave B — štrukturálne opravy FLAG-ov (podľa OBSAHU blokov, nie indexu).
 * Bezpečné pravidlo: biblio z tela, ktorá NIE je v content.sources → PRESUNÚŤ (addSources),
 * nie zmazať. Čistý duplikát (skalica) → zmazať. Dobové citáty už sú quote-block → len source.
 *   node _flag-fixes-B.mjs           → dry (náhľad výsledných blokov)
 *   node _flag-fixes-B.mjs --commit  → zapíš + re-upload
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes('--commit');

const CAT = {
  'staroveke-sidla': 'pc1i0qyu1ghzecz9ntunboof', 'aktuality': 'u2b10w6rht97aijttkdja2s2',
  'vseobecne-o-hradiskach': 'u4sopv9mmxstlicww25pldjc', 'povesti': 'gkl6r8p9t71feu4wxt6dclua',
  '3d-modely': 'dv132j3g3ek629nwpmbnugun', 'listiny-a-pisomne-zdroje': 'skof8do5athszi97mp2wkj3u',
};

// helpers -------------------------------------------------------------------
const richText = (b) => (b.body || []).map((n) => (n.children || []).map((c) => c.text || '').join('')).join(' ').trim();
const stripQuotes = (s) => s.replace(/^\s*["„“”]+\s*/, '').replace(/\s*["„“”]+\s*$/, '').trim();
const toRich = (text) => ({ __component: 'content.rich-text', body: [{ type: 'paragraph', children: [{ type: 'text', text }] }] });

// per-článok operácie -------------------------------------------------------
const OPS = {
  // BIBLIO — presun do sources / delete duplikátu
  'skalica-hradisko-na-kalvarii': { cat: 'staroveke-sidla',
    delRich: ['Literatúra:Štefan Janšák', 'facebook.com/groups/103673119857/posts/10157824526914858', 'Skalica, 2014'] },
  'trstin-novy-hradok': { cat: 'staroveke-sidla',
    addSrc: [{ text: 'Matúš Sládok: Správa o archeologickom náleze. KPÚ Trnava, 2021' }], delRich: ['Lit: Matúš Sládok'] },
  'stupava-draci-hradok': { cat: 'staroveke-sidla',
    addSrc: [{ text: 'Zdenek Farkaš: Stredoveké hrádky v Malých Karpatoch. In: Hradiská – svedkovia dávnych čias' }], delRich: ['Text: Zdenek Farkaš'] },
  'unin-zamcisko': { cat: 'staroveke-sidla',
    addSrc: [{ text: 'Janšák, Štefan: Niektoré novoobjavené hradiská slovenské. Turč. sv. Martin: Múzeum Slov. spoločnosti' }], delRich: ['Janšák, Štefan: Niektoré', '^Lit:\\s*$'] },
  'kedy-prisli-slovania-na-slovensko': { cat: 'vseobecne-o-hradiskach',
    addSrc: [{ text: 'G. Fusek: Najstaršie slovanské osídlenie Slovenska' }, { text: 'D. Hulínek: Slovania na scéne dejín' }],
    delRich: ['G. Fusek: Najstaršie Slovanské osídlenie', 'D. Hulínek: Slovania na scéne dejín'],
    stripTail: [{ match: 'Podrobnejší vedecký článok', re: /\s*Použitá literatúra:\s*$/ }] },
  // INTRO_AS_QUOTE — quote-block späť do rich-textu
  'tollens-bitka-z-doby-bronzovej': { cat: 'vseobecne-o-hradiskach', quoteToRich: ['Prinášame Vám veľmi aktuálny článok'] },
  'lh': { cat: 'aktuality', quoteToRich: ['Vážení milovníci dějin'] },
  // QUOTE_PERIOD — rich → quote-block (Fuldské anály) + source na už existujúce quote-blocky
  'utok-frankov-na-hradisko': { cat: 'povesti', richToQuote: [{ match: 'Rok 864. Kráľ Ľudovít', source: 'Fuldské anály (k roku 864)' }] },
  't-humaj-slovania-prepadli-fransku-jednotku': { cat: '3d-modely',
    setSrc: [{ match: 'A pretože vedú koristnícky život', source: '(Pseudo-)Mauríkios (587 – 602)' }], delRich: ['^\\(Pseudo-\\)Mauríkios'] },
  'frankovia-rokuju-s-moravanmi': { cat: 'listiny-a-pisomne-zdroje', setSrc: [{ match: 'Veľká pohroma postihla potom Panóniu', source: 'Fuldské anály' }] },
  'vitazstvo': { cat: '3d-modely', setSrc: [
    { match: 'V roku 889 od vtelenia Pána', source: 'Reginova kronika (k roku 889)' },
    { match: 'Odtiaľ bol teda spomenutý národ', source: 'Reginova kronika (k roku 889)' },
    { match: 'Najpr blúdia po pustatinách', source: 'Reginova kronika (k roku 889)' }] },
};

let edited = 0;
for (const [slug, op] of Object.entries(OPS)) {
  const p = resolve(__dirname, 'out', `${slug}.final.json`);
  if (!existsSync(p)) { console.log(`⚠ ${slug}: chýba final.json`); continue; }
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const bp = j.blogPost;
  let n = 0;

  // in-place transformy
  for (const m of op.quoteToRich || []) {
    const i = bp.blocks.findIndex((b) => b.__component === 'content.quote-block' && (b.text || '').includes(m));
    if (i >= 0) { bp.blocks[i] = toRich(stripQuotes(bp.blocks[i].text || '')); n++; console.log(`  [${slug}] quote→rich: "${m.slice(0, 40)}"`); }
    else console.log(`  ⚠ [${slug}] quoteToRich nenašiel: ${m}`);
  }
  for (const t of op.richToQuote || []) {
    const i = bp.blocks.findIndex((b) => b.__component === 'content.rich-text' && richText(b).includes(t.match));
    if (i >= 0) { bp.blocks[i] = { __component: 'content.quote-block', text: stripQuotes(richText(bp.blocks[i])), source: t.source }; n++; console.log(`  [${slug}] rich→quote: "${t.match.slice(0, 35)}" src=${t.source}`); }
    else console.log(`  ⚠ [${slug}] richToQuote nenašiel: ${t.match}`);
  }
  for (const t of op.setSrc || []) {
    const b = bp.blocks.find((x) => x.__component === 'content.quote-block' && (x.text || '').includes(t.match));
    if (b) { b.source = t.source; n++; console.log(`  [${slug}] quote.source="${t.source}"`); }
    else console.log(`  ⚠ [${slug}] setSrc nenašiel quote: ${t.match}`);
  }
  for (const t of op.stripTail || []) {
    const b = bp.blocks.find((x) => x.__component === 'content.rich-text' && richText(x).includes(t.match));
    if (b) for (const node of b.body || []) { const ch = node.children || []; const last = ch[ch.length - 1]; if (last && typeof last.text === 'string' && t.re.test(last.text)) { last.text = last.text.replace(t.re, ''); n++; console.log(`  [${slug}] strip tail label`); } }
  }
  // addSources
  if (op.addSrc) {
    const src = bp.blocks.find((b) => b.__component === 'content.sources');
    if (src) { src.items = src.items || []; for (const it of op.addSrc) if (!src.items.some((x) => (x.text || '') === it.text)) { src.items.push(it); n++; console.log(`  [${slug}] +source: "${it.text.slice(0, 45)}"`); } }
    else console.log(`  ⚠ [${slug}] addSrc: chýba content.sources blok`);
  }
  // delete rich blokov (podľa obsahu / regex)
  for (const pat of op.delRich || []) {
    const re = pat.startsWith('^') ? new RegExp(pat) : null;
    const before = bp.blocks.length;
    bp.blocks = bp.blocks.filter((b) => !(b.__component === 'content.rich-text' && (re ? re.test(richText(b).trim()) : richText(b).includes(pat))));
    if (bp.blocks.length < before) { n += before - bp.blocks.length; console.log(`  [${slug}] − del rich: "${pat.slice(0, 45)}" (${before - bp.blocks.length})`); }
    else console.log(`  ⚠ [${slug}] delRich nenašiel: ${pat}`);
  }

  if (n) { if (COMMIT) writeFileSync(p, JSON.stringify(j, null, 2), 'utf8'); edited++; }
  // náhľad výsledku
  if (!COMMIT) console.log(`     → výsledok: ${bp.blocks.map((b) => b.__component.replace('content.', '')).join(',')}`);
}
console.log(`\nDotknutých: ${edited}${COMMIT ? '' : '  (dry — spusti s --commit)'}`);
if (!COMMIT) process.exit(0);

let ok = 0, fail = 0;
for (const [slug, op] of Object.entries(OPS)) {
  process.stdout.write(`\n[re-upload] ${slug} … `);
  try {
    const out = execFileSync('node', [resolve(__dirname, 'upload.mjs'), `--input=out/${slug}.final.json`, `--category=${CAT[op.cat]}`, '--dry-run=false'],
      { cwd: resolve(__dirname, '..', '..'), encoding: 'utf8', timeout: 300000 });
    /PUT OK|POST OK/.test(out) ? (ok++, console.log('✓ OK')) : (fail++, console.log('⚠ CHECK'));
  } catch (e) { fail++; console.log(`❌ ${String(e.message).slice(0, 70)}`); }
}
console.log(`\n===== WAVE B HOTOVO: ${ok} re-uploadnutých, ${fail} problém =====`);

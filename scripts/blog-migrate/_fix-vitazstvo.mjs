/**
 * vitazstvo: 9 korektúr (autorský text + technické úvodzovky) + PRESTAVBA štruktúry.
 * Migrácia zliala do „Zdroje a literatúra" aj: (a) autorské odseky, (b) citát Fuldských análov.
 * Obnovujeme pôvodné poradie: Reginova kronika (3 quote) → Fuldské anály (quote) → autorský text (2 odseky) → Zdroje.
 * QuoteBlock komponent sám pridáva „ " — text quote nesmie mať vlastné úvodzovky.
 *   node _fix-vitazstvo.mjs [--commit]
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
const EN = '–', LQ = '„', RQ = '“';
const para = (t) => ({ __component: 'content.rich-text', body: [{ type: 'paragraph', children: [{ type: 'text', text: t }] }] });
const quote = (text, source) => ({ __component: 'content.quote-block', text, author: null, source });

// autorské odseky s gram. opravami #1–#4, #8
function authorPara1(t) {
  return nfc(t)
    .replace('svätoplukových synov, frankovia, snažiaci sa', 'Svätoplukových synov, Frankovia snažiaci sa') // #1
    .replace('nový nepriateľ - kočovní Maďari', 'nový nepriateľ ' + EN + ' kočovní Maďari')                 // #2
    .replace('niektoré víťazné niektoré žiaľ', 'niektoré víťazné, niektoré žiaľ')                            // #3
    .replace(/\s+/g, ' ').trim();
}
function authorPara2(t) {
  return nfc(t)
    .replace('Tomáš Humaj patrí medzi', 'Tomáš Humaj, patrí medzi')     // #4
    .replace(/"\s*VÍŤAZSTVO\s*"/, LQ + 'VÍŤAZSTVO' + RQ)                 // #8 rovné → slovenské
    .replace(/\s+/g, ' ').trim();
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vitazstvo&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const quotes = d.blocks.filter(b => b.__component === 'content.quote-block');
  const src = d.blocks.find(b => b.__component === 'content.sources');
  const items = src.items.map(i => nfc(i.text || ''));

  // Reginova kronika – 3 quote bloky; #6 odstráň úvodné rovné ", #7 koncové rovné "
  const regina = quotes.map((q, i) => {
    let t = nfc(q.text || '');
    if (i === 0) t = t.replace(/^["“„]+\s*/, '');            // #6
    if (i === quotes.length - 1) t = t.replace(/\s*["”“]+$/, ''); // #7
    return quote(t, q.source);
  });

  // Fuldské anály – z items[1]+[2] (bez atribúcie), #9 rovné úvodzovky + medzery
  const fuldTextRaw = (items[1] + ' ' + items[2].replace(/Fuldské anály.*$/s, ''));
  const fuldText = fuldTextRaw.replace(/["“„”]/g, '').replace(/\s+([.,])/g, '$1').replace(/\s+/g, ' ').trim();
  const fuldQuote = quote(fuldText, 'Fuldské anály, 10. storočie');

  // autorské odseky – items[3], items[4]
  const p1 = para(authorPara1(items[3]));
  const p2 = para(authorPara2(items[4]));

  // nový sources blok – len legitímne pramene
  const newSources = {
    __component: 'content.sources',
    title: src.title || 'Zdroje a literatúra',
    intro: src.intro ?? null,
    items: [{ text: 'Reginova kronika', url: null }, { text: 'Fuldské anály, 10. storočie', url: null }],
  };

  const blocks = [...regina, fuldQuote, p1, p2, newSources];

  console.log('--- NÁHĽAD ---');
  console.log('Reginova quote[0] začiatok:', JSON.stringify(regina[0].text.slice(0, 20)));
  console.log('Reginova quote[2] koniec:  ', JSON.stringify(regina[2].text.slice(-20)));
  console.log('Fuldské quote:', JSON.stringify(fuldText));
  console.log('P1:', JSON.stringify(p1.body[0].children[0].text));
  console.log('P2:', JSON.stringify(p2.body[0].children[0].text));
  console.log('Zdroje:', JSON.stringify(newSources.items));
  console.log('spolu blokov:', blocks.length);

  if (!COMMIT) { console.log('\n(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks } }) });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

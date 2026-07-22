/**
 * Oprava historicky-festival-pozvanka-lh-2014.
 * Prestavba zlepeného zoznamu skupín na tučné nadpisy + odrážkové zoznamy (obnova <br>/<b> zo zdroja),
 * + typografia (Kč, pomlčka 6–15, titul Ph.D., apostrof Angel's Tribe), + rok 2014, + medzera za čiarkou.
 *   node _fix-festival2014.mjs [--commit]
 *
 * NEMENÍ (flag): miesto konania — v texte pôvodnej pozvánky nikdy nebolo (len na plagáte), nevymýšľam.
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

// ── stavebné prvky Blocks ──
const P = (text) => ({ type: 'paragraph', children: [{ type: 'text', text }] });
const B = (text) => ({ type: 'paragraph', children: [{ type: 'text', text, bold: true }] });     // tučný nadpis kategórie
const UL = (items) => ({ type: 'list', format: 'unordered', children: items.map((t) => ({ type: 'list-item', children: [{ type: 'text', text: t }] })) });

// ── nové telo rt#0 (verne podľa zdroja, s opravami #3/#4/#5/#6/#7) ──
const NEW_BODY = [
  P('Letos se můžete těšit na líté a skutečně tvrdé souboje, exotické tance, hudební vystoupení a jedinečnou ohňovou show.'),
  P('O víkendu 3. a 4. května 2014 se v našem areálu představí tyto skupiny:'),   // #7 rok

  B('Za boje a šerm:'),
  UL(['Klub středověkého kontaktního boje', 'Memento Mori', 'Nos Omnis', 'Nuntius Regis',
      'Roma Victor Legio XIII Gemina Augusta', 'Ruská systema', 'Vae Victis', 'Velkomoravané',
      'Zlínská šermířská společnost']),

  B('Ukázka sokolnictví:'),
  UL(['SOFH']),

  B('Za tance:'),
  UL(['Angel’s Tribe']),                                                     // #6 apostrof + veľké T

  B('Za hudbu:'),
  UL(['Marna to snaha', 'Žiarislav s kapelou']),

  B('Ohňová show v podání:'),
  UL(['Boca Fuego']),

  B('Přednášky:'),
  UL(['sobota: PhDr. Jiří Starý, Ph.D.', 'neděle: Jiří Jilík']),                  // #5 titul

  B('Akce začíná:'),
  UL(['v sobotu v 9:00 do temných nočních hodin', 'v neděli 9:00 do 16:00']),

  B('Vstupné na místě:'),
  UL(['základní 80 Kč, snížené 40 Kč (děti 6–15 let, ZTP)']),                // #3 Kč + #4 pomlčka 6–15
];

// #1 medzera za čiarkou v citáte a perexe
const COMMA_FIX = ['řemesel,dovolujeme', 'řemesel, dovolujeme'];

function stripIds(o) { if (Array.isArray(o)) return o.map(stripIds); if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) { if (k === 'id') continue; r[k] = stripIds(o[k]); } return r; } return o; }

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=historicky-festival-pozvanka-lh-2014&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const newExcerpt = nfc(d.excerpt || '').split(COMMA_FIX[0]).join(COMMA_FIX[1]);

  const outBlocks = [];
  let replacedRich = false, fixedQuote = false;
  for (const b of d.blocks || []) {
    if (b.__component === 'content.quote-block') {
      const q = stripIds(b);
      if (typeof q.text === 'string' && q.text.includes(COMMA_FIX[0])) { q.text = q.text.split(COMMA_FIX[0]).join(COMMA_FIX[1]); fixedQuote = true; }
      outBlocks.push(q);
    } else if (b.__component === 'content.rich-text') {
      outBlocks.push({ __component: 'content.rich-text', body: NEW_BODY }); replacedRich = true;
    } else if (b.__component === 'content.image-block') {
      const { id, image, ...rest } = b; outBlocks.push({ __component: 'content.image-block', ...rest, image: image?.id ?? image });
    } else outBlocks.push(stripIds(b));
  }

  console.log('blokov:', outBlocks.length, '| rt prestavaný:', replacedRich, '| citát-čiarka:', fixedQuote);
  console.log('perex fix:', newExcerpt.includes('řemesel, dovolujeme'));
  console.log('nadpisov(B):', NEW_BODY.filter((n) => n.children?.[0]?.bold).length, '| zoznamov:', NEW_BODY.filter((n) => n.type === 'list').length);

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { excerpt: newExcerpt, blocks: outBlocks } }),
  });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
}
main();

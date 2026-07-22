/**
 * Gramatické opravy 2-z-vasich-dani-nam-velmi-pomozu (titulok + telo + perex). Len text.
 *   node _fix-2z-vasich.mjs [--commit]
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
const DOC = 'q44nekwaa3bs2uyzhnr37cab';

// Poradie: „2% z Vašich daní" pred „z Vašich daní" (prekryv).
const REPL = [
  ['2% z Vašich daní', '2 % z vašich daní'],                                           // 1,2 (titulok)
  ['naše Občianske združenie', 'naše občianske združenie'],                            // 3
  ['z Vašich daní', 'z vašich daní'],                                                  // 2 (rt#0, perex)
  ['na 5 slovanskom mohylníku', 'na 5. slovanskom mohylníku'],                         // 4 (radová)
  ['venovali aktívnej pomoci', 'venovali pomoci'],                                     // 5
  ['Preto ak niekto by bol ochotný darovať nám 2% zo svojej dane', 'Preto, ak by niekto bol ochotný darovať nám 2 % zo svojej dane'], // 6,7,8
  ['Ďakujeme', 'Ďakujeme.'],                                                           // 9
  ['o Vaše 2% a preto ak ešte nie ste rozhodnutí, budeme', 'o vaše 2 %, a preto, ak ešte nie ste rozhodnutí, budeme'], // 10,11
  ['budeme Vám za pomoc', 'budeme vám za pomoc'],                                       // 12
  ['vďační ...', 'vďační…'],                                                            // 13
];
const LINK_REPL = [['TU: Tlačivo na 2%', 'tu: Tlačivo na 2 %']];                        // 14,15

const applied = [];
function apply(text, pairs) {
  let t = nfc(text);
  for (const [a, b] of pairs) { const na = nfc(a); if (t.includes(na)) { t = t.split(na).join(b); applied.push(a); } }
  return t;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=2-z-vasich-dani-nam-velmi-pomozu&populate[blocks][populate]=*&fields[0]=title&fields[1]=excerpt`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const newTitle = apply(d.title, REPL);
  const newExcerpt = apply(d.excerpt || '', REPL);
  const outBlocks = [];
  for (const b of d.blocks || []) {
    if (b.__component !== 'content.rich-text') { outBlocks.push(b); continue; }
    const body = JSON.parse(JSON.stringify(b.body || []));
    for (const node of body) for (const child of node.children || []) {
      if (child.type === 'link' && Array.isArray(child.children)) for (const gc of child.children) if (typeof gc.text === 'string') gc.text = apply(gc.text, LINK_REPL);
      if (typeof child.text === 'string') child.text = apply(child.text, REPL);
    }
    outBlocks.push({ __component: 'content.rich-text', body });
  }

  console.log('title:', JSON.stringify(newTitle));
  console.log('applied:', applied.length, 'zmien');
  const all = [...REPL, ...LINK_REPL].map(([a]) => a);
  const miss = all.filter((a) => !applied.includes(a));
  if (miss.length) console.log('⚠ NENÁJDENÉ:\n  - ' + miss.join('\n  - '));

  if (!COMMIT) { console.log('(náhľad — spusti s --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${DOC}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { title: newTitle, excerpt: newExcerpt, blocks: outBlocks } }),
  });
  console.log(put.ok ? `✓ PUT OK (${put.status})` : `❌ PUT ${put.status}: ${(await put.text()).slice(0, 200)}`);
}
main();

/**
 * Gramatické opravy 2-pre-hradiska-v-roku-2025 (titulok + telo). Len text.
 *   node _fix-2pre-2025.mjs [--commit]
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
const DOC = 'oeitclm4pcykxiq3ovoub7yo';

// Titulok: „2% Pre" → „2 % pre" (#1 pevná medzera, #2 predložka malým)
const TITLE_REPL = [['2% Pre Hradiská', '2 % pre Hradiská']];
// Telo (text-uzly). Poradie nezáleží, každý reťazec je jedinečný.
const REPL = [
  ['Darujte nám 2%', 'Darujte nám 2 %'],                                             // 10
  ['o Vaše 2% a preto ak ešte', 'o vaše 2 %, a preto, ak ešte'],                     // 3+4+5
  ['budeme Vám za pomoc', 'budeme vám za pomoc'],                                    // 6
  ['vďační ... Tlačivo', 'vďační… Tlačivo'],                                         // 7 (trojbodka)
  ['stiahnuť TU:', 'stiahnuť tu:'],                                                  // 8
];
// Text vnútri odkazu (mení sa len zobrazený text, nie url)
const LINK_REPL = [['Tlačivo na 2%', 'Tlačivo na 2 %']];                             // 9

function applyRepl(text, pairs, log) {
  let t = nfc(text);
  for (const [a, b] of pairs) {
    const na = nfc(a);
    if (t.includes(na)) { t = t.split(na).join(b); log(`  "${a.slice(0, 44)}" → "${b.slice(0, 44)}"`); }
  }
  return t;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=2-pre-hradiska-v-roku-2025&populate[blocks][populate]=*&fields[0]=title`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const log = (m) => console.log(m);
  console.log('TITLE:');
  const newTitle = applyRepl(d.title, TITLE_REPL, log);

  console.log('TELO:');
  const outBlocks = [];
  for (const b of d.blocks || []) {
    if (b.__component !== 'content.rich-text') { outBlocks.push(b); continue; }
    const body = JSON.parse(JSON.stringify(b.body || []));
    for (const node of body) for (const child of node.children || []) {
      if (child.type === 'link' && Array.isArray(child.children)) {
        for (const gc of child.children) if (typeof gc.text === 'string') gc.text = applyRepl(gc.text, LINK_REPL, log);
      }
      if (typeof child.text === 'string') child.text = applyRepl(child.text, REPL, log);
    }
    outBlocks.push({ __component: 'content.rich-text', body });
  }

  // over, že všetko prešlo
  const raw = JSON.stringify(d);
  const miss = [...TITLE_REPL, ...REPL, ...LINK_REPL].filter(([a]) => !raw.includes(nfc(a))).map(([a]) => a);
  if (miss.length) console.log('\n⚠ NENÁJDENÉ:\n  - ' + miss.join('\n  - '));

  if (!COMMIT) { console.log('\n(náhľad — spusti s --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${DOC}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: { title: newTitle, blocks: outBlocks } }),
  });
  console.log(put.ok ? `\n✓ PUT OK (${put.status})` : `\n❌ PUT ${put.status}: ${(await put.text()).slice(0, 200)}`);
}
main();

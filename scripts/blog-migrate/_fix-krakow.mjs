/**
 * Opravy vyprava-polske-hradiska-krakow-a-bnin-den-1 (titulok + telo + perex).
 *   node _fix-krakow.mjs [--commit]
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

const REPL = [
  ['Poľské hradiská - Krakow a Bnin', 'Poľské hradiská ' + EN + ' Krakov a Bnin'],                    // #1 titulok
  ['Krakow', 'Krakov'],                                                                               // zjednotenie (Krakow/Krakowe/Krakowa)
  ['"slovanská"', LQ + 'slovanská' + RQ],                                                             // úvodzovky
  ['"prívetivá"', LQ + 'prívetivá' + RQ],
  ['čo mnohí z Vás iste vedia', 'čo mnohí z vás iste vedia'],                                          // malé v
  ['Zbručský ideol', 'Zbručský idol'],                                                                // preklep
  ['ktorá stojí v jeho areáli sú pochovaní', 'ktorá stojí v jeho areáli, sú pochovaní'],              // čiarka
  ['Druhý krát, kedy poloha bola intenzívne osídlená', 'Druhýkrát, keď bola poloha intenzívne osídlená'], // #7
  ['boli 40. roky 9. storočia, kedy tu bola postavená', 'boli to 40. roky 9. storočia, keď tu bola postavená'], // #8
  ['roštovú konštrukciu a v jej spodnej časti', 'roštovú konštrukciu a v jeho spodnej časti'],        // #9 rod
  ['Bninu bola udelená obecná listina založená na magdeburskom práve v rokoch 1386 až 1395',
   'Bninu bola v rokoch 1386 ' + EN + ' 1395 udelená mestská listina založená na magdeburskom práve'], // #10
];
const RX = [
  [/ďalšie bádanie[…\.]+/gu, 'ďalšie bádanie.'],   // #12 trojbodka
];
const applied = new Set();
function ap(t) {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } }
  for (const [rx, b] of RX) { if (rx.test(s)) { s = s.replace(rx, b); applied.add('#12'); } }
  return s;
}
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  const { id, ...rest } = b; return rest;
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyprava-polske-hradiska-krakow-a-bnin-den-1&populate[blocks][populate]=*&fields[0]=title&fields[1]=excerpt&fields[2]=metaDescription&fields[3]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const newTitle = ap(d.title || ''), newExcerpt = ap(d.excerpt || ''), newMetaD = ap(d.metaDescription || '');
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('title:', JSON.stringify(newTitle));
  console.log('aplikovaných:', [...applied].length, '/', REPL.length + 1);
  const miss = [...REPL.map(([a]) => a), '#12'].filter(a => !applied.has(a));
  if (miss.length) miss.forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 55)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { title: newTitle, excerpt: newExcerpt, metaDescription: newMetaD, blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 250));
}
main();

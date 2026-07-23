/**
 * Opravy plavba-rimskou-lodou-po-dunaji-2-diel: motto (Roma aeterna), ~40 gram./typo,
 * obnova nadpisu Bölcske, oddelenie podpisu „Nika", odstránenie duplicitných zdrojov.
 * NEMENÍ (flag): „palanquin"/„trávnikové tehly" — chybný preklad z maď., treba overiť význam.
 *   node _fix-plavba2.mjs [--commit]
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
const ENO = '“', ENC = '”', SKO = '„', SKC = '“', EM = '—';

const REPL = [
  // #2 motto
  [ENO + 'službách Ríma' + ENC + ' Roma eterna, Roma invicta, Danuvina Alacris! Rím večný, Rím neporaziteľný, Dunaj živý!',
   SKO + 'službách Ríma' + SKC + '. Roma aeterna, Roma invicta, Danuvina Alacris! ' + EM + ' Rím večný, Rím neporaziteľný, Dunaj živý!'],
  ['(Itinerarium Antonini )', '(Itinerarium Antonini)'],                                             // #2g
  ['nález z tehly a nápis', 'nález tehly a nápis'],                                                   // #3
  ['pozostávala z 1000 mužov', 'pozostávala z 1 000 mužov'],                                          // #5
  ['zredukoval na 100-200 ľudí', 'zredukoval na 100 – 200 ľudí'],                                     // #6
  ['rozmermi 152x155 metrov majú hrúbku 90-140 cm', 'rozmermi 152 × 155 metrov majú hrúbku 90 – 140 cm'], // #7
  ['Budova veliteľstva (principalia)', 'Budova veliteľstva (principia)'],                             // #8
  ['za vlády Commoda .', 'za vlády Commoda.'],                                                        // #9
  ['jeho veže brány vyčnievali', 'jeho vežové brány vyčnievali'],                                     // #10
  [SKO + 'táborová dedina' + SKC + ') .', SKO + 'táborová dedina' + SKC + ').'],                      // #12
  ['dosahoval 400 x 900 metrov', 'dosahoval 400 × 900 metrov'],                                       // #13
  ['jeden vlažný (tepidárium) a dva studené vodné (frigidarium)', 'jeden vlažný (tepidarium) a dva studené (frigidarium)'], // #14
  ['pohreby sarkofágov', 'pohreby v sarkofágoch'],                                                    // #15
  ['v Száhahalombatte', 'v Százhalombatte'],                                                          // #16
  ['Mesto Szazhalombatta ma prekvapilo', 'Mesto Százhalombatta ma prekvapilo'],                       // #17
  ['Rímsky vojaci v plnej zbroji', 'Rímski vojaci v plnej zbroji'],                                   // #18
  ['Mesto Dunaújvárosi zaujme', 'Mesto Dunaújváros zaujme'],                                          // #20
  ['pevnosť Intercisa Castrum,', 'pevnosť Intercisa (castrum),'],                                     // #21
  ['potrebné na stavbu aggera', 'potrebné na stavbu aggeru'],                                         // #24
  ['Pre riziko zrútenia, sa jeho západná stena posunula', 'Pre riziko zrútenia sa jeho západná stena posunula'], // #25
  ['Veľkosť trochu rovnobežníkového predhradia', 'Veľkosť mierne kosoštvorcového predhradia'],        // #26
  ['bola 176 x asi 200 m', 'bola 176 × asi 200 m'],                                                   // #27
  ['II. prestavba pevnosti prebehla', 'Druhá prestavba pevnosti prebehla'],                           // #28
  [SKO + 'Výskum' + SKC + ' spočiatku využíval', 'Výskum spočiatku využíval'],                        // #31
  ['hranici provincie Panonia', 'hranici provincie Panónia'],                                         // #33
  ['Terra Sigillata a Terra Nigra in situ', 'terra sigillata a terra nigra in situ'],                 // #34
  ['kohorta 500-1000 vojakov', 'kohorta s 500 – 1 000 vojakmi'],                                       // #35
  ['dedinou Dunakömlőds', 'dedinou Dunakömlőd'],                                                       // #36
  ['život, aký sa tu mohol odohrávať v minulosti ako film', 'život, aký sa tu mohol v minulosti odohrávať, ako vo filme'], // #37
  ['Castellum s názvom ' + SKO + 'Alta Ripa' + SKC, 'castellum s názvom ' + SKO + 'Alta Ripa' + SKC], // #38
  ['sa rozprestierali už vyššie spomenuté ' + SKO + 'Limes' + SKC, 'sa rozprestieral už vyššie spomenutý limes'], // #39
  ['V meste Szazhalombatta sme boli ako posádka čestným hosťom', 'V meste Százhalombatta sme boli ako posádka čestnými hosťami'], // #40
  ['v Dunafoldvár nás privítal', 'v Dunaföldvári nás privítal'],                                      // #41
];
const RX = [
  [/bubnovali podľa úderov vesiel do vody[….]+/u, 'bubnovali do rytmu úderov vesiel.'],               // #19
  [/priateľov[….]+\s*v Madocsi a Bolcske/u, 'priateľov. V Madocsi a Bölcske'],                        // #42
  [/dážď[….]+\s*navzájom sme sa/u, 'dážď. Navzájom sme sa'],                                          // #43
  [/tolerovali[….]+\s*znie to/u, 'tolerovali… Znie to'],                                              // #44
  [/zvolaním[….]+\s*Tento pokrik/u, 'zvolaním… Tento pokrik'],                                        // #45
];

const applied = new Set();
function ap(t) {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } }
  for (const [rx, b] of RX) { if (rx.test(s)) { s = s.replace(rx, b); applied.add(rx.source); } }
  return s;
}
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
const blockText = (b) => nfc((b.body || []).map(n => (n.children || []).map(c => c.text || (c.type === 'link' ? (c.children || []).map(x => x.text).join('') : '')).join('')).join('')).trim();
const isDupSrc = (b) => b.__component === 'content.rich-text' && (
  blockText(b).startsWith('a z prednášok, ktoré boli sprievodným programom plavby)') ||
  /^https?:\/\/(www\.)?(donau-uni|interreg-danube|matricamuzeum|hu\.wikipedia|paks)\./.test(blockText(b)));

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=plavba-rimskou-lodou-po-dunaji-2-diel&populate[blocks][populate]=*&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const out = [];
  let bolcske = false, sig = false, dup = 0, srcFixed = false;
  for (const b of d.blocks || []) {
    if (b.__component === 'content.rich-text') {
      const t0 = blockText(b);
      if (t0.startsWith('Nika(informácie')) { out.push({ __component: 'content.rich-text', body: [{ type: 'paragraph', children: [{ type: 'text', text: 'Nika' }] }] }); sig = true; continue; } // #1 podpis
      if (isDupSrc(b)) { dup++; continue; }
      const body = JSON.parse(JSON.stringify(b.body || []));
      const first = body[0];
      const ftxt = nfc((first?.children || []).map(c => c.text || '').join(''));
      if (first?.type === 'paragraph' && /^Bölcske\s+V rokoch 1986/.test(ftxt)) { // #30
        out.push({ __component: 'content.rich-text', body: [{ type: 'heading', level: 2, children: [{ type: 'text', text: 'Bölcske' }] }] });
        first.children[0].text = ftxt.replace(/^Bölcske\s+/, '');
        bolcske = true;
      }
      body.forEach(walk);
      out.push({ __component: 'content.rich-text', body });
    } else if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; out.push({ __component: 'content.image-block', ...rest, image: image?.id ?? image }); }
    else if (b.__component === 'content.sources') {
      const items = (b.items || []).filter(it => /^https?:\/\//.test((it.url || it.text || '').trim())).map(it => ({ text: it.url || it.text, url: it.url || it.text }));
      out.push({ __component: 'content.sources', title: 'Zdroje a literatúra', intro: 'Informácie v texte sú čerpané z týchto webových stránok a z prednášok, ktoré boli sprievodným programom plavby:', items });
      srcFixed = true;
    } else { const { id, ...rest } = b; out.push(rest); }
  }
  // perex
  let excerpt = nfc(d.excerpt || '').replace(/rímskou loďou[….\s]+Matrica Naša cesta pokračovala ďaľšou/u, 'rímskou loďou. Naša cesta pokračovala ďalšou');
  excerpt = ap(excerpt);

  const miss = [...REPL.map(([a]) => a), ...RX.map(([r]) => r.source)].filter(a => !applied.has(a));
  console.log('aplikovaných:', applied.size, '/', REPL.length + RX.length, '| Bölcske:', bolcske, '| podpis Nika:', sig, '| dup-zdroj preč:', dup, '| zdroje prestavané:', srcFixed);
  if (miss.length) { console.log('⚠ NENÁJDENÉ (' + miss.length + '):'); miss.forEach(m => console.log('  - ' + JSON.stringify(m).slice(0, 70))); }
  console.log('blokov:', out.length, '(bolo', (d.blocks || []).length + ') | perex ok:', excerpt.includes('rímskou loďou. Naša') && excerpt.includes('ďalšou'));

  if (!COMMIT) { console.log('\n(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { excerpt, blocks: out } }) });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
}
main();

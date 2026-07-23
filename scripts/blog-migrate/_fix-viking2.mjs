/**
 * Oprava vyprava-k-vikingom-2013-2-cast (cestopis Ľubka J.).
 * Nadpis Bildstenar + odkaz 1. časti, ~30 zlepených slov/čechizmov/typo (regex+páry),
 * osirelé popisky Porthuset/Alandské → k obrázkom b6/b7, autor Ľubka J.
 *   node _fix-viking2.mjs [--commit]
 * FLAG: #2 „…že Hamar" — začiatok vety chýba aj v origináli (nedopĺňam).
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
const EN = '–', ELL = '…';

const REPL = [
  ['najdete', 'nájdete'],                                                                             // rt#0
  ['získávali', 'získavali'],                                                                         // #4
  ['smolu (prýskyřici)', 'smolu (živicu)'],                                                           // #5
  ['umelú jaskynku,( pivničku alebo sklípek)-a pod dieru', 'umelú jaskynku (pivničku) a pod dieru'],   // #6
  ['do tohoto jednoduchého', 'do tohto jednoduchého'],                                                // #7
  ['RAUK-v islandštine HRAUKR, znamená dym na Gotlande', 'Rauk (v islandčine hraukr) znamená na Gotlande skalný útvar'], // #9
  ['nutná hygiene', 'nutná hygiena'],                                                                 // #11
  ['Podľa informácií sat u dá dobre najesť', 'Podľa informácií sa tu dá dobre najesť'],               // #13
  ['Bolo mi troche ľúto', 'Bolo mi trochu ľúto'],                                                     // #16
  ['sledovanie svitania a východ slnka', 'sledovanie svitania a východu slnka'],                      // #17
  ['Pri jazere sa uložili k spánku ešte v cestovatelia dvoch karavanoch', 'Pri jazere sa k spánku uložili ešte cestovatelia v dvoch karavanoch'], // #18
  ['pred tisíc rokmi...Nám', 'pred tisíc rokmi' + ELL + ' Nám'],                                       // #21
  ['prejdeme sa po osade-je na čo', 'prejdeme sa po osade ' + EN + ' je na čo'],                       // #22
  ['so slamou naspanie', 'so slamou na spanie'],                                                       // #23
  ['Pod stechu prjbíjali', 'Pod strechu pribíjali'],                                                  // #23
  ['vybavenie domácnosti, akási pec', 'vybavenie domácnosti: akási pec'],                              // #23
  ['dlhodobá a výrobky', 'trvácna a výrobky'],                                                         // #24
  ['rôznych tvarov-raukami', 'rôznych tvarov ' + EN + ' raukami'],                                     // #27
  ['v inom svete- v minulosti', 'v inom svete ' + EN + ' v minulosti'],                                // #28
  ['komínmi.( kantom', 'komínmi (kantom'], ['skalou) .', 'skalou).'],                                  // #29
  ['nazdevastované', 'nezdevastované'],                                                                // #31
  ['Je to fascinujúce...Len', 'Je to fascinujúce' + ELL + ' Len'],                                     // #32a
  ['svojim práchodom', 'svojím prechodom'],                                                            // #32b
  ['Alandské ostrovy- rybárska osada', 'Alandské ostrovy ' + EN + ' rybárska osada'],                  // popisok
];
const RX = [
  [/ +([,;])/gu, '$1'],                          // medzera pred čiarkou/bodkočiarkou
  [/,(?=\p{L})/gu, ', '],                        // chýbajúca medzera po čiarke (nie po číslici → 1,5 ostane)
  [/(\p{Ll})([.!?])(\p{Lu})/gu, '$1$2 $3'],      // zlepené vety
  [/[.…]{2,}/gu, ELL],                      // viacbodky → …
];
const applied = new Set();
function ap(t) {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } }
  for (const [rx, b] of RX) { if (rx.test(s)) { s = s.replace(rx, b); } }
  return s;
}
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
const blockText = (b) => nfc((b.body || []).map(n => (n.children || []).map(c => c.text || (c.type === 'link' ? (c.children || []).map(x => x.text).join('') : '')).join('')).join('')).trim();
const H2 = (text) => ({ __component: 'content.rich-text', body: [{ type: 'heading', level: 2, children: [{ type: 'text', text }] }] });

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=vyprava-k-vikingom-2013-2-cast&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const out = [];
  let bild = false, capP = false, capA = false;
  for (const b of d.blocks || []) {
    if (b.__component === 'content.rich-text') {
      const t0 = blockText(b);
      if (t0 === 'Ďalší vikingský skanzen v Porthuset' || t0.startsWith('Alandské ostrovy')) continue; // popisky → k obrázkom
      const body = JSON.parse(JSON.stringify(b.body || []));
      body.forEach(walk);
      // rt#0: „tu." odkaz + vyňatie nadpisu BILDSTENAR
      for (const n of body) {
        if (n.type !== 'paragraph' || !n.children) continue;
        for (let i = 0; i < n.children.length; i++) {
          const c = n.children[i];
          if (c.type === 'link' && /^tu\.?$/.test((c.children || []).map(x => x.text).join(''))) {
            c.children = [{ type: 'text', text: 'tu' }];
            const nx = n.children[i + 1];
            if (nx && /BILDSTENAR/.test(nx.text || '')) { nx.text = '.'; bild = true; }
          }
        }
      }
      out.push({ __component: 'content.rich-text', body });
      if (bild && !out.__bild) { out.push(H2('Bildstenar')); out.__bild = true; } // nadpis hneď za rt#0
    } else if (b.__component === 'content.image-block') {
      const { id, image, ...rest } = b;
      const imgId = image?.id ?? image;
      if (imgId === 6173) { rest.caption = 'Ďalší vikingský skanzen v Porthuset'; rest.alt = rest.caption; rest.showCaption = true; capP = true; }
      if (imgId === 6174) { rest.caption = 'Alandské ostrovy ' + EN + ' rybárska osada na konci sveta (najsevernejší cíp) medzi skalami'; rest.alt = rest.caption; rest.showCaption = true; capA = true; }
      out.push({ __component: 'content.image-block', ...rest, image: imgId });
    } else { const { id, ...rest } = b; out.push(rest); }
  }
  console.log('nadpis Bildstenar:', bild, '| popisok Porthuset(b6):', capP, '| Alandské(b7):', capA, '| blokov:', out.length, '(bolo', (d.blocks || []).length + ')');
  console.log('aplikovaných párov:', [...applied].length, '/', REPL.length);
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  if (miss.length) miss.forEach(m => console.log('  ⚠ ' + JSON.stringify(m).slice(0, 55)));

  if (!COMMIT) { console.log('\n(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: out, authorName: 'Ľubka J.' } }) });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
}
main();

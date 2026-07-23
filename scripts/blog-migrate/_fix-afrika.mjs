/**
 * Oprava putovanie-za-rimskymi-pamiatkami-v-afrike (cestopis V. Baranovej).
 * Štruktúra (< artefakty, nadpisy Kartágo/Pupput, podpis), zlepené vety (regex), viacbodky→…,
 * ~20 typo/gramatika, zjednotenie „pred Kr.", faktické (Byrsa), autor + lokalita.
 *   node _fix-afrika.mjs [--commit]
 *
 * FLAG (nemením — deixa/formulácia, potrebuje tvoje rozhodnutie): „dnes 17 % nezamestnanosť",
 *   „tento rok na jeseň voľby", datovanie založenia „825 a 814/813", „dočasný prezident Marzukí",
 *   parentetická poznámka o kolónii (ponechaná inline).
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
const LQ = '„', RQ = '“';

// ── špecifické náhrady (poradie: pred všeobecnými regexmi) ──
const REPL = [
  // storočia / BC → pred Kr.
  ['p.n.l.', 'pred Kr.'],
  // (146 BC + zlepenie ríše„Carthago rieši RX nižšie — kvôli neviditeľnému rozdielu v reťazci)
  ['žil okolo roku 470 pred Kr. BC sa pravdepodobne plavil', 'žil okolo roku 470 pred Kr. Pravdepodobne sa plavil'],
  ['približne v rokoch 480 až 440 pred Kristom. pred Kr. ako nástupca', 'približne v rokoch 480 až 440 pred Kr. ako nástupca'],
  ['od 5. storočia pred Kristom Berbermi', 'od 5. storočia pred Kr. Berbermi'],
  // orphan „< " artefakty
  ['začať. <  V centre', 'začať. V centre'],
  ['oslovila jeho krása.<  Pupput, tiež', 'oslovila jeho krása. Pupput, tiež'],
  // emotikon
  ['v tom teple. ☺Po dvoch', 'v tom teple. Po dvoch'],
  // viacbodky, kt. sú hranicou vety (veľké písmeno) — pred všeobecným regexom
  ['v tvare leva......všetko to vypovedalo', 'v tvare leva… Všetko to vypovedalo'],
  // glued s veľkým UNESCO / obsahové zmeny
  ['zoznamu UNESCO.Kartágo', 'zoznamu UNESCO. Kartágo'],
  ['jeden kúpeľ singular, Hammamet – kúpele plural.Archeologická lokalita', 'jeden kúpeľ (singulár), Hammamet – kúpele (plurál). Archeologická lokalita'],
  ['úlomky črepov terri sigillaty', 'úlomky črepov terra sigillaty'],
  // §5 typografia/gramatika
  ['obklopené tromi kontinentmi', 'obklopené troma kontinentmi'],                                     // 1
  ['veľkých impérií medzi ktorými sa budovali', 'veľkých impérií, medzi ktorými sa budovali'],         // 2,7
  ['čašníci veľmi priateľský', 'čašníci veľmi priateľskí'],                                            // 3
  ['17% nezamestnanosť a až 35% negramotnosť', '17 % nezamestnanosť a až 35 % negramotnosť'],          // 4
  ['zmyslom pre zjednávanie z ceny', 'zmyslom pre zjednávanie ceny'],                                  // 5
  ['nazývali obyvateľov ' + LQ + 'Púni' + RQ, 'nazývali obyvateľov ' + LQ + 'Púnmi' + RQ],             // 8
  ['zvyšky základov Antóniových kúpeľov', 'zvyšky základov Antoninových kúpeľov'],                     // 16
  ['starovekého Kresťanského biskupského stolca', 'starovekého kresťanského biskupského stolca'],      // 18
  ['Piráti zo španielskeho kráľovstva Aragónsko dobyli', 'Piráti z aragónskeho kráľovstva dobyli'],    // 19
  ['Archeologická lokalita Puppet', 'Archeologická lokalita Pupput'],                                  // 20
  ['omamnej vôni korenia', 'omamnej vône korenia'],                                                    // 21
  // faktické
  ['Byrsa – čo v preklade znamená ' + LQ + 'schovať' + RQ, 'Byrsa – čo v gréčtine znamená ' + LQ + 'hovädzia koža' + RQ],
  ['veľký ako kravská koža', 'veľký ako hovädzia koža'],
];
const RX = [
  [/146 BC bolo toto/gu, '146 pred Kr. toto'],                                                         // 146 BC + zdvojené „bolo"
  [/([a-záäčďéíĺľňóôŕšťúýž])[„“”"]Carthago/gu, '$1. „Carthago'], // ríše„Carthago → ríše. „Carthago
  [/[.…]{2,}/gu, '…'],                                                                                 // viacbodky → …
  [/([a-záäčďéěíĺľňóôŕšťúýž“”"])([.!?])([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ])/gu, '$1$2 $3'],                          // zlepené vety
  [/ +([,;:.])/gu, '$1'],                                                                              // medzera pred interpunkciou
  [/„ +/gu, '„'], [/\( +/gu, '('], [/ +\)/gu, ')'],                                                    // medzery v zátvorkách/úvodzovkách
];

const applied = new Set();
function ap(t) {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } }
  for (const [rx, b] of RX) { if (rx.test(s)) { s = s.replace(rx, b); applied.add(rx.source.slice(0, 14)); } }
  return s;
}
const H2 = (text) => ({ __component: 'content.rich-text', body: [{ type: 'heading', level: 2, children: [{ type: 'text', text }] }] });
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=putovanie-za-rimskymi-pamiatkami-v-afrike&populate[blocks][populate]=*&populate[location]=true&fields[0]=excerpt&fields[1]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const out = [];
  let kart = false, pup = false, authorSplit = false;
  for (const b of d.blocks || []) {
    if (b.__component === 'content.rich-text') {
      const body = JSON.parse(JSON.stringify(b.body || []));
      body.forEach(walk);
      const first = body[0];
      const ft = nfc((first?.children || []).map(c => c.text || '').join(''));
      if (/^KartágoKartágo/.test(ft)) { out.push(H2('Kartágo')); first.children[0].text = first.children[0].text.replace(/^Kartágo/, ''); kart = true; }
      else if (/^PupputAvšak/.test(ft)) { out.push(H2('Pupput')); first.children[0].text = first.children[0].text.replace(/^Pupput/, ''); pup = true; }
      // rozdeľ podpis autora na samostatný odsek
      const newBody = [];
      for (const n of body) {
        const t = nfc((n.children || []).map(c => c.text || '').join(''));
        const aIdx = n.children?.[0]?.text ? n.children[0].text.indexOf('Autor textu aj fotiek') : -1;
        if (n.type === 'paragraph' && n.children?.length === 1 && typeof n.children[0].text === 'string' && aIdx > 0) {
          const idx = aIdx;
          const before = n.children[0].text.slice(0, idx).replace(/[…\s]+$/, '…');
          const author = n.children[0].text.slice(idx).trim();
          newBody.push({ type: 'paragraph', children: [{ type: 'text', text: before }] });
          newBody.push({ type: 'paragraph', children: [{ type: 'text', text: author }] });
          authorSplit = true;
        } else newBody.push(n);
      }
      out.push({ __component: 'content.rich-text', body: newBody });
    } else if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; out.push({ __component: 'content.image-block', ...rest, image: image?.id ?? image }); }
    else { const { id, ...rest } = b; out.push(rest); }
  }
  const newExcerpt = ap(d.excerpt || '');
  const loc = d.location ? { name: 'Kartágo', latitude: d.location.latitude, longitude: d.location.longitude, region: d.location.region ?? null, country: d.location.country ?? null } : undefined;

  console.log('REPL/RX aplikovaných:', applied.size, '| nadpis Kartágo:', kart, '| Pupput:', pup, '| podpis oddelený:', authorSplit);
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  if (miss.length) { console.log('⚠ NENÁJDENÉ REPL (' + miss.length + '):'); miss.forEach(m => console.log('  - ' + JSON.stringify(m).slice(0, 60))); }
  console.log('blokov:', out.length, '(bolo', (d.blocks || []).length + ') | authorName → Veronika Baranová | location.name „Súr" →', JSON.stringify(loc?.name));

  if (!COMMIT) { console.log('\n(náhľad — --commit)'); return; }
  const data = { excerpt: newExcerpt, blocks: out, authorName: 'Veronika Baranová' };
  if (loc) data.location = loc;
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data }) });
  console.log(put.ok ? '\n✓ PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
}
main();

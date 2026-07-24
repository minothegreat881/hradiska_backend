/**
 * Opravy p-salkovsky-nacelnici... (~60 v tele + literatúra + systematický vzor pomlčka→spojovník).
 * Zložené pomlčky riešim WHITELISTOM (rozsahy 7.–8., dátumy, dvojice názvov „Uherské Hradiště – Sady",
 * glosy „rex – kráľ" ostávajú spaced). Globálne čistenie medzery pred . , ; ).
 *   node _fix-salkovsky.mjs [--commit]
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
const stripIds = (o) => Array.isArray(o) ? o.map(stripIds) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)])) : o);
const LQ = '„';

const REPL = [
  ['jedincov užívajúcich si väčšinovú autoritu', 'jedincov požívajúcich väčšinovú autoritu'], // 1
  ['z o začiatku 12. stor.', 'zo začiatku 12. stor.'], // 3 (×2)
  ['s Pražskou kultúrou ale aj v nasledujúcich storočiach 7. – 8. mali, podobný vývoj', 's pražskou kultúrou, ale aj v nasledujúcich storočiach (7. – 8.) mali podobný vývoj'], // 5
  ['a južná Morava bol Samo', 'a južná Morava, bol Samo'], // 6
  ['(* okolo 600 – †658/659) , kupec', '(* okolo 600 – † 658/659), kupec'], // 7
  ['(uvádza sa titul rex – kráľ) zvolili', '(uvádza sa titul rex – kráľ) zvolilo'], // 8
  ['jedinci ale bez náčelníckych kompetencií, ku ktorým boli dočasne splnomocňovaní', 'jedinci, ale bez náčelníckych kompetencií, ktorí boli dočasne splnomocňovaní'], // 9
  ['iba asi 5% zo známych', 'iba asi 5 % zo známych'], // 10
  ['takého domy u nás vzácne', 'takéto domy u nás vzácne'], // 11
  ['vrcholnestredovekých mutovaných hradov', 'vrcholnostredovekých murovaných hradov'], // 13
  ['v nemčine Purch, Burg V – ako Veligrad', 'v nemčine Purch, Burg – ako napr. Veligrad'], // 14
  ['Jaromarsburg, Kesigesburch, Wogastisburg', 'Jaromarsburg, Wogastisburg'], // 15
  ['písomníctvo nemali ani ešte nezaujímali', 'písomníctvo nemali, ani ešte nezaujímali'], // 16
  ['koncom 8. storočia už zdá sa existovali', 'koncom 8. storočia už, zdá sa, existovali'], // 17
  ['z prostredí občín', 'z prostredia občín'], // 18
  ['tejto veľmoci, jej svetskej i cirkevnej organizácie', 'tejto veľmoci, ale aj jej svetskej i cirkevnej organizácie'], // 19
  ['Chorvátskych, Slovinských, Slavónskych a Korutanských Slovanov', 'chorvátskych, slovinských, slavónskych a korutánskych Slovanov'], // 21
  ['Vojnomír, Borna, Ľjudovít a ď.', 'Vojnomír, Borna, Ľudovít a i.'], // 22
  ['Prvé písomne doložené známe knieža', 'Prvým písomne doloženým známym kniežaťom'], // 23a
  ['Prvý a jediný menovite spomínaný vodca', 'Prvým a jediným menovite spomínaným vodcom'], // 23b
  ['u markgrófa franskej Avarskej a Korutánskej marky ako aj kniežat bulharských a chorvátskych', 'u markgrófa franskej Avarskej a Korutánskej marky, ako aj u kniežat bulharských a chorvátskych'], // 24
  ['jeho roľu pri vzniku', 'jeho úlohu pri vzniku'], // 25a
  ['Zohral významnú rolu', 'Zohral významnú úlohu'], // 25b
  ['s centrálne umiestenou vládnou', 's centrálne umiestnenou vládnou'], // 26
  ['Ciwitas Priwinae', 'Civitas Priwinae'], // 27
  ['Hoci mal mať Samo 22 synov', 'Hoci Samo mal mať 22 synov'], // 28
  ['Rastica (846 – †870) došlo k stabilizáciu kniežatstva', 'Rastica (846 – † 870) došlo k stabilizácii kniežatstva'], // 29
  ['byzantského cisára Michala III Rastislav', 'byzantského cisára Michala III. Rastislav'], // 30
  ['písmo, hlaholiku aby mohli byť', 'písmo, hlaholiku, aby mohli byť'], // 31
  ['vzniklo ňom aj viacero', 'vzniklo v ňom aj viacero'], // 32
  ['po roku 863 spoluvládcom kniežatstva', 'po roku 863 stal spoluvládcom kniežatstva'], // 33
  ['so svojim strýkom Rastislavom', 'so svojím strýkom Rastislavom'], // 34
  ['boli po vo viacerých úspešných bojoch, k Veľkej Morave pripojené', 'boli vo viacerých úspešných bojoch k Veľkej Morave pripojené'], // 35
  ['rozvinuli sa remeselná výroba, všeobecne vrástla civilizačná úroveň', 'rozvinula sa remeselná výroba, všeobecne vzrástla civilizačná úroveň'], // 36
  ['predkov Starých Maďarov potom po dobytí', 'predkov starých Maďarov, potom po dobytí'], // 37
  ['Mikulčice, Strachotín, Ponansko, Bojná', 'Mikulčice, Strachotín, Pohansko, Bojná'], // 38
  ['prípad Mikulčíc, Nitry alebo boli nahradené', 'prípad Mikulčíc, Nitry, alebo boli nahradené'], // 39
  ['Posledne sa historici prikláňajú', 'V poslednom čase sa historici prikláňajú'], // 42
  ['Wábnít, ktoré je prvým mestom na východe krajiny', 'Wábnít, ' + LQ + 'ktoré je prvým mestom na východe krajiny'], // 44
  ['Atiqua urbs Rastici', 'Antiqua urbs Rastici'], // 46
  ['opevneného predhrania bola zistená', 'opevneného predhradia bola zistená'], // 47
  ['sídelných celkov okolo v predhradí', 'sídelných celkov v predhradí'], // 48
  ['v okolo štvrť milióna artefaktoch z takmer 2500', 'približne v štvrť milióne artefaktov z takmer 2500'], // 49
  ['šírka dosahovala 10 a dĺžku najmenej 18 m', 'šírka dosahovala 10 m a dĺžka najmenej 18 m'], // 50
  ['Existovali tu aj s väčšie voľné priestranstvá', 'Existovali tu aj väčšie voľné priestranstvá'], // 51
  ['obydlí vysokých cirkevného hodnostárov', 'obydlí vysokých cirkevných hodnostárov'], // 52
  ['v plohe U Víta', 'v polohe U Víta'], // 53
  ['v naddunajskom slovanskom prostredí stavanou masívnejšie', 'v naddunajskom slovanskom prostredí stavané masívnejšie'], // 55
  ['Ich typickými reprezentantami je dvorec v Břeclavi – Pohansku, Ducovom a maďarskom Zalaszabar', 'Ich typickými reprezentantmi sú dvorce v Břeclavi-Pohansku, Ducovom a maďarskom Zalaszabare'], // 56
  ['v rakúskom hrade Gars – Tunau', 'v rakúskom hrade Gars-Thunau'], // 57
  ['nielen odborníkov ale i miestnych samospráv', 'nielen odborníkov, ale i miestnych samospráv'], // 58a
  ['nielen skúmajú ale tiež rekonštruujú', 'nielen skúmajú, ale tiež rekonštruujú'], // 58b
  ['Takáto situácia je, vcelku bežná', 'Takáto situácia je vcelku bežná'], // 59
  // --- zložené pomlčky → spojovník (whitelist) ---
  ['slovansko – avarské', 'slovansko-avarské'],
  ['Drávsko – Sávskej', 'Drávsko-Sávskej'],
  ['populárno – vedeckej', 'populárno-vedeckej'],
  ['moravsko – slovenskými', 'moravsko-slovenskými'],
  ['remeselno – umelecká', 'remeselno-umelecká'],
  ['mocensko – politických', 'mocensko-politických'],
  ['sakrálno – kultových', 'sakrálno-kultových'],
  ['pamiatkovo – ochranárskej', 'pamiatkovo-ochranárskej'],
  ['územno – plánovacej', 'územno-plánovacej'],
  ['Břeclavi – Pohansku', 'Břeclavi-Pohansku'],
  ['Brne – Líšni', 'Brne-Líšni'],
  ['Znojme – Hradišti', 'Znojme-Hradišti'],
  ['Gars – Thunau', 'Gars-Thunau'],
  ['H. – M. Hinz', 'H.-M. Hinz'],
  // --- literatúra ---
  ["Křest'anské", 'Křesťanské'], // 61
  ['Geschichte, Kunst, und Archäologie', 'Geschichte, Kunst und Archäologie'], // 63a
  ['Geschichte. Kunst und Archäologie', 'Geschichte, Kunst und Archäologie'], // 63b
  ['Htpp://Wikipedia.org; https://commons.wikimedia.org a ď.', 'https://wikipedia.org, https://commons.wikimedia.org a i.'], // 64
];
const applied = new Set();
const ap = (t) => {
  if (typeof t !== 'string') return t;
  let s = nfc(t);
  for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.add(a); } }
  s = s.replace(/\s+([.,;)])/g, '$1'); // #40/#41 medzera pred interpunkciou
  return s;
};
const walk = (n) => { if (n && typeof n.text === 'string') n.text = ap(n.text); (n?.children || []).forEach(walk); };
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = stripIds(JSON.parse(JSON.stringify(b.body || []))); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; rest.caption = ap(rest.caption); rest.alt = ap(rest.alt); return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
  if (b.__component === 'content.sources') { const { id, items, ...rest } = b; return { __component: 'content.sources', ...stripIds(rest), items: (items || []).map(it => { const { id, ...x } = it; return { ...x, text: ap(x.text) }; }) }; }
  return stripIds(b);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=p-salkovsky-nacelnici-kniezata-a-krali-slovenskych-a-moravskych-slovanov-a-ich-sidla&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  const outBlocks = (d.blocks || []).map(cleanBlock);
  console.log('aplikovaných REPL:', [...applied].length, '/', REPL.length);
  const miss = REPL.map(([a]) => a).filter(a => !applied.has(a));
  miss.forEach(m => console.log('  ⚠ NEAPLIKOVANÉ: ' + JSON.stringify(m).slice(0, 55)));

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks: outBlocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

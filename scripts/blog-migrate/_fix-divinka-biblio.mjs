/**
 * Rekonštrukcia bibliografie: peter-schreiber-osidlenie-ziliny...-divinka.
 * Sources blok bol rozsekaný/zliaty migráciou (aj originál mal nekonzistentné odseky).
 * Prestaviame na 18 samostatných záznamov + opravy (nem./franc. diakritika, OCR SI A→SlA,
 * Budinský, Petrovský, Hanuliak 2001, formát AVANS: „výsk./nál.", vr.→v r., s.N→s. N).
 *   node _fix-divinka-biblio.mjs [--commit]
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '..', '.env') });
const BASE = process.env.STRAPI_URL || 'http://localhost:1337';
const TOKEN = process.env.STRAPI_TOKEN;
const COMMIT = process.argv.includes('--commit');
const stripIds = (o) => Array.isArray(o) ? o.map(stripIds) : (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'id').map(([k, v]) => [k, stripIds(v)])) : o);

const ENTRIES = [
  'Benediková, L. 2000: Prieskum na Kysuciach. Geländebehandlung in der Kysuca-Region. In: Archeol. výsk. a nál. na Slov. v r. 2000. Nitra, s. 41 – 44.',
  'Bialeková, D. 1993: Expansion der Slawen nach Mitteleuropa und ihre Spiegelung im Bestattungsritus. In: Actes du XIIᵉ Congrès International des Sciences Préhistoriques et Protohistoriques, Bratislava 1-7 septembre 1991. 4. Bratislava 1993, 43-48.',
  'Budinský-Krička, V. 1958: Slovanské mohyly na východnom Slovensku. SlA, VI-1958, s. 176 – 177.',
  'Hanuliak, M. 2001, 1–2: K problematike včasnostredovekého mohylového rítu na území Slovenska. Zur Problematik des frühmittelalterlichen Hügelbestattungsritus im Gebiet der Slowakei. s. 227 – 297.',
  'Hulínek, D. 2000: Včasnostredoveké opevnené sídliská na území západného a stredného Slovenska v 8.-10. storočí, Diplomová práca, UK, Bratislava, katedra Archeológie 2000.',
  'Hulínek, D. - Čajka, M. 2004 -1: Včasnostredoveké hradiská na Orave v kontexte hradísk na strednom a západnom Slovensku. Frühmittelalterliche Burgwälle in der Orava-Region im Kontext der Burgwälle in der Mittel-und Westslowakei. SlA, LII-2004-1, s. 77–116.',
  'Moravčík, J. 1978a: Sídlisko púchovskej kultúry v Žiline, časť Strážov. In: Archeol. výsk. a nál. na Slov. v r. 1978. Nitra, s. 91.',
  'Moravčík, J. 1978b: Divinka okres Žilina. In: Významné 1978. s. 58, 59.',
  'Moravčík, J. 1984: Prírastky nálezov z okresu Žilina. In: Archeol. výsk. a nál. na Slov. v r. 1984. Nitra, s. 165.',
  'Moravčík, J. 1993: Výskum na Mariánskom námestí v Žiline. In: Archeol. výsk. a nál. na Slov. v r. 1993. Nitra, s. 98.',
  'Moravčík, J. 1993: Nové poznatky o osídlení hradu Hričov. In: Archeol. výsk. a nál. na Slov. v r. 1993. Nitra, s. 96.',
  'Petrovský-Šichman A. J. 1957: Praveké opevnenie v Divinke. In: Študijné zvesti AÚ SAV, 2 1957 (Janšakov zborník), s. 87 – 90.',
  'Petrovský-Šichman A. J. 1964: Slovanské osídlenie severného Slovenska. In: Vlastivedný zborník Považia VI 1964. Banská Bystrica, s. 50-106.',
  'Petrovský-Šichman A. J. 1966: Výskum sídliska z doby rímskej Ohrádza v Žiline. In: Vlastivedný zborník Považia VII. 1966. Banská Bystrica, s. 7-23.',
  'Petrovský-Šichman A. J. 1970: Výskum slovanských mohylníkov v okolí Žiliny. Erforschung slawischer Hügelgräberfelder im Umkreis von Žilina. In: Študijné zvesti AÚ SAV, 18 1970. s. 193-209.',
  'Pieta, K. - Moravčík, J. 1984: Železiarne z doby rímskej vo Varíne. In: Archeol. výsk. a nál. na Slov. v r. 1984. Nitra, s. 193, 194.',
  'Pramene II 1992 - D. Bialeková (Ed.): Pramene k dejinám osídlenia Slovenska z konca 5. až 13. storočia. II. Stredoslovenský kraj. Nitra 1992.',
  'Šedo, O. 1993: Zbery v Žiline-Závodí v polohe nad Vinicou. In: Archeol. výsk. a nál. na Slov. v r. 1993. Nitra, s. 126.',
];

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=peter-schreiber-osidlenie-ziliny-a-okolia-od-doby-rimskej-po-stredovek-lokalita-divinka&populate[blocks][populate]=*&fields[0]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }
  let srcSeen = false;
  const blocks = (d.blocks || []).map(b => {
    if (b.__component === 'content.sources') {
      srcSeen = true;
      const { id, items, ...rest } = b;
      return { __component: 'content.sources', ...stripIds(rest), items: ENTRIES.map(t => ({ text: t, url: null })) };
    }
    if (b.__component === 'content.rich-text') return { __component: 'content.rich-text', body: stripIds(b.body || []) };
    if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; return { __component: 'content.image-block', ...stripIds(rest), image: image?.id ?? image }; }
    return stripIds(b);
  });
  console.log('sources blok nájdený:', srcSeen, '| nové záznamy:', ENTRIES.length);

  if (!COMMIT) { console.log('(náhľad — --commit)'); return; }
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { blocks } }) });
  console.log(put.ok ? '✓ PUT OK' : '❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 300));
}
main();

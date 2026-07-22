/**
 * Komplexná oprava sucany-skala:
 *  - telo (valy k–b–z–i–l bez medzier, gramatika/typografia #1–#12)
 *  - kľúčové fakty + časová os (valy bez medzier, I.→1. storočie, 50.–60.→50. a 60., iniciála A.)
 *  - lokalita: name „Skvelá" (kontaminácia z popisku) → „Sučany – Skala"
 *  - popisky galérie (media): dvojfotografia, korálka (ktoré), hradisku, trojbodka
 *  - zdroje: doplnenie VZP 1964
 *  - titulok + téma: spojovník → pomlčka
 *   node _fix-sucany.mjs [--commit]
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
const EN = '–', RQ = '“';

const REPL = [
  ['Sučany - Skala', 'Sučany ' + EN + ' Skala'],                                                         // titulok + téma
  // ── valy: medzery okolo pomlčiek preč (kľúčové fakty) ──
  ['k ' + EN + ' b ' + EN + ' z ' + EN + ' i ' + EN + ' l', 'k' + EN + 'b' + EN + 'z' + EN + 'i' + EN + 'l'],
  ['m ' + EN + ' o ' + EN + ' c ' + EN + ' s ' + EN + ' n', 'm' + EN + 'o' + EN + 'c' + EN + 's' + EN + 'n'],
  ['o ' + EN + ' p ' + EN + ' d ' + EN + ' r ' + EN + ' s', 'o' + EN + 'p' + EN + 'd' + EN + 'r' + EN + 's'],
  // ── valy: doplnenie pomlčiek (telo, poškodené medzery) ──
  ['Obvodový val k b z i l sa ťahá', 'Obvodový val k' + EN + 'b' + EN + 'z' + EN + 'i' + EN + 'l sa ťahá'],
  ['v partii e j sa úplne rozpadol', 'v partii e' + EN + 'j sa úplne rozpadol'],
  ['druhý val m o c s n', 'druhý val m' + EN + 'o' + EN + 'c' + EN + 's' + EN + 'n'],
  ['polkruhový val o p d r s', 'polkruhový val o' + EN + 'p' + EN + 'd' + EN + 'r' + EN + 's'],
  ['Výška valu m o c s n', 'Výška valu m' + EN + 'o' + EN + 'c' + EN + 's' + EN + 'n'],
  ['Najvyšší bod valu o p d r s', 'Najvyšší bod valu o' + EN + 'p' + EN + 'd' + EN + 'r' + EN + 's'],
  ['valmi m c h, o d s a skalným', 'valmi m' + EN + 'c' + EN + 'h, o' + EN + 'd' + EN + 's a skalným'],
  // ── gramatika / typografia (telo) ──
  ['geologickej, ako historickej', 'geologickej, ako aj historickej'],                                   // #1
  ['Skala" tvorí ideálny terén', 'Skala' + RQ + ' tvorí ideálny terén'],                                 // #2 úvodzovka
  ['Prístup do neho bol vo všeobecnosti po hrebeni', 'Prístup doň bol iba po hrebeni'],                   // #4
  ['vodou, zároveň zostup do roviny, od ktorej záviselo hradisko hospodársky, obstarávala cesta',
   'vodou, ako aj zostup do roviny, od ktorej hradisko hospodársky záviselo, obstarávala cesta'],         // #5
  ['2 mince zo 14. storočia', 'dve mince zo 14. storočia'],                                               // #7
  ['2 bronzové spony, datované do I. storočia n. l.', 'dve bronzové spony, datované do 1. storočia n. l.'], // #7+#8
  ['I. storočia n. l.', '1. storočia n. l.'],                                                             // #8 (telo/kf/timeline)
  ['I. storočie n. l.', '1. storočie n. l.'],                                                             // #8 (timeline year)
  ['50. ' + EN + ' 60. rokoch', '50. a 60. rokoch'],                                                      // #10 (telo/kf)
  ['50. ' + EN + ' 60. roky', '50. a 60. roky'],                                                          // #10 (timeline)
  ['Petrovskému-Šichmanovi (VZP 1964)', 'A. Petrovskému-Šichmanovi (VZP 1964)'],                          // #11 (telo)
  ['a Petrovský-Šichman (VZP 1964)', 'a A. Petrovský-Šichman (VZP 1964)'],                                // kf
  ['Petrovskému-Šichmanovi sa podarilo', 'A. Petrovskému-Šichmanovi sa podarilo'],                        // timeline desc
  ['publikácia Petrovského-Šichmana', 'publikácia A. Petrovského-Šichmana'],                              // timeline title
  ['... a takto vyzerá dnes', '… a takto vyzerá dnes'],                                                   // #12 (img caption)
];

const applied = [];
const ap = (t) => { if (typeof t !== 'string') return t; let s = nfc(t); for (const [a, b] of REPL) { const na = nfc(a); if (s.includes(na)) { s = s.split(na).join(b); applied.push(a); } } return s; };
function walk(node) { if (node && typeof node.text === 'string') node.text = ap(node.text); if (node && Array.isArray(node.children)) node.children.forEach(walk); }
const stripId = (o) => { const { id, ...rest } = o; return rest; };
function cleanBlock(b) {
  if (b.__component === 'content.rich-text') { const body = JSON.parse(JSON.stringify(b.body || [])); body.forEach(walk); return { __component: 'content.rich-text', body }; }
  if (b.__component === 'content.image-block') { const { id, image, ...rest } = b; for (const k of ['caption', 'alt']) if (typeof rest[k] === 'string') rest[k] = ap(rest[k]); return { __component: 'content.image-block', ...rest, image: image?.id ?? image }; }
  if (b.__component === 'content.quote-block') { const q = stripId(b); if (typeof q.text === 'string') q.text = ap(q.text); return q; }
  if (b.__component === 'content.sources') {
    const items = (b.items || []).map((it) => ({ text: ap(it.text || ''), url: it.url || '' }));
    // #13: doplniť VZP 1964 za Hrubca (index 2), pred odkazy
    if (!items.some((it) => /VZP|Vlastivedný zborník Považia/i.test(it.text))) {
      const insertAt = items.findIndex((it) => /geocaching|panoramio|^http/i.test(it.text || it.url));
      const vzp = { text: 'PETROVSKÝ-ŠICHMAN, A.: Vlastivedný zborník Považia (VZP), 1964.', url: '' };
      items.splice(insertAt < 0 ? items.length : insertAt, 0, vzp);
    }
    return { __component: 'content.sources', title: b.title, intro: b.intro ?? null, items };
  }
  return stripId(b);
}

// popisky galérie (celé nové znenie)
const MEDIA = [
  [2628, '… a takto vyzerá dnes'],
  [2629, 'Dvojfotografia ' + '„' + 'vtedy a teraz' + RQ + ' (autor: Naj). K dokonalosti chýba ešte tretí pohľad ' + EN + ' stav pred 2 000 rokmi.'],
  [2630, 'Slovanský črep a hlinená korálka, ktoré našiel Janšák'],
  [2635, 'Na hradisku je takáto vyvýšenina'],
];
async function setCaption(id, caption) {
  const cur = await (await fetch(`${BASE}/api/upload/files/${id}`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json();
  console.log(`  media ${id}: "${(cur.caption || '').slice(0, 45)}" → "${caption.slice(0, 45)}"`);
  if (!COMMIT) return;
  const form = new FormData();
  form.append('fileInfo', JSON.stringify({ caption, alternativeText: caption }));
  const up = await fetch(`${BASE}/api/upload?id=${id}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: form });
  console.log('   ', up.ok ? '✓' : '❌ ' + up.status);
}

async function main() {
  const r = await fetch(`${BASE}/api/blog-posts?filters[slug][$eq]=sucany-skala&populate[blocks][populate]=*&populate[location]=true&populate[tags]=true&populate[keyFacts]=true&populate[timeline]=true&fields[0]=title&fields[1]=excerpt&fields[2]=documentId`);
  const d = (await r.json()).data?.[0];
  if (!d) { console.error('nenájdený'); process.exit(1); }

  const newTitle = ap(d.title || '');
  const newExcerpt = ap(d.excerpt || '');
  const newKeyFacts = (d.keyFacts || []).map((k) => ({ label: ap(k.label), value: ap(k.value), icon: k.icon }));
  const newTimeline = (d.timeline || []).map((t) => ({ year: ap(t.year), title: ap(t.title), description: ap(t.description), type: t.type }));
  const loc = d.location ? { name: 'Sučany ' + EN + ' Skala', latitude: d.location.latitude, longitude: d.location.longitude, region: d.location.region ?? null, country: d.location.country ?? null } : undefined;
  const outBlocks = (d.blocks || []).map(cleanBlock);

  console.log('title:', JSON.stringify(newTitle));
  console.log('location.name: "Skvelá" →', JSON.stringify(loc?.name));
  console.log('aplikovaných párov:', [...new Set(applied)].length, '/', REPL.length);
  const miss = REPL.map(([a]) => a).filter((a) => !applied.includes(a));
  if (miss.length) { console.log('⚠ NENÁJDENÉ (' + miss.length + '):'); miss.forEach((m) => console.log('  - ' + JSON.stringify(m).slice(0, 70))); }
  const src = outBlocks.find((b) => b.__component === 'content.sources');
  console.log('zdroje položiek:', src?.items.length, '| VZP:', src?.items.some((i) => /VZP/.test(i.text)));
  console.log('\nGaléria:');
  for (const [id, cap] of MEDIA) await setCaption(id, cap);

  if (!COMMIT) { console.log('\n(náhľad — --commit na zápis)'); return; }
  const data = { title: newTitle, excerpt: newExcerpt, keyFacts: newKeyFacts, timeline: newTimeline, blocks: outBlocks };
  if (loc) data.location = loc;
  const put = await fetch(`${BASE}/api/blog-posts/${d.documentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data }),
  });
  console.log(put.ok ? '\n✓ blog-post PUT OK' : '\n❌ PUT ' + put.status + ': ' + (await put.text()).slice(0, 400));
  // téma (relácia) — spojovník → pomlčka
  const tag = (d.tags || [])[0];
  if (tag && /Sučany - Skala/.test(tag.name)) {
    const tp = await fetch(`${BASE}/api/tags/${tag.documentId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ data: { name: 'Sučany ' + EN + ' Skala' } }) });
    console.log(tp.ok ? '✓ téma PUT OK' : '❌ téma ' + tp.status);
  }
}
main();

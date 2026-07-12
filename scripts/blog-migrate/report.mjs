/**
 * Fáza 6 — Migračný report (záver pipeline). Per článok vyrobí prehľadnú štatistiku:
 * bloky, obrázky (telo/galéria/popisy), timeline, keyFacts, gramatické opravy (before→after
 * po kategóriách), komentáre, lokalita/kategória/tagy, a (voliteľne) pokrytie textu vs originál.
 *
 * Použitie:
 *   node scripts/blog-migrate/report.mjs --slug=<slug>
 *   node scripts/blog-migrate/report.mjs --slug=<slug> --feed=data/<post>.json   (pridá pokrytie textu)
 *   node scripts/blog-migrate/report.mjs --all                                    (všetky publikované)
 *
 * Výstup: vytlačí do konzoly + zapíše out/<slug>.report.md
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = 'http://localhost:1337';
const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));

// slug → originál feed (na auto-výpočet % pokrytia textu bez --feed)
const FEED_MAP = {
  'stare-mesto-velehrad': 'data/velehrad-post.json',
  'wogastisburg-najvyznamnejsie-hradisko-samovej-rise': 'data/wogastisburg-post.json',
  'blatnohrad-pribinovo-sidlo-v-panonii': 'data/post.json',
  'mikulcice-kopcany': 'data/mikulcice-post.json',
};

function catOf(reason) {
  const r = (reason || '').toLowerCase();
  if (/čiark|interpunk|vzťažn|uzavret|spojk|bodk/.test(r)) return 'interpunkcia (čiarky/bodky)';
  if (/i\/y|dĺžeň|lokál/.test(r)) return 'i/y a dĺžne';
  if (/nominatív|nom\. pl|plurál/.test(r)) return 'nominatív plurálu';
  if (/zhoda/.test(r)) return 'zhoda podmet–prísudok';
  if (/predložk/.test(r)) return 'predložky';
  if (/malým|veľké|veľkým|veľkosť/.test(r)) return 'veľké/malé písmená';
  if (/spolu|spojovník|krátenie/.test(r)) return 'písanie spolu/krátenie';
  if (/medzer/.test(r)) return 'chýbajúce medzery';
  if (/dĺžeň|dĺžne/.test(r)) return 'i/y a dĺžne';
  if (/preklep/.test(r)) return 'preklepy';
  return 'iné';
}

async function reportFor(slug, feedPath) {
  feedPath = feedPath || FEED_MAP[slug] || null;   // auto-feed pre % pokrytia
  const q = 'filters[slug][$eq]=' + slug +
    '&populate[0]=blocks.image&populate[1]=blocks.items&populate[2]=coverImage&populate[3]=gallery' +
    '&populate[4]=category&populate[5]=tags&populate[6]=location&populate[7]=timeline&populate[8]=keyFacts';
  const p = (await fetch(`${URL}/api/blog-posts?${q}`).then(r => r.json())).data?.[0];
  if (!p) { console.error('❌ nenájdený:', slug); return; }

  // bloky
  const bc = {}; p.blocks.forEach(b => bc[b.__component] = (bc[b.__component] || 0) + 1);
  const bodyImgs = p.blocks.filter(b => b.__component === 'content.image-block');
  const galleryCnt = (p.gallery || []).length;
  const galleryCap = (p.gallery || []).filter(g => g.caption).length;
  const bodyImgCap = bodyImgs.filter(b => b.caption).length;
  const sourcesBlk = p.blocks.find(b => b.__component === 'content.sources');
  const sourcesItems = sourcesBlk ? (sourcesBlk.items || []).length : 0;
  // text
  const bodyText = p.blocks.filter(b => b.__component === 'content.rich-text').flatMap(b => b.body || []).map(n => (n.children || []).map(c => c.text || '').join('')).join(' ');
  const bodyChars = bodyText.length;
  const bodyWords = bodyText.split(/\s+/).filter(Boolean).length;
  // komentáre
  const cj = await fetch(`${URL}/api/blog-comments?filters[post][documentId][$eq]=${p.documentId}&pagination[pageSize]=200`).then(r => r.json()).catch(() => ({}));
  const comments = cj?.meta?.pagination?.total ?? (cj?.data?.length ?? 0);

  // audit súbory
  const gPath = resolve(__dirname, 'out', `${slug}.grammar.json`);
  const tPath = resolve(__dirname, 'out', `${slug}.timeline.json`);
  const gram = existsSync(gPath) ? JSON.parse(readFileSync(gPath, 'utf8')).corrections : [];
  const catCount = {}; gram.forEach(c => { const k = catOf(c.reason); catCount[k] = (catCount[k] || 0) + 1; });

  // voliteľné pokrytie textu vs originál
  let coverage = null;
  if (feedPath && existsSync(resolve(__dirname, feedPath))) {
    try {
      const cheerio = await import('cheerio');
      const feed = JSON.parse(readFileSync(resolve(__dirname, feedPath), 'utf8'));
      const $ = cheerio.load(feed.feed.entry[0].content.$t); $('iframe,script,style').remove();
      const words = s => (s || '').replace(/ /g, ' ').toLowerCase().replace(/[^a-z0-9áäčďéíĺľňóôŕšťúýž ]/gi, ' ').split(/\s+/).filter(w => w.length >= 3);
      const orig = words($.root().text());
      const parts = [];
      p.blocks.forEach(b => { if (b.__component === 'content.rich-text') b.body.forEach(n => (n.children || []).forEach(c => { parts.push(c.text || ''); if (c.type === 'link') parts.push((c.children || []).map(x => x.text || '').join('')); })); else if (b.__component === 'content.quote-block') { parts.push(b.text || ''); parts.push(b.author || ''); } else if (b.__component === 'content.sources') (b.items || []).forEach(it => parts.push(it.text || '')); else if (b.__component === 'content.image-block' && b.caption) parts.push(b.caption); });
      (p.gallery || []).forEach(g => { if (g.caption) parts.push(g.caption); });
      const set = new Set(words(parts.join(' ')));
      const IGN = new Set(['zväčšiť', 'mapu', 'mapa', 'view', 'larger', 'map']);
      // gramaticky OPRAVENÉ slová (pôvodné tvary) — nie sú stratené, len opravené na správny tvar
      const correctedAway = new Set(); gram.forEach(c => words(c.before).forEach(w => { if (!words(c.after).includes(w)) correctedAway.add(w); }));
      const miss = [...new Set(orig.filter(w => !set.has(w) && !IGN.has(w) && !correctedAway.has(w)))];
      coverage = { pct: ((1 - miss.length / new Set(orig).size) * 100).toFixed(2), miss, corrected: correctedAway.size };
    } catch (e) { coverage = { error: e.message }; }
  }

  // --- INTEGRITA / ÚPLNOSŤ (ochrana: nič sa nestratilo) ---
  const checks = [];
  // 1) text
  if (coverage && !coverage.error) {
    const okText = parseFloat(coverage.pct) >= 99;
    checks.push({ ok: okText, label: `Text: pokrytie ${coverage.pct}% vs originál (gramaticky opravené slová vyňaté: ${coverage.corrected || 0})` + (coverage.miss.length ? ` — zvyšné mimo: ${coverage.miss.slice(0, 10).join(', ')} (over: map-widget/tvary/odkazy)` : ' — nič nechýba ✅') });
  } else {
    checks.push({ ok: null, label: 'Text: % pokrytia nepočítané (originál feed nedostupný)' });
  }
  // 2) obrázky evidované — každý obrázok v tele je aj v galérii (galéria = všetky, dedup)
  const galNames = new Set((p.gallery || []).map(g => g.name));
  const bodyNotInGallery = bodyImgs.filter(b => b.image && !galNames.has(b.image.name)).map(b => b.image.name);
  checks.push({ ok: bodyNotInGallery.length === 0, label: `Obrázky evidované: telo (${bodyImgs.length}) ⊆ galéria (${galleryCnt})` + (bodyNotInGallery.length ? ` — CHÝBAJÚ v galérii: ${bodyNotInGallery.join(', ')}` : ' — žiadny sa nestratil') });
  // 3) žiadna stena (max 1 obrázok za sebou v tele)
  let wall = 0, run = 0; p.blocks.forEach(b => { if (b.__component === 'content.image-block') { run++; wall = Math.max(wall, run); } else run = 0; });
  checks.push({ ok: wall <= 1, label: `Rytmus: max ${wall} obrázok za sebou (žiadna stena)` });
  // 4) sidebar (doplnok, nie strata obsahu)
  checks.push({ ok: (p.timeline || []).length > 0 && (p.keyFacts || []).length > 0, label: `Sidebar: timeline ${(p.timeline || []).length}, keyFacts ${(p.keyFacts || []).length}` + ((p.timeline || []).length ? '' : ' — agent nebežal') });
  // 5) gramatika (doplnok)
  checks.push({ ok: gram.length > 0 ? true : null, label: gram.length ? `Gramatika: ${gram.length} opráv aplikovaných (audit súbor)` : 'Gramatika: audit súbor nenájdený (korektúra nebežala)' });
  // verdikt — „nič sa nestratilo" závisí od text+obrázky+rytmus (nie od sidebar/gramatiky, tie sú doplnky)
  const core = [checks[0], checks[1], checks[2]].filter(c => c.ok !== null);
  const lost = core.some(c => c.ok === false);
  const verdict = lost ? '⚠ POZOR — niečo sa mohlo stratiť, pozri kontroly' : '✅ MIGRÁCIA ÚPLNÁ — nič sa nestratilo (text + obrázky + rytmus OK)';

  // --- markdown ---
  const L = [];
  L.push(`# Migračný report — ${p.title}`);
  L.push('');
  L.push(`- **slug:** \`${slug}\` · **documentId:** \`${p.documentId}\` · **publikované:** ${p.publishedAt ? '✅' : 'draft'}`);
  L.push(`- **kategória:** ${p.category?.name || '—'} · **tagy:** ${(p.tags || []).map(t => t.name).join(', ') || '—'} · **lokalita:** ${p.location?.name || '—'}${p.location?.country ? ' (' + p.location.country + ')' : ''}`);
  L.push('');
  L.push('## ✅ Integrita a úplnosť');
  L.push('');
  L.push(`> **${verdict}**`);
  L.push('');
  checks.forEach(c => L.push(`- ${c.ok === true ? '✅' : c.ok === false ? '❌' : 'ℹ️'} ${c.label}`));
  L.push('');
  L.push('## Obsah (bloky)');
  L.push(`| typ | počet |`); L.push(`|---|---|`);
  L.push(`| rich-text (odseky/nadpisy) | ${bc['content.rich-text'] || 0} |`);
  L.push(`| quote-block (dobové pramene) | ${bc['content.quote-block'] || 0} |`);
  L.push(`| image-block (v tele) | ${bc['content.image-block'] || 0} |`);
  L.push(`| embed (video/3D) | ${bc['content.embed'] || 0} |`);
  L.push(`| sources (zdroje) | ${bc['content.sources'] || 0}${sourcesItems ? ' → ' + sourcesItems + ' položiek' : ''} |`);
  L.push('');
  L.push('## Obrázky');
  const totalImg = bodyImgs.length + galleryCnt - bodyImgs.filter(b => (p.gallery || []).some(g => g.name === b.image?.name)).length;
  L.push(`- **galéria:** ${galleryCnt} (${galleryCap} s popisom)`);
  L.push(`- **v tele článku:** ${bodyImgs.length} (${bodyImgCap} s popisom)${bodyImgs.length ? ' — ' + bodyImgs.map(b => b.image?.name).filter(Boolean).join(', ') : ''}`);
  L.push('');
  L.push('## Sidebar');
  L.push(`- **Časová os (timeline):** ${(p.timeline || []).length} položiek`);
  (p.timeline || []).forEach(t => L.push(`  - ${t.year} · ${t.type} · ${t.title}`));
  L.push(`- **Kľúčové fakty (keyFacts):** ${(p.keyFacts || []).length}`);
  (p.keyFacts || []).forEach(k => L.push(`  - ${k.label}: ${k.value}`));
  L.push('');
  L.push('## Gramatická korektúra');
  if (gram.length) {
    L.push(`- **opráv spolu: ${gram.length}**`);
    Object.entries(catCount).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => L.push(`  - ${k}: ${n}`));
    L.push('');
    L.push('| # | blok | pôvodné → navrhované | dôvod |');
    L.push('|---|---|---|---|');
    gram.forEach((c, i) => L.push(`| ${i + 1} | ${c.block} | \`${c.before}\` → \`${c.after}\` | ${c.reason} |`));
  } else {
    L.push('- gramatika: (audit súbor nenájdený — korektúra nebežala alebo bez zmien)');
  }
  L.push('');
  L.push('## Ostatné');
  L.push(`- **komentáre:** ${comments}`);
  L.push(`- **text tela:** ${bodyChars} znakov (${bodyWords} slov)`);
  if (coverage) L.push(`- **pokrytie textu vs originál:** ${coverage.error ? 'chyba: ' + coverage.error : coverage.pct + '%' + (coverage.miss.length ? ' (mimo: ' + coverage.miss.slice(0, 8).join(', ') + ')' : ' ✅')}`);
  L.push('');
  L.push(`_Report vygenerovaný Fázou 6 migračného pipeline._`);

  const md = L.join('\n');
  writeFileSync(resolve(__dirname, 'out', `${slug}.report.md`), md + '\n');

  // konzolový súhrn
  console.log('\n════════ ' + p.title + ' ════════');
  console.log(verdict);
  console.log('bloky: ' + JSON.stringify(bc));
  console.log('obrázky: telo ' + bodyImgs.length + ' | galéria ' + galleryCnt + ' (' + galleryCap + ' s popisom)');
  console.log('timeline: ' + (p.timeline || []).length + ' | keyFacts: ' + (p.keyFacts || []).length);
  console.log('gramatika: ' + gram.length + ' opráv ' + (gram.length ? '[' + Object.entries(catCount).map(([k, n]) => k.split(' ')[0] + ':' + n).join(', ') + ']' : ''));
  console.log('komentáre: ' + comments + ' | text: ' + bodyChars + ' zn' + (coverage && !coverage.error ? ' | pokrytie ' + coverage.pct + '%' : ''));
  console.log('→ out/' + slug + '.report.md');
}

if (args.all) {
  const list = await fetch(`${URL}/api/blog-posts?fields[0]=slug&pagination[pageSize]=100`).then(r => r.json());
  for (const d of list.data) await reportFor(d.slug, null);
} else if (args.slug) {
  await reportFor(args.slug, args.feed);
} else {
  console.log('Použitie: node report.mjs --slug=<slug> [--feed=data/<post>.json] | --all');
}

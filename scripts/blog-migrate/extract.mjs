/**
 * Fáza 1 — extraktor Blogger → medzistupňový JSON v štruktúre Strapi komponentov.
 *
 * Vstup:  Blogger Atom/JSON feed jedného postu (+ voliteľne komentárový feed)
 * Výstup: jeden JSON na kontrolu — ešte sa NEPOSIELA do Strapi.
 *
 * Pravidlá pre tento prechod (schválené Fázou 0 + 6 úprav):
 * - Obrázky: pripravíme dve URL (preferovaná /s0/ originál, fallback /s1600/).
 *   Skutočné stiahnutie + SHA-256 dedup robí až Fáza 2.
 * - sourceLabel: zachovaný v $meta (label `(H)` z `entry.category`).
 * - coverImage: prvý obrázok + flag coverImageNeedsReview: true.
 * - location.region: len ak doslova v texte; inak null.
 * - Zdroje: do blocks ako rich-text + zároveň štruktúrované pole citations v JSON.
 * - Idempotencia (slug check pred POST) — implementuje Fáza 2.
 * - Komentáre: do $meta.comments ako surové pole {author, published, content};
 *   commentCount = 5 v tomto vzorovom článku.
 *
 * Spúšťanie:
 *   node scripts/blog-migrate/extract.mjs \
 *     --post=scripts/blog-migrate/data/post.json \
 *     --comments=scripts/blog-migrate/data/comments.json \
 *     --out=scripts/blog-migrate/out
 *
 * Default cesty zodpovedajú repo štruktúre — môžu byť všetky vynechané.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}

const args = parseArgs(process.argv);
const POST_PATH = resolve(__dirname, args.post ?? 'data/post.json');
const COMMENTS_PATH = resolve(__dirname, args.comments ?? 'data/comments.json');
const OUT_DIR = resolve(__dirname, args.out ?? 'out');

// -----------------------------------------------------------------------------
// Pomocné funkcie
// -----------------------------------------------------------------------------

/** Slovenský slugifier (zjednodušený — Strapi uid robí to isté server-side, my len
 *  potrebujeme stable file name + idempotenčný kľúč). */
function slugify(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Strip `&nbsp;` na začiatku odsadeného odseku (4–6× medzera ako "tab"). */
function normalizeLeading(s) {
  // BUG: orezavala aj koncovy whitespace zo para[0].text (nie len uvodny ako meno sluby) -
  // ak prve dieta odseku bolo text hned nasledovany odkazom/boldom/italic, medzera pred
  // dalsim uzlom sa stratila a text sa zlepil ("s kostolomKostol..."). Orezava LEN uvodny.
  return s.replace(/^[\s ]+/, '');
}

/** Canonicalize URL pre dedup citácií. Normalizuje:
 *  - case (lowercase)
 *  - protokol (strip http/https)
 *  - `www.` prefix
 *  - trailing slash
 *  - fragment (`#...`)
 *  - leading/trailing whitespace (vrátane NBSP)
 *  Tým `http://x.cz` `https://www.x.cz/` `X.CZ#a` všetky → `x.cz`. */
function canonicalUrl(u) {
  if (!u) return '';
  return String(u)
    .replace(/^[ \s]+|[ \s]+$/g, '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/#.*$/, '')
    .replace(/\/+$/, '');
}

/** Strip leading + trailing whitespace vrátane NBSP (` `). */
function stripNbspWs(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/^[ \s]+|[ \s]+$/g, '');
}

function convertShortParagraphsToHeadings(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  for (const blk of blocks) {
    if (blk?.__component !== 'content.rich-text') continue;
    if (!Array.isArray(blk.body)) continue;
    for (const node of blk.body) {
      if (node.type !== 'paragraph') continue;
      if (!Array.isArray(node.children) || node.children.length !== 1) continue;
      const c = node.children[0];
      if (c?.type !== 'text') continue;
      const t = stripNbspWs(c.text || '');
      if (!t || t.length > 60) continue;
      // BUG 4: atribučné riadky ("Foto:", "Spracoval:", "Zdroj:", "Autor:", "Prameň:")
      // nie sú sekčné nadpisy — necháme ich ako bežný odsek (alebo ich classifyCitation
      // zachytí, ak sú v zdrojovej sekcii). Inak vznikal nezmyselný H2 "Spracoval: Orgoň".
      if (/^(foto|zdroj|prameň|spracoval|autor|prebral|prevzaté)\s*:/i.test(t)) continue;
      // Numbered section: "2. Nitra - Martinský vrch" → heading
      const isNumberedSection = /^\d{1,2}\.\s+[A-ZÁÄČĎÉÍĽĹŇÓÔŠŤÚÝŽ]/.test(t);
      const words = t.split(/\s+/).filter(Boolean);
      if (!isNumberedSection) {
        if (words.length === 0 || words.length > 7) continue;
        if (!/^[A-ZÁÄČĎÉÍĽĹŇÓÔŠŤÚÝŽ]/.test(t)) continue;
        if (/[.!?,;]\s*$/.test(t)) continue;
      }
      node.type = 'heading';
      node.level = 2;
    }
  }
  return blocks;
}

function mergeConsecutiveQuotes(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  const result = [];
  // Krátke verše typu Sládkovičovho "Nitra, milá Nitra..." majú < 120 chars/riadok.
  // Prozaické citácie (napr. spis "Keď sa však medzitým...") sú podstatne dlhšie.
  // Spájame len ak OBA susedné quotes sú krátke — inak sa môžu dva nezávislé
  // citátne bloky pomerne v texte zlúčiť do jedného.
  const SHORT_VERSE_MAX = 120;
  for (const b of blocks) {
    const prev = result[result.length - 1];
    if (
      b?.__component === 'content.quote-block' &&
      prev?.__component === 'content.quote-block' &&
      b.text.length <= SHORT_VERSE_MAX &&
      prev.text.split('\n').every((line) => line.length <= SHORT_VERSE_MAX)
    ) {
      prev.text = `${prev.text}\n${b.text}`;
      continue;
    }
    result.push(b);
  }
  return result;
}

function splitLongParagraphsBySectionHeaders(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  const HEADER_RE = /(?:^|\n|\s)(\d{1,2}\.\s*[A-ZÁÄČĎÉÍĽĹŇÓÔŠŤÚÝŽ][^\n]{2,60})/g;
  const result = [];
  for (const b of blocks) {
    if (b?.__component !== 'content.rich-text' || !Array.isArray(b.body)) {
      result.push(b);
      continue;
    }
    let split = false;
    const newBodyChunks = [];
    for (const node of b.body) {
      if (node.type !== 'paragraph' || !Array.isArray(node.children)) {
        newBodyChunks.push([node]);
        continue;
      }
      const firstChild = node.children[0];
      if (firstChild?.type !== 'text' || typeof firstChild.text !== 'string') {
        newBodyChunks.push([node]);
        continue;
      }
      const fullText = firstChild.text;
      if (fullText.length < 100) {
        newBodyChunks.push([node]);
        continue;
      }
      const matches = [];
      HEADER_RE.lastIndex = 0;
      let m;
      while ((m = HEADER_RE.exec(fullText)) !== null) {
        matches.push({ idx: m.index + (m[0].length - m[1].length), text: m[1].trim() });
      }
      if (matches.length === 0) {
        newBodyChunks.push([node]);
        continue;
      }
      split = true;
      let cursor = 0;
      for (const mt of matches) {
        const before = fullText.slice(cursor, mt.idx).trim();
        if (before) {
          newBodyChunks.push([
            { type: 'paragraph', children: [{ type: 'text', text: before }, ...node.children.slice(1)] },
          ]);
        }
        const headerEnd = mt.idx + mt.text.length;
        newBodyChunks.push([
          { type: 'heading', level: 2, children: [{ type: 'text', text: mt.text }] },
        ]);
        cursor = headerEnd;
        node.children = []; // consume residual children for first segment
      }
      const after = fullText.slice(cursor).trim();
      if (after) {
        newBodyChunks.push([{ type: 'paragraph', children: [{ type: 'text', text: after }] }]);
      }
    }
    if (!split) {
      result.push(b);
    } else {
      for (const chunk of newBodyChunks) {
        result.push({ __component: 'content.rich-text', body: chunk });
      }
    }
  }
  return result;
}

function removeMapsExpandLinks(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  for (const blk of blocks) {
    if (blk?.__component !== 'content.rich-text') continue;
    if (!Array.isArray(blk.body)) continue;
    for (const node of blk.body) {
      if (!Array.isArray(node.children)) continue;
      node.children = node.children.filter((c) => {
        if (c?.type !== 'link') return true;
        if (!c.url) return true;
        return !/maps\.google\.[a-z.]+/i.test(c.url);
      });
      if (node.children[0]?.type === 'text' && typeof node.children[0].text === 'string') {
        node.children[0].text = node.children[0].text.replace(/^[\s\n ]+/, '');
      }
    }
  }
  return blocks;
}

function pairAdjacentImages(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i];
    const b = blocks[i + 1];
    if (a?.__component !== 'content.image-block') continue;
    if (b?.__component !== 'content.image-block') continue;
    const pa = a.position;
    const pb = b.position;
    if ((pa === 'left' && pb === 'right') || (pa === 'right' && pb === 'left')) {
      a.pairWithNext = true;
    }
  }
  return blocks;
}

function reorderHeadingBeforeImage(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  const result = [];
  let i = 0;
  while (i < blocks.length) {
    const cur = blocks[i];
    const next = blocks[i + 1];
    const isHeadingBlock =
      cur?.__component === 'content.rich-text' &&
      Array.isArray(cur.body) &&
      cur.body.length === 1 &&
      cur.body[0]?.type === 'heading';
    const isImageBlock = next?.__component === 'content.image-block';
    if (isHeadingBlock && isImageBlock) {
      result.push(next);
      result.push(cur);
      i += 2;
    } else {
      result.push(cur);
      i += 1;
    }
  }
  return result;
}

function cleanupOrphanChildren(blocks) {
  if (!Array.isArray(blocks)) return blocks;
  const ORPHAN_RE = /^[ \s.,;:\-_]*$/;
  for (const blk of blocks) {
    if (blk?.__component !== 'content.rich-text') continue;
    if (!Array.isArray(blk.body)) continue;
    for (const node of blk.body) {
      if (!Array.isArray(node.children)) continue;
      node.children = node.children.filter((c) => {
        if (c?.type !== 'text') return true;
        return !ORPHAN_RE.test(c.text || '');
      });
    }
    blk.body = blk.body.filter((node) => {
      if (!Array.isArray(node.children)) return true;
      return node.children.length > 0;
    });
  }
  return blocks;
}

/** Z Blogger `<a href=".../sN/file.jpg">` URL spraví variant pre dané `sN`. */
function rewriteSizeVariant(url, size) {
  return url.replace(/\/s\d+(?:-\w)?\//, `/s${size}/`);
}

function filenameFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || 'image');
  } catch {
    return 'image';
  }
}

/** Pripraví dvojicu URL: preferovaná /s0/ (originál) + fallback /s1600/.
 *  Skutočná validácia (HEAD request, fallback ak 404 / identický súbor) je Fáza 2.
 *  Plus zachová ak Blogger poskytol `data-original-width/height` — tie sú reálne
 *  rozmery originálu (nie thumbnail), používame ich na klasifikáciu hi-res. */
function buildImageRef(anchorHref, displayedWidth, displayedHeight, originalWidth, originalHeight) {
  const sourceUrl = rewriteSizeVariant(anchorHref, 0);
  const fallbackUrl = rewriteSizeVariant(anchorHref, 1600);
  return {
    sourceUrl,
    fallbackUrl,
    filename: filenameFromUrl(anchorHref),
    blogger: {
      anchorHref,
      displayedWidth: displayedWidth ? Number(displayedWidth) : null,
      displayedHeight: displayedHeight ? Number(displayedHeight) : null,
      originalWidth: originalWidth ? Number(originalWidth) : null,
      originalHeight: originalHeight ? Number(originalHeight) : null,
    },
  };
}

/** Z `<iframe src="...ll=LAT,LNG...">` vytiahne súradnice. */
function extractLatLng(iframeSrc) {
  if (!iframeSrc) return null;
  // Blogger ukladá &amp; — cheerio nám vráti dekódovanú formu, ale pre istotu:
  const decoded = iframeSrc.replace(/&amp;/g, '&');
  const m = decoded.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!m) return null;
  return { latitude: parseFloat(m[1]), longitude: parseFloat(m[2]) };
}

/** Najjednoduchšia heuristika: rozozná holú URL ako jediný (alebo dominantný)
 *  textový obsah uzla. */
function isBareUrlText(text) {
  if (!text) return false;
  const trimmed = text.trim();
  return /^https?:\/\/\S+\s*$/i.test(trimmed);
}

/** Detekcia začiatku sekcie "Zdroje" v sérii top-level divov.
 *  V tomto blogu chýba explicitný `<h2>Zdroje</h2>`, takže používame heuristiku:
 *  prvý div po hlavnom tele, ktorý:
 *    - má bold uvedenie "Preložili sme..." (typický prechod do citácií), alebo
 *    - obsahuje len holú URL ako text, alebo
 *    - obsahuje len `<a>` na interný hradiska.sk článok (label/search) bez okolitého textu. */
function isLikelySourcesStart(node, $) {
  const $n = $(node);
  const html = $n.html() || '';
  const text = $n.text().replace(/[ \s]+/g, ' ').trim();

  // 1) Bold uvedenie "Preložili sme"
  if (/<b[^>]*>[^<]*Preložili sme[^<]*<\/b>/i.test(html)) return true;

  // 1b) Slovenský/český explicit marker "zdroj:" / "zdroje:" / "pramene:" / "literatúra:"
  //     (autor použil `<i>` formátovanie). Aplikujeme aj keď nie je bold.
  if (/(^|\s)(zdroj[ey]?|pramen[ey]?|literat[uú]ra)\s*:/i.test(text)) return true;

  // 2) Holá URL ako text (jediný riadok bez `<a>` wrap)
  if (isBareUrlText(text) && $n.find('a').length === 0) return true;

  // 3) Krátky div s jedným `<a href="http://www.hradiska.sk/...">` interný link na
  //    ďalší článok (label/search) BEZ ďalšieho odstavcového textu
  const anchors = $n.find('a');
  if (
    anchors.length >= 1 &&
    text.length < 200 &&
    [...anchors].every((a) => /(\/search\/label\/|hradiska\.sk\/\d{4}\/)/.test($(a).attr('href') || ''))
  ) {
    return true;
  }

  return false;
}

// -----------------------------------------------------------------------------
// HTML → Strapi blocks: konverzia bežného textu
// -----------------------------------------------------------------------------

/**
 * Strapi `blocks` editor JSON má jednoduchú stromovú štruktúru:
 *   paragraph: { type: 'paragraph', children: [{ type: 'text', text, bold?, italic?, ... }] }
 *   heading:   { type: 'heading', level: 2, children: [...] }
 *   link:      { type: 'link', url, children: [{ type: 'text', text }] }
 *
 * Tu konvertujeme inline obsah (`<b>`, `<i>`, `<a>`) v rámci jedného odstavca.
 */
function inlineChildren($, node) {
  const out = [];
  $(node)
    .contents()
    .each((_, n) => {
      if (n.type === 'text') {
        const text = n.data.replace(/[ \s]+/g, ' ');
        if (text) out.push({ type: 'text', text });
      } else if (n.type === 'tag') {
        const tag = n.tagName.toLowerCase();
        if (tag === 'br') {
          out.push({ type: 'text', text: '\n' });
        } else if (tag === 'b' || tag === 'strong') {
          for (const c of inlineChildren($, n)) {
            out.push({ ...c, bold: true });
          }
        } else if (tag === 'i' || tag === 'em') {
          for (const c of inlineChildren($, n)) {
            out.push({ ...c, italic: true });
          }
        } else if (tag === 'a') {
          const href = $(n).attr('href') || '';
          const innerText = $(n).text().replace(/[ \s]+/g, ' ').trim();
          out.push({
            type: 'link',
            url: href,
            children: [{ type: 'text', text: innerText }],
          });
        } else {
          // span, font, ... — strip wrapper, prejdi dovnútra
          for (const c of inlineChildren($, n)) out.push(c);
        }
      }
    });
  // Compactuj prázdne text uzly + spoj susediace plain texty
  const compact = [];
  for (const c of out) {
    if (
      c.type === 'text' &&
      compact.length &&
      compact[compact.length - 1].type === 'text' &&
      !c.bold === !compact[compact.length - 1].bold &&
      !c.italic === !compact[compact.length - 1].italic
    ) {
      compact[compact.length - 1].text += c.text;
    } else if (c.type === 'text' && !c.text) {
      // skip prázdne
    } else {
      compact.push(c);
    }
  }
  return compact;
}

/** Vyhodnotí čistý text odstavca (na detekciu prázdnych divov). */
function plainText($, node) {
  return $(node).text().replace(/[ \s]+/g, ' ').trim();
}

/** Z iframe `src` vytvorí content.embed blok (YouTube/Vimeo/Sketchfab) alebo null.
 *  BUG 5: parser predtým embed negeneroval — non-map iframy sa ticho zahadzovali
 *  (Velehradovo video sa stratilo; Wogastisburgov embed bol pridaný ručne). */
function embedFromIframeSrc(src) {
  if (!src) return null;
  let m;
  if ((m = src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/i)) ||
      (m = src.match(/youtu\.be\/([\w-]+)/i))) {
    return { __component: 'content.embed', provider: 'youtube', embedId: m[1],
      url: `https://www.youtube.com/embed/${m[1]}`, caption: '' };
  }
  if ((m = src.match(/player\.vimeo\.com\/video\/(\d+)/i))) {
    return { __component: 'content.embed', provider: 'vimeo', embedId: m[1],
      url: `https://player.vimeo.com/video/${m[1]}`, caption: '' };
  }
  if ((m = src.match(/sketchfab\.com\/(?:models|3d-models)\/(?:[\w-]*-)?([0-9a-f]{12,})\/embed/i)) ||
      (m = src.match(/sketchfab\.com\/models\/([\w-]+)\/embed/i))) {
    return { __component: 'content.embed', provider: 'sketchfab', embedId: m[1],
      url: src.split('?')[0], caption: '' };
  }
  return null;
}

// -----------------------------------------------------------------------------
// Hlavná konverzia divov na bloky dynamic zone
// -----------------------------------------------------------------------------

// ----- BÁSNE (content.poem) — detekcia behu centrovaných kurzívových veršov -----
// Klasifikuj centrovaný div: {verse} (kurzíva, bez obrázka) / {empty} (predel strofy) / null.
function poemVerseInfo($, el) {
  if (!el || el.type !== 'tag' || (el.tagName || '').toLowerCase() !== 'div') return null;
  const $e = $(el);
  if (!/text-align:\s*center/i.test($e.attr('style') || '')) return null;
  if ($e.find('img').length) return null;                 // obrázok, nie verš
  const t = $e.text().replace(/[  \s]+/g, ' ').trim();
  if (!t) return { empty: true };                          // prázdny centrovaný div = predel strofy
  if (!$e.find('i, em').length) return null;               // centrovaný text bez kurzívy = nie verš
  // verš = kurzívový obsah (vylúči napr. „Zväčšiť mapu" z <a>, ktoré bleeduje do 1. verša)
  const verse = $e.find('i, em').map((_, x) => $(x).text()).get().join(' ').replace(/[  \s]+/g, ' ').trim();
  return { verse: verse || t };
}

// Pre-pass: v dokumentovom poradí nájdi behy veršov a označ ich v DOM (data-poem na 1. verši,
// data-poem-skip na ostatných). Beh = súvislé verše + prázdne centr. divy (predel strofy);
// próza/obrázok/tabuľka beh PRERUŠIA (tým sa 2 vzdialené básne prirodzene oddelia). Beh s
// jediným veršom → NIE báseň (flag na kontrolu, spracuje sa normálne).
function markPoemRuns($, root, meta) {
  const seq = [];
  (function walk(node) {
    $(node).contents().each((_, ch) => {
      if (ch.type === 'text') { if (ch.data.replace(/\s+/g, '')) seq.push({ kind: 'X' }); return; }
      if (ch.type !== 'tag') return;
      const info = poemVerseInfo($, ch);
      if (info && info.verse) { seq.push({ el: ch, kind: 'V', text: info.verse }); return; }
      if (info && info.empty) { seq.push({ el: ch, kind: '_' }); return; }
      const tag = (ch.tagName || '').toLowerCase();
      if (tag === 'br') return;                                    // riadkový zlom medzi veršami — NEpretrhne beh
      if (tag === 'img' || tag === 'table' || tag === 'iframe') { seq.push({ kind: 'X' }); return; }
      // wrapper s vnorenými veršami → rekurzia
      if ($(ch).find('div[style*="center"] i, div[style*="center"] em').length) { walk(ch); return; }
      // prázdny inline/element (napr. <i></i> medzi veršami) → NEpretrhne; reálny text = zlom
      if (!$(ch).text().replace(/\s+/g, '')) return;
      seq.push({ kind: 'X' });
    });
  })(root);
  let i = 0;
  while (i < seq.length) {
    if (seq[i].kind !== 'V') { i++; continue; }
    let j = i, verses = 0;
    while (j < seq.length && (seq[j].kind === 'V' || seq[j].kind === '_')) { if (seq[j].kind === 'V') verses++; j++; }
    const run = seq.slice(i, j);
    if (verses >= 2) {
      const lines = [];
      for (const r of run) {
        if (r.kind === 'V') lines.push(r.text);
        else if (lines.length && lines[lines.length - 1] !== '') lines.push(''); // predel strofy
      }
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      const text = lines.join('\n').replace(/\n{3,}/g, '\n\n');
      const els = run.filter((r) => r.el).map((r) => r.el);
      $(els[0]).attr('data-poem', encodeURIComponent(text));
      for (let k = 1; k < els.length; k++) $(els[k]).attr('data-poem-skip', '1');
      meta.poemCount = (meta.poemCount || 0) + 1;
    } else {
      const v = run.find((r) => r.kind === 'V');
      (meta.poemSingleFlags = meta.poemSingleFlags || []).push((v && v.text || '').slice(0, 60));
    }
    i = j;
  }
}

// Prevedie nazbierané inline uzly na rich-text odseky (rovnaká logika ako pôvodný
// step 5): kompaktuje susedné texty, orezáva nábehový whitespace, delí podľa \n\n.
function flushInlineBuf(buf, blocks, opts) {
  if (!buf.length) return;
  const compact = [];
  for (const c of buf) {
    const last = compact[compact.length - 1];
    if (c.type === 'text' && last && last.type === 'text' && !c.bold === !last.bold && !c.italic === !last.italic) {
      last.text += c.text;
    } else if (c.type === 'text' && !c.text) {
      // skip prázdne
    } else {
      compact.push({ ...c });
    }
  }
  const paragraphs = splitInlineByDoubleNewline(compact, opts.singleSplit);
  for (const para of paragraphs) {
    if (para.length === 0) continue;
    if (para[0].type === 'text') {
      para[0].text = normalizeLeading(para[0].text);
      if (!para[0].text) para.shift();
    }
    if (para.length === 0) continue;
    blocks.push({ __component: 'content.rich-text', body: [{ type: 'paragraph', children: para }] });
  }
  buf.length = 0;
}

// Dĺžka textu v rich-text bloku — na výpočet rytmu (obrázok v tele podľa objemu textu).
function richTextLength(b) {
  let n = 0;
  for (const node of b.body || []) for (const c of node.children || []) n += (c.text || '').length;
  return n;
}

// Rozpozná Sketchfab/oEmbed fallback-attribution <div> (model/autor/platforma odkazy,
// vždy s `utm_medium=embed` v href) — generuje ho platforma automaticky pod každý
// embed, nie je to autorský obsah článku. Aspoň 1 odkaz musí smerovať na sketchfab.com
// s embed-campaign parametrom a v dive nesmie byť žiadny iný, substantívny text.
function isEmbedAttributionDiv($, el) {
  if (!el || el.type !== 'tag' || (el.tagName || '').toLowerCase() !== 'div') return false;
  const $el = $(el);
  const allLinks = $el.find('a');
  const embedLinks = $el.find('a[href*="sketchfab.com"][href*="utm_medium=embed"]');
  if (embedLinks.length === 0 || allLinks.length !== embedLinks.length) return false; // musí mať aspoň 1 embed-link a ŽIADNE iné odkazy
  let residual = $el.text().replace(/[ \s]+/g, ' ').trim();
  // Odstráň text KAŽDÉHO odkazu jednotlivo (concat linkText nie je substring wholeText,
  // lebo medzi odkazmi je "by"/"on" — nemôžeme odčítať naraz).
  embedLinks.each((_, a) => {
    const t = $(a).text().replace(/[ \s]+/g, ' ').trim();
    if (t) residual = residual.replace(t, '');
  });
  residual = residual.replace(/\b(by|on)\b/gi, '').replace(/[ \s]+/g, '').trim();
  return residual.length < 5; // len spojky "by"/"on" zvyšné, žiadny reálny text
}

// Prejde potomkov `node` v DOKUMENTOVOM PORADÍ a vydáva bloky: nazbieraný inline text
// sa flushne ako odsek(y) vždy keď narazíme na blokový obrázok/embed → obrázky ostanú
// medzi textom presne tam, kde boli v origináli (žiadne front-loading obrázkov).
function walkDocOrder($, node, ctx, blocks, buf, opts) {
  $(node).contents().each((_, ch) => {
    if (ch.type === 'text') {
      const text = ch.data.replace(/[ \s]+/g, ' ');
      if (text) buf.push({ type: 'text', text });
      return;
    }
    if (ch.type !== 'tag') return;
    const tag = ch.tagName.toLowerCase();
    const $ch = $(ch);
    // Báseň (pre-pass označil beh veršov): prvý verš → content.poem, ostatné → preskoč.
    if (ch.attribs && ch.attribs['data-poem'] != null) {
      flushInlineBuf(buf, blocks, opts);
      blocks.push({ __component: 'content.poem', text: decodeURIComponent(ch.attribs['data-poem']), title: null, author: null, source: null });
      return;
    }
    if (ch.attribs && ch.attribs['data-poem-skip'] != null) return;
    if (tag === 'br') { buf.push({ type: 'text', text: '\n' }); return; }
    // Blokový obrázok / embed → flush textu, potom vydaj blok na jeho pozícii.
    if (tag === 'table' && $ch.hasClass('tr-caption-container')) {
      flushInlineBuf(buf, blocks, opts);
      const b = imageBlockFromTrCaption($, ch, ctx);
      if (b) blocks.push(b);
      return;
    }
    if (tag === 'div' && $ch.hasClass('separator') && $ch.find('img').length) {
      flushInlineBuf(buf, blocks, opts);
      for (const a of $ch.find('a:has(img)').toArray()) {
        const b = imageBlockFromSeparator($, a, ctx);
        if (b) blocks.push(b);
      }
      return;
    }
    if (tag === 'iframe') {
      const src = $ch.attr('src') || '';
      if (!/maps\.google\.com/.test(src)) {
        const e = embedFromIframeSrc(src);
        if (e) { flushInlineBuf(buf, blocks, opts); blocks.push(e); }
      }
      return;
    }
    // Inline formátovanie → do bufferu.
    if (tag === 'b' || tag === 'strong') { for (const c of inlineChildren($, ch)) buf.push({ ...c, bold: true }); return; }
    if (tag === 'i' || tag === 'em') { for (const c of inlineChildren($, ch)) buf.push({ ...c, italic: true }); return; }
    if (tag === 'a') {
      buf.push({ type: 'link', url: $ch.attr('href') || '', children: [{ type: 'text', text: $ch.text().replace(/[ \s]+/g, ' ').trim() }] });
      return;
    }
    // Podstrom obsahujúci blokové obrázky/embed → rekurzia (interleave text↔obrázok).
    if ($ch.find('table.tr-caption-container, div.separator, iframe').length > 0) {
      walkDocOrder($, ch, ctx, blocks, buf, opts);
      return;
    }
    // Sketchfab (a podobné oEmbed platformy) generujú pod <iframe> vždy sprievodný
    // fallback-attribution <div> s odkazmi na model/autora/platformu (utm_medium=embed
    // v každom href). Bez tohto filtra sa jeho text vytrhne z kontextu a objaví sa v tele
    // ako 3 nelogické riadky "Hradisko Zobor…" / "by Pamiatkovy_Urad_SR" / "on Sketchfab".
    if (isEmbedAttributionDiv($, ch)) return;
    // Ostatné (div/p/span/font bez obrázkov) → inline obsah do bufferu (ako inlineChildren).
    for (const c of inlineChildren($, ch)) buf.push(c);
  });
}

function convertDivToBlocks($, div, ctx, opts = {}) {
  const blocks = [];

  // Báseň (pre-pass): top-level verš-div označený data-poem → content.poem; skip → nič.
  if (div && div.attribs) {
    if (div.attribs['data-poem'] != null) {
      return [{ __component: 'content.poem', text: decodeURIComponent(div.attribs['data-poem']), title: null, author: null, source: null }];
    }
    if (div.attribs['data-poem-skip'] != null) return blocks;
  }

  // Edge case: top-level `el` môže byť priamo `<table.tr-caption-container>`
  // (nie `<div>`). Spracuj ho samostatne ako single image-block.
  if (div?.tagName?.toLowerCase?.() === 'table') {
    const block = imageBlockFromTrCaption($, div, ctx);
    if (block) blocks.push(block);
    return blocks;
  }

  // Obrázky (tr-caption tabuľky, separator divy), embed (non-map iframe) a text sa
  // vydávajú v DOKUMENTOVOM PORADÍ cez walkDocOrder (nižšie, krok 5) — už žiadne
  // front-loading obrázkov pred text. Google Maps iframe walkDocOrder ticho preskočí.

  // 4) Bold-only div = medzinadpis H2 (alebo dobový citát, ak má aj kurzívu — viď nižšie)
  //    Test: div obsahuje práve jeden <b> a žiadny iný inline text okolo.
  //    `> i > b` chytá aj opačné poradie vnorenia `<i><b>text</b></i>` (Wogastisburg:
  //    Fredegarova kronika mala kurzívu vonku, bold vnútri — pôvodný selektor
  //    `> b, > div > b` to nenašiel, citát ostal ako obyčajný rich-text odsek).
  const bs = $(div).find('> b, > div > b, > i > b').toArray();
  if (bs.length === 1) {
    const bText = $(bs[0]).text().replace(/[ \s]+/g, ' ').trim();
    const wholeText = plainText($, div);
    if (bText && bText === wholeText) {
      const bElem = bs[0];
      const hasItalic = $(bElem).find('i').length > 0 || $(bElem).parent('i').length > 0;
      const hasQuotes = /["„""''»«]/.test(bText);
      const isLong = bText.length >= 50;
      const isNumberedSection = /^\d{1,2}\.\s+\S/.test(bText);
      // BUG 4: bold atribučný riadok ("Foto: …", "Spracoval: …") nie je nadpis —
      // necháme prepadnúť na step 5 (bežný odsek). Pre Velehrad/Wogastisburg sú tieto
      // riadky plain-text (rieši ich convertShortParagraphsToHeadings), tu je to len
      // poistka pre prípadné bold varianty v ďalších článkoch.
      const isAttribution = /^(foto|zdroj|prameň|spracoval|autor|prebral|prevzaté)\s*:/i.test(bText);
      // Numbered section "1. Nitra - hrad" → heading (aj keď má italic)
      if (isNumberedSection && bText.length < 80) {
        blocks.push({
          __component: 'content.rich-text',
          body: [{ type: 'heading', level: 2, children: [{ type: 'text', text: bText }] }],
        });
        return blocks;
      }
      if (hasItalic && (isLong || hasQuotes)) {
        blocks.push({
          __component: 'content.quote-block',
          text: bText,
        });
        return blocks;
      }
      if (!isAttribution && bText.length < 80) {
        blocks.push({
          __component: 'content.rich-text',
          body: [{ type: 'heading', level: 2, children: [{ type: 'text', text: bText }] }],
        });
        return blocks;
      }
    }
  }

  // 4.5) Nested quote divs — `<div><b><i>text</i></b></div>` blocks inside parent div.
  //      Typický pattern: Blogger autor vloží 4 verše ako 4 samostatné `<div>` s
  //      `<b><i>` vnútri. Extrahujeme ich PRED step 5 (inline paragraph) aby sa
  //      nezlúčili s okolitým textom. `mergeConsecutiveQuotes` ich potom spojí
  //      do jednej viacriadkovej citácie.
  const quoteDivs = $(div).find('div').toArray();
  const extractedQuotes = [];
  for (const nd of quoteDivs) {
    const $nd = $(nd);
    // Blogger autor vnára bold+italic v OBOCH poradiach — `<b><i>text</i></b>` aj
    // `<i><b>text</b></i>` (Wogastisburg: Fredegarova kronika mala kurzívu vonku).
    let directBs = $nd.children('b').toArray();
    let innerTag = 'i';
    if (directBs.length !== 1) { directBs = $nd.children('i').toArray(); innerTag = 'b'; }
    if (directBs.length !== 1) continue;
    const $b = $(directBs[0]);
    const bText = $b.text().replace(/[  \s]+/g, ' ').trim();
    const ndText = plainText($, nd);
    if (!bText || bText !== ndText) continue;
    const hasItalicInside = $b.find(innerTag).length > 0;
    if (!hasItalicInside) continue;
    // Skip krátky text (heading-like, < 20 chars) — heading detection ich rieši inde
    if (bText.length < 20) continue;
    // Skip numbered section headings ("2. Nitra - Martinský vrch") — to nie sú
    // citácie. Necháme ich pre step 5 paragraph processing; post-cleanup pass
    // `convertShortParagraphsToHeadings` ich neskôr konvertuje na heading
    // (rozšírené pravidlo chytá aj `^\d+\.\s+`).
    if (/^\d{1,2}\.\s+\S/.test(bText)) continue;
    extractedQuotes.push({ elem: nd, text: bText });
  }
  for (const qc of extractedQuotes) {
    blocks.push({
      __component: 'content.quote-block',
      text: qc.text,
    });
    $(qc.elem).remove();
  }

  // 5) Obrázky + embed + text v dokumentovom poradí. walkDocOrder prejde potomkov
  //    divu; nazbieraný inline text flushne ako odsek(y) vždy keď narazí na blokový
  //    obrázok/embed, takže obrázok ostane medzi textom presne na svojej pozícii.
  //    Blogger vnára `<div.separator>`, `<table>` aj plain text do jedného divu —
  //    predtým sa obrázky vysypali pred text (front-loading), teraz sú interleaved.
  const buf = [];
  walkDocOrder($, div, ctx, blocks, buf, opts);
  flushInlineBuf(buf, blocks, opts);

  return blocks;
}

/** Rozdelí pole inline detí na viac odstavcov tam, kde je dvojitý zalomenie.
 *  Ak `singleSplit=true`, delí aj na single `\n` (jeden `<br/>`). Používa sa pre
 *  Blogger divs ktoré majú zmes body+zdroje a paragraph break je `<br/>`, nie `<br/><br/>`. */
function splitInlineByDoubleNewline(children, singleSplit = false) {
  const splitRe = singleSplit ? /\n+/ : /\n\n+/;
  const paras = [[]];
  for (const c of children) {
    if (c.type === 'text' && splitRe.test(c.text)) {
      const parts = c.text.split(splitRe);
      parts.forEach((p, i) => {
        if (i > 0) paras.push([]);
        if (p) paras[paras.length - 1].push({ ...c, text: p });
      });
    } else {
      paras[paras.length - 1].push(c);
    }
  }
  return paras.filter((p) => p.some((c) => c.type !== 'text' || c.text.trim()));
}

/** Klasifikuje obrázok podľa aspect ratio a rozhodne layout.
 *
 *  Cieľ: `position: 'full'` má zmysel LEN pre širokouhlé hi-res obrázky (panoramatický
 *  pohľad na lokalitu, plánik celého hradiska). Bežný portrét má ísť ako side-float
 *  aby text obtekal, štvorec môže byť stredný 50%.
 *
 *  hi-res prahy: original ≥ 1200px v ľubovoľnom rozmere. Bez originálnych rozmerov
 *  (staršie Bloggery to neuvádzajú v <img data-original-*>) konzervatívne vyberieme
 *  non-full layout.
 */
/** ŽIADNE full-width obrázky — vždy side-float left/right alebo center pri 40-60%.
 *  User rozhodnutie: full position vyzerá zle, treba aby text vždy obtekal alebo
 *  zostal dýchať okolo. Rotácia preferuje **right/left** pre vizuálnu variabilitu;
 *  center je výnimočný a používa sa najmä pre wide aspect kde left/right by orezalo. */
function pickLayoutForCaptioned(idx, ref) {
  const ow = ref.blogger?.originalWidth;
  const oh = ref.blogger?.originalHeight;
  const dw = ref.blogger?.displayedWidth;
  const dh = ref.blogger?.displayedHeight;
  const w = ow || dw || 0;
  const h = oh || dh || 0;
  const aspect = w && h ? w / h : 1;

  let category;
  if (aspect >= 1.6) category = 'wide';            // 16:9 a širšie
  else if (aspect >= 1.2) category = 'landscape';  // 4:3, 3:2
  else if (aspect >= 0.85) category = 'square';    // ~1:1
  else category = 'portrait';                       // na výšku

  // Width: schema enum dovoľuje len [30, 40, 50, 60, 100]. 100 nepoužívame (full preč),
  // 30 je príliš úzke pre niečo s caption — pohybujeme sa medzi 40/50/60.
  switch (category) {
    case 'wide': {
      const cycle = [
        { position: 'center', width: '60' },
        { position: 'right', width: '60' },
        { position: 'left', width: '60' },
      ];
      return cycle[idx % cycle.length];
    }
    case 'landscape': {
      // Preferencia right/left (text obteká), center len výnimočne pre vzdušnosť
      const cycle = [
        { position: 'right', width: '50' },
        { position: 'left', width: '50' },
        { position: 'right', width: '40' },
        { position: 'left', width: '40' },
        { position: 'center', width: '60' },
      ];
      return cycle[idx % cycle.length];
    }
    case 'square': {
      const cycle = [
        { position: 'right', width: '40' },
        { position: 'left', width: '40' },
        { position: 'right', width: '50' },
        { position: 'left', width: '50' },
      ];
      return cycle[idx % cycle.length];
    }
    case 'portrait': {
      // Portrét vždy side-float — max 40% aby text mal dosť priestoru
      return idx % 2 === 0
        ? { position: 'right', width: '40' }
        : { position: 'left', width: '40' };
    }
  }
}

function imageBlockFromTrCaption($, table, ctx) {
  const $a = $(table).find('a[href]').first();
  const href = $a.attr('href') || '';
  if (!href) return null;
  const $img = $a.find('img').first();
  const captionEl = $(table).find('td.tr-caption').first();
  const caption = captionEl.text().replace(/[ \s]+/g, ' ').trim() || '';
  const ref = buildImageRef(
    href,
    $img.attr('width'),
    $img.attr('height'),
    $img.attr('data-original-width'),
    $img.attr('data-original-height'),
  );
  const layout = pickLayoutForCaptioned(ctx.captionedIdx++, ref);
  return {
    __component: 'content.image-block',
    imageRef: ref,
    // alt: caption má prioritu (popis = najlepší alt); inak fallback článok title
    // (Strapi schema vyžaduje alt required — prázdny string blokuje publish).
    // `caption` má schema limit 500 zn., ale `alt` len 255 — dlhší caption (autorská
    // poznámka, nie krátky popis) by inak zhodil celý POST/PUT s ValidationError.
    alt: (caption || ctx.articleTitle || 'Obrázok').slice(0, 255),
    caption,
    position: layout.position,
    showCaption: Boolean(caption),
    width: layout.width,
    aspectRatio: 'auto',
    rounded: true,
    shadow: true,
  };
}

function imageBlockFromSeparator($, anchor, ctx) {
  const href = $(anchor).attr('href') || '';
  if (!href) return null;
  const $img = $(anchor).find('img').first();
  const ref = buildImageRef(
    href,
    $img.attr('width'),
    $img.attr('height'),
    $img.attr('data-original-width'),
    $img.attr('data-original-height'),
  );
  // Aj no-caption obrázky používajú aspect-aware rotáciu (right/left/center 40-60),
  // nie natvrdo `center 60`. Predtým to vyzeralo ako stĺpec full-width obrázkov.
  // Counter `ctx.captionedIdx` je zdieľaný — captioned + no-caption majú spoločný cycle.
  const layout = pickLayoutForCaptioned(ctx.captionedIdx++, ref);
  return {
    __component: 'content.image-block',
    imageRef: ref,
    // No-caption obrázok stále musí mať alt (Strapi required). Použijeme article title.
    alt: ctx.articleTitle || 'Obrázok',
    caption: '',
    position: layout.position,
    showCaption: false,
    width: layout.width,
    aspectRatio: 'auto',
    rounded: true,
    shadow: true,
  };
}

// -----------------------------------------------------------------------------
// Orchestrátor + zdroje helpers
// -----------------------------------------------------------------------------

/** Detekuje vnútri divu line-index, na ktorom sa začínajú zdroje. -1 ak nič.
 *  Markery: "Preložili sme", explicit slovenské "zdroj:" / "zdroje:" / "pramene:" / "literatúra:",
 *  holá URL ako jediný riadkový text, internal hradiska.sk/search/label/ alebo /YYYY/ anchory,
 *  a (ak opts.allowAttributionStart) trailing atribučný riadok "Spracoval:/Foto:/Autor:".
 *  @param {{allowAttributionStart?: boolean}} [opts] */
function findInternalSourcesSplit(lines, opts = {}) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasBold = line.some(
      (s) => s.type === 'bold-text' && /Preložili sme/i.test(s.text),
    );
    if (hasBold) return i;

    // Slovenský explicit marker: "zdroj:", "zdroje:", "pramene:", "literatúra:", "foto:"
    // alebo český "zdroj:" / "literatura:".
    const lineText = line
      .filter((s) => s.type === 'text' || s.type === 'bold-text')
      .map((s) => s.text)
      .join(' ');
    if (/^\s*(zdroj[ey]?|pramen[ey]?|literat[uú]ra|references?)\s*:/i.test(lineText)) {
      return i;
    }
    // Atribučný marker: "Spracoval:", "Autor(i):", "Prebral:", "Prevzaté:", "Foto:".
    // Systémový vzor — trailing atribúcia ktorá uvádza sekciu zdrojov. Starý parser
    // ju nechával v tele ako holý odsek (Wogastisburg "Spracoval: Orgoň") alebo H2.
    // GATED pozíciou (opts.allowAttributionStart = len druhá polovica top-level divov),
    // lebo mid-article "Foto:" býva popis obrázka a nesmie predčasne odseknúť telo.
    if (opts.allowAttributionStart &&
        /^\s*(spracoval|autori?|prebral|prevzat[éy]|foto)\s*:/i.test(lineText)) {
      return i;
    }
    // Fráza presunu zdroja: "(článok) prevzatý/prevzaté z …", "preložené z …".
    // ÚZKE: vyžaduje "prevzat* z" / "preložené z" — nie holé "prevzat" (to chytá aj
    // bežný text). Overené: vyskytuje sa iba v Staré Město - Velehrad, nie vo
    // Wogastisburgu/Blatnohrade/Mikulčiciach (žiadna regresia ich split-pointu).
    if (/\b(?:[čc]l[áa]nok\s+)?prevzat[ýáé]\s+z\b|\bprelo[žz]en[éeý]\s+z\b/i.test(lineText)) {
      return i;
    }
    const textOnly = stripNbspWs(line
      .filter((s) => s.type === 'text')
      .map((s) => s.text)
      .join(' '));
    const onlyUrlText =
      /^https?:\/\/\S+$/i.test(textOnly) &&
      !line.some((s) => s.type === 'anchor' || s.type === 'bold-text');
    if (onlyUrlText) return i;
    const anchorsOnly = line.filter((s) => s.type === 'anchor');
    const otherSegs = line.filter((s) => s.type !== 'anchor');
    const allInternalAnchors =
      anchorsOnly.length >= 1 &&
      anchorsOnly.every((a) =>
        /(\/search\/label\/|hradiska\.sk\/\d{4}\/)/.test(a.href || ''),
      );
    const noOtherText = otherSegs.every(
      (s) => s.type === 'text' && s.text.length < 5,
    );
    if (allInternalAnchors && noOtherText) return i;
    // Riadok/trailing div pozostávajúci LEN z odkazu/odkazov, kde zobrazený text ANCHORu
    // JE sama URL (bežný Blogger vzor holého odkazového zoznamu bez "Zdroje:"/"Spracoval:"
    // markeru — Břeclav-Pohansko: 3 externé <a> oddelené <br>, žiadna atribúcia).
    // GATED rovnako ako atribúcia (len druhá polovica článku), aby nechytilo mid-article
    // odkaz s vlastnou URL ako viditeľným textom.
    const allBareUrlAnchors =
      opts.allowAttributionStart &&
      anchorsOnly.length >= 1 &&
      anchorsOnly.every((a) => /^https?:\/\//i.test((a.title || '').trim()));
    if (allBareUrlAnchors && noOtherText) return i;
  }
  return -1;
}

/** Z line-arrays vytvorí pole rich-text paragraph children pre Strapi blocks. */
function paragraphChildrenFromLines(lines) {
  const children = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const seg of line) {
      if (seg.type === 'text') {
        children.push({ type: 'text', text: seg.text });
      } else if (seg.type === 'bold-text') {
        children.push({ type: 'text', text: seg.text, bold: true });
      } else if (seg.type === 'anchor') {
        children.push({
          type: 'link',
          url: seg.href,
          children: [{ type: 'text', text: seg.title || seg.href }],
        });
      }
    }
    if (i < lines.length - 1) children.push({ type: 'text', text: '\n' });
  }
  return children;
}

/** Wrapper okolo classifyCitation: keď máme priamo line-array (bez div elementu). */
function classifyCitationFromLines(lines) {
  const items = [];
  const seenCanonical = new Map(); // canonical → preferred raw url
  for (const line of lines) {
    const anchors = line.filter((s) => s.type === 'anchor' && s.href);
    for (const a of anchors) {
      const canonA = canonicalUrl(a.href);
      if (seenCanonical.has(canonA)) continue;
      const isInternal = /hradiska\.sk/.test(a.href);
      items.push({
        type: isInternal ? 'internal-link' : 'external-url',
        url: stripNbspWs(a.href),
        title: stripNbspWs(a.title) || stripNbspWs(a.href),
      });
      seenCanonical.set(canonA, a.href);
    }
    const bolds = line.filter((s) => s.type === 'bold-text' && s.text);
    for (const b of bolds) {
      const cleanBold = stripNbspWs(b.text);
      if (cleanBold.length > 8 && !/^[•·]/.test(cleanBold)) {
        items.push({ type: 'attribution', text: cleanBold });
      }
    }
    const textOnly = stripNbspWs(line
      .filter((s) => s.type === 'text')
      .map((s) => s.text)
      .join(' '));
    if (!textOnly) continue;
    // URL: http/https (dvojbodka VOLITEĽNÁ — Blogger typo "http//..." bez nej, napr. Arkona
    // "http//pospolitost.wordpress.com/...") plus aj `www.domain.tld` bez schémy.
    const urlRegex = /https?:?\/\/\S+|\bwww\.[\w-]+(?:\.[\w-]+)+\/?\S*/gi;
    const urlsInText = textOnly.match(urlRegex) || [];
    for (const u of urlsInText) {
      let cleanUrl = stripNbspWs(u.replace(/[.,;)\]]+$/, ''));
      // Pridaj `http://` ak URL začína `www.` (autor písal bez schémy)
      if (/^www\./i.test(cleanUrl)) cleanUrl = 'http://' + cleanUrl;
      // Doplň chýbajúcu dvojbodku po schéme (typo "http//..." → "http://...")
      cleanUrl = cleanUrl.replace(/^(https?):?\/\//i, '$1://');
      if (IMAGE_URL_RE.test(cleanUrl)) continue; // obrázok, nie zdroj
      const canon = canonicalUrl(cleanUrl);
      // Canonical dedup: ak rovnaká URL bola už pridaná ako anchor (alebo skôr), zahoď
      if (seenCanonical.has(canon)) continue;
      const isInternal = /hradiska\.sk/.test(cleanUrl);
      items.push({
        type: isInternal ? 'internal-link' : 'external-url',
        url: cleanUrl,
        title: cleanUrl,
      });
      seenCanonical.set(canon, cleanUrl);
    }
    const residual = stripNbspWs(textOnly.replace(urlRegex, ''));
    const residualWords = residual.split(/\s+/).filter(Boolean).length;
    const isAttribution = /obr[áa]zk|prevzat|stv2|fotiek|orgo[nň]/i.test(residual)
      || /^(foto|zdroj|prameň|spracoval|autor)\s*:/i.test(residual);
    // Atribučné riadky ("Foto: Orgoň") pripúšťame aj krátke; ostatné min. 4 slová (kniha).
    if (residualWords >= 4 || (isAttribution && residualWords >= 1)) {
      items.push({
        type: isAttribution ? 'attribution' : 'book',
        text: residual,
      });
    }
  }
  return items;
}

/** Orchestrátor: prejde top-level divs, oddelí zdroje, zlúči no-caption image-blocky
 *  do image-gallery s max 4 obrázkami na galériu (žiadne dlhé série bez textu). */
function buildBlocksFromBody($, bodyRoot, articleTitle = '') {
  const blocks = [];
  // Pre-pass: označ behy centrovaných kurzívových veršov ako básne (data-poem v DOM),
  // aby ich convertDivToBlocks/walkDocOrder vydali ako content.poem, nie ako rich-text.
  const poemMeta = {};
  markPoemRuns($, bodyRoot, poemMeta);
  // Top-level body children: <div> AJ <table.tr-caption-container>.
  // Predtým sa čítali iba `children('div')` — to vynechalo obrázky v tabuľkách
  // ktoré Blogger občas dáva priamo pod <body> bez wrapping divu.
  const topLevel = $(bodyRoot)
    .children()
    .filter((_, el) => {
      const tag = el.tagName?.toLowerCase();
      if (tag === 'div') return true;
      if (tag === 'table' && $(el).hasClass('tr-caption-container')) return true;
      return false;
    })
    .toArray();

  let sourcesStartIdx = -1;
  let internalSplitLines = null;
  const attrGateFrom = Math.floor(topLevel.length / 2);
  for (let i = 0; i < topLevel.length; i++) {
    const lines = splitDivIntoLines($, topLevel[i]);
    // Atribučný split ("Spracoval:/Foto:/Autor:") povolený len v druhej polovici
    // top-level divov — chráni pred predčasným odseknutím pri mid-article "Foto:".
    const lineIdx = findInternalSourcesSplit(lines, { allowAttributionStart: i >= attrGateFrom });
    if (lineIdx === -1) continue;
    sourcesStartIdx = i;
    if (lineIdx === 0) {
      internalSplitLines = null;
    } else {
      internalSplitLines = { preLines: lines.slice(0, lineIdx), postLines: lines.slice(lineIdx) };
    }
    break;
  }

  const mainDivs = sourcesStartIdx === -1 ? topLevel : topLevel.slice(0, sourcesStartIdx);
  const sourceDivs = sourcesStartIdx === -1 ? [] : topLevel.slice(sourcesStartIdx);

  const ctx = { captionedIdx: 0, articleTitle };
  for (const div of mainDivs) {
    // Pre veľké divs (> 5000 chars textu) použij singleSplit aby sa <br/> segmenty
    // stali samostatnými odsekmi. Blogger články typu Nitra majú celý obsah v jednom
    // div-e bez dvojitých newlines a parser inak vyrobí 22k-znakový monolit.
    const divTextLen = plainText($, div).length;
    const opts = divTextLen > 5000 ? { singleSplit: true } : {};
    const produced = convertDivToBlocks($, div, ctx, opts);
    blocks.push(...produced);
  }

  // Internal split — div ktorý obsahuje aj obsah aj sources marker (napr. "Pozornosť…
  // [12 obrázkov] Orgoň zdroj: …"). Spracujeme ho cez convertDivToBlocks aby sme
  // získali AJ obrázky AJ paragraph, a posledný rich-text block ktorý zachytil
  // sources text odrežeme — zdroje sa vygenerujú z postLines mimo tela článku.
  if (internalSplitLines) {
    if (sourcesStartIdx !== -1) {
      const splitDiv = topLevel[sourcesStartIdx];
      const produced = convertDivToBlocks($, splitDiv, ctx, { singleSplit: true });
      // Odrež trailing blocky ktoré patria zdrojom (URL / "zdroj:" prefix). Robíme
      // DVOJFÁZOVÝ scan namiesto naivného while-pop: obrázok/embed VLOŽENÝ medzi
      // zdrojové riadky (napr. "Foto zdroja: ... [fotka] ... http://...") predtým
      // zastavil while-loop na prvom nie-rich-text bloku (`break`), takže sa staršie
      // zdrojové rich-text bloky PRED tým obrázkom nikdy neodrezali (Nitra bug).
      // Fáza 1: nájdi hranicu `cutFrom` — najskorší index od ktorého VŠETKO za ním
      // (obrázky/embed poskytnuté, rich-text len ak looksLikeSources) je súčasť zdrojov.
      const isSourceLikeRichText = (b) => {
        if (b.__component !== 'content.rich-text') return null; // not applicable
        const linkText = (c) => c.url ? `${c.url} ${(c.children || []).map((cc) => cc.text || '').join('')}` : '';
        const txt = (b.body || [])
          .flatMap((n) => (n.children || []).map((c) => c.text ?? linkText(c)))
          .join(' ')
          .trim();
        // Rovnaké markery ako findInternalSourcesSplit (inak trim-slučka nechytí presne to,
        // čo split-detekcia už uznala za začiatok zdrojov — napr. bold "Preložili sme",
        // "Spracoval/Autori/Prebral/Prevzaté:", "prevzatý z/preložené z").
        return (
          /(zdroj[ey]?|pramen[ey]?|literat[uú]ra|references?)\s*:/i.test(txt) ||
          /https?:?\/\//.test(txt) ||  // dvojbodka voliteľná — Blogger typo "http//..."
          /^\s*(spracoval|autori?|prebral|prevzat[éy]|foto)\s*:/i.test(txt) ||
          // "Foto <opis>: <autor>" — fotokredit s opisom MEDZI "Foto" a dvojbodkou
          // (Nitra: "Foto hradiska Zobor a Šindolka: Anna Halčinová AVANS 2008"),
          // nie len holé "Foto:". Obmedzené na krátky úsek pred dvojbodkou (≤60 zn),
          // aby nechytilo bežnú vetu, ktorá náhodou obsahuje slovo "foto" ďaleko od začiatku.
          /^\s*foto\b[^:]{0,60}:/i.test(txt) ||
          /preložili sme/i.test(txt) ||
          /\b(?:[čc]l[áa]nok\s+)?prevzat[ýáé]\s+z\b|\bprelo[žz]en[éeý]\s+z\b/i.test(txt) ||
          txt.length < 30
        );
      };
      let cutFrom = produced.length;
      for (let i = produced.length - 1; i >= 0; i--) {
        const isSourceLike = isSourceLikeRichText(produced[i]);
        if (isSourceLike === false) break; // reálny rich-text obsah → koniec zdrojového chvosta
        if (isSourceLike === null && i === produced.length - 1) break; // posledný blok je non-rich-text a NIČ za ním nebolo zdroj → netrimuj (napr. legitímny záverečný obrázok)
        cutFrom = i;
      }
      produced.splice(cutFrom);
      blocks.push(...produced);
    } else if (internalSplitLines.preLines.length > 0) {
      // Fallback: ak sourcesStartIdx === -1 ale máme preLines (nestane sa typicky)
      const children = paragraphChildrenFromLines(internalSplitLines.preLines);
      if (children.length > 0) {
        blocks.push({
          __component: 'content.rich-text',
          body: [{ type: 'paragraph', children }],
        });
      }
    }
  }

  // ----- RYTMUS OBRÁZKOV V TELE (rozbíjanie zhlukov + captioned priorita) -----
  // Cieľ: obrázok ako oddych medzi pasážami — nikdy stena, ani dlhá púšť textu, ak je
  // po ruke obrázok. Problém starých blogov: obrázky nakopené v zhlukoch (0 znakov
  // medzi nimi) — čistý prah ich do tela nepustí (anti-stena), ostanú visieť v galérii,
  // hoci telo má obrovské bloky textu bez ilustrácie.
  //
  // Riešenie: VŠETKY obrázky idú do fronty (dokumentové poradie). Po každom odseku, keď
  // od posledného obrázka v tele pribudlo ≥BODY_IMAGE_TEXT_THRESHOLD znakov, umiestnime 1
  // z fronty ZA tento odsek → zhluky sa „rozpustia" do neskorších textových medzier.
  // Výber z fronty: NAJSKORŠÍ CAPTIONED (hodnotné/kontextové obrázky majú prednosť); ak
  // vo fronte žiaden captioned nie je, najskorší (= najbližší zhluk). 1 na slot → žiadna
  // stena. Zvyšok fronty (nezmestí sa do rytmu) → galéria, POPIS zachovaný.
  const BODY_IMAGE_TEXT_THRESHOLD = 800;
  const galleryRefs = []; // top-level Strapi blog-post.gallery (overflow); prvky {...ref, caption}
  const merged = [];
  const deferQueue = []; // obrázky čakajúce na umiestnenie do tela (dokumentové poradie)
  let charsSinceBodyImage = 0;
  let seenText = false;
  const placeFromQueue = () => {
    // captioned priorita: najskorší obrázok s popisom; inak najskorší (najbližší zhluk)
    let idx = deferQueue.findIndex((im) => im.showCaption && im.caption && im.caption.trim());
    if (idx < 0) idx = 0;
    merged.push(deferQueue.splice(idx, 1)[0]);
    charsSinceBodyImage = 0;
  };
  for (const b of blocks) {
    if (b.__component === 'content.rich-text') {
      merged.push(b);
      seenText = true;
      charsSinceBodyImage += richTextLength(b);
      // slot otvorený a niečo čaká → umiestni 1 (max 1 na odsek = žiadna stena)
      if (seenText && charsSinceBodyImage >= BODY_IMAGE_TEXT_THRESHOLD && deferQueue.length) {
        placeFromQueue();
      }
      continue;
    }
    if (b.__component !== 'content.image-block') {
      // embed / quote a iné bloky ostávajú v tele na svojej pozícii
      merged.push(b);
      continue;
    }
    // obrázok → do fronty (umiestni sa za neskorší odsek s dosť textom, alebo do galérie)
    deferQueue.push(b);
  }
  // zvyšok fronty sa nezmestil do rytmu → galéria (POPIS zachovaný)
  for (const im of deferQueue) {
    if (im.imageRef) galleryRefs.push({ ...im.imageRef, caption: im.caption || null });
  }

  return {
    mainBlocks: merged,
    galleryRefs,
    sourceDivs,
    sourcePostLines: internalSplitLines?.postLines || null,
    poemMeta,
  };
}

// -----------------------------------------------------------------------------
// Citácie / zdroje
// -----------------------------------------------------------------------------

/** Walk cheerio contents() a rozdelí ich na "logické riadky" oddelené `<br>`.
 *  Každý riadok je pole { type: 'text'|'anchor'|'bold-text', ... } v poradí v DOM. */
function splitDivIntoLines($, node) {
  const NBSP_RE = /[ \s]+/g;
  const lines = [[]];
  function visit(n) {
    if (n.type === 'text') {
      const t = n.data;
      if (t) lines[lines.length - 1].push({ type: 'text', text: t });
      return;
    }
    if (n.type !== 'tag') return;
    const tag = n.tagName.toLowerCase();
    if (tag === 'br') {
      lines.push([]);
      return;
    }
    if (tag === 'a') {
      const href = $(n).attr('href') || '';
      const title = $(n).text().replace(NBSP_RE, ' ').trim();
      lines[lines.length - 1].push({ type: 'anchor', href, title });
      return;
    }
    if (tag === 'b' || tag === 'strong') {
      const t = $(n).text().replace(NBSP_RE, ' ').trim();
      if (t) lines[lines.length - 1].push({ type: 'bold-text', text: t });
      return;
    }
    // BUG: nested <div>/<p> boundary predtým NEZNAMENALA nový riadok — len sa do nich
    // ticho rekurzovalo, takže viacero samostatných top-level <div> citácií (oddelených
    // divom, nie <br>) sa zliepalo do JEDNÉHO riadku/citácie (Nitra: 4 samostatné
    // bibliografické záznamy sa zlepili do jedného obrovského textu). Blokové elementy
    // teraz vždy začínajú/končia nový riadok, rovnako ako <br>.
    if (tag === 'div' || tag === 'p') {
      if (lines[lines.length - 1].length > 0) lines.push([]);
      $(n).contents().each((_, c) => visit(c));
      if (lines[lines.length - 1].length > 0) lines.push([]);
      return;
    }
    $(n).contents().each((_, c) => visit(c));
  }
  $(node).contents().each((_, c) => visit(c));
  return lines
    .map((line) =>
      line
        .map((seg) =>
          seg.type === 'text' ? { ...seg, text: seg.text.replace(NBSP_RE, ' ').trim() } : seg,
        )
        .filter((seg) => seg.type !== 'text' || seg.text),
    )
    .filter((line) => line.length > 0);
}

// Obrázkové URL (blogger CDN, blogspot, prípona obrázka) NIE sú bibliografické zdroje.
// Bez tohto filtra by sa anchory fotiek v zdrojovej sekcii (napr. 8 fotiek šperkov
// vo Velehrade) klasifikovali ako `external-url` citácie. (Pozri aj Bojná TODO.)
const IMAGE_URL_RE = /blogger\.googleusercontent\.com|bp\.blogspot\.com|\.(?:jpe?g|png|gif|webp|bmp|svg)(?:[?#]|$)/i;

function classifyCitation($, node) {
  const items = [];
  const seenCanonical = new Map(); // canonical → preferred raw url
  const lines = splitDivIntoLines($, node);

  for (const line of lines) {
    const anchors = line.filter((s) => s.type === 'anchor' && s.href);
    for (const a of anchors) {
      if (IMAGE_URL_RE.test(a.href)) continue; // obrázok, nie zdroj
      const canonA = canonicalUrl(a.href);
      if (seenCanonical.has(canonA)) continue;
      const isInternal = /hradiska\.sk/.test(a.href);
      items.push({
        type: isInternal ? 'internal-link' : 'external-url',
        url: stripNbspWs(a.href),
        title: stripNbspWs(a.title) || stripNbspWs(a.href),
      });
      seenCanonical.set(canonA, a.href);
    }

    const bolds = line.filter((s) => s.type === 'bold-text' && s.text);
    for (const b of bolds) {
      const cleanBold = stripNbspWs(b.text);
      if (cleanBold.length > 8 && !/^[•·]/.test(cleanBold)) {
        items.push({ type: 'attribution', text: cleanBold });
      }
    }

    const textOnly = stripNbspWs(line
      .filter((s) => s.type === 'text')
      .map((s) => s.text)
      .join(' '));
    if (!textOnly) continue;

    // URL: http/https (dvojbodka VOLITEĽNÁ — Blogger typo "http//..." bez nej) plus aj
    // `www.domain.tld` bez schémy (Blogger autori zvyknú písať bez `http://`)
    const urlRegex = /https?:?\/\/\S+|\bwww\.[\w-]+(?:\.[\w-]+)+\/?\S*/gi;
    const urlsInText = textOnly.match(urlRegex) || [];
    for (const u of urlsInText) {
      let cleanUrl = stripNbspWs(u.replace(/[.,;)\]]+$/, ''));
      // Pridaj `http://` ak URL začína `www.` (autor písal bez schémy)
      if (/^www\./i.test(cleanUrl)) cleanUrl = 'http://' + cleanUrl;
      // Doplň chýbajúcu dvojbodku po schéme (typo "http//..." → "http://...")
      cleanUrl = cleanUrl.replace(/^(https?):?\/\//i, '$1://');
      if (IMAGE_URL_RE.test(cleanUrl)) continue; // obrázok, nie zdroj
      const canon = canonicalUrl(cleanUrl);
      // Canonical dedup: ak rovnaká URL bola už pridaná ako anchor (alebo skôr), zahoď
      if (seenCanonical.has(canon)) continue;
      const isInternal = /hradiska\.sk/.test(cleanUrl);
      items.push({
        type: isInternal ? 'internal-link' : 'external-url',
        url: cleanUrl,
        title: cleanUrl,
      });
      seenCanonical.set(canon, cleanUrl);
    }

    const residual = stripNbspWs(textOnly.replace(urlRegex, ''));
    const residualWords = residual.split(/\s+/).filter(Boolean).length;
    const isAttribution = /obr[áa]zk|prevzat|stv2|fotiek|orgo[nň]/i.test(residual)
      || /^(foto|zdroj|prameň|spracoval|autor)\s*:/i.test(residual);
    // Atribučné riadky ("Foto: Orgoň") pripúšťame aj krátke; ostatné min. 4 slová (kniha).
    if (residualWords >= 4 || (isAttribution && residualWords >= 1)) {
      items.push({
        type: isAttribution ? 'attribution' : 'book',
        text: residual,
      });
    }
  }

  return items;
}

function buildSourcesBlock(citations) {
  let intro = null;
  let startIdx = 0;
  if (citations.length > 0 && (citations[0].type === 'attribution' || citations[0].type === 'book')) {
    const txt = stripNbspWs(citations[0].text || '');
    if (/:\s*$/.test(txt) || /\btu\s*[:.]?\s*$/i.test(txt)) {
      intro = txt;
      startIdx = 1;
    }
  }
  const items = [];
  for (let i = startIdx; i < citations.length; i++) {
    const c = citations[i];
    if (c.type === 'internal-link' || c.type === 'external-url') {
      const text = stripNbspWs(c.title || c.url);
      const url = stripNbspWs(c.url);
      if (!url) continue;
      items.push({ text: text || url, url });
    } else {
      const text = stripNbspWs(c.text);
      if (!text) continue;
      items.push({ text, url: null });
    }
  }
  return {
    __component: 'content.sources',
    title: 'Zdroje a literatúra',
    intro,
    items,
  };
}

// -----------------------------------------------------------------------------
// Location: lat/lng + region/country (region len ak doslova v texte)
// -----------------------------------------------------------------------------

function detectLocation($, fullText, articleTitle = '', sourceLabel = null) {
  const $iframe = $('iframe[src*="maps.google.com"]').first();
  const src = $iframe.attr('src') || '';
  const ll = extractLatLng(src);
  if (!ll) return null;

  // Meno: heuristika — pre tento článok je v prvom odstavci "dnes Zalavár";
  // generalizujeme: skús nájsť "dnes <Slovo>" alebo necháme prázdne (manual fill).
  let name = null;
  const nameMatch = fullText.match(/dnes ([A-ZÁ-ŽÄÉÍÓÚÝŤŇĽĎ][a-zá-žäéíóúýťňľď]+)/);
  if (nameMatch) name = nameMatch[1];
  // BUG 1: ak sa meno nenašlo, použij titulok článku ako pin label (bez "(CZ)" suffixu).
  // Schéma sidebar.location vyžaduje `name` — bez fallbacku by upload spadol na
  // ValidationError. Spúšťa sa LEN keď existuje mapa (vyššie už `return null`).
  if (!name && articleTitle) {
    name = articleTitle.replace(/\s*\([A-Z][A-Z\/]*\)\s*$/, '').trim() || null;
  }

  // Country: vlož len ak je doslova v texte (pravidlo Fázy 0 #4 sa formálne týka regiónu,
  // ale aplikujeme rovnakú zásadu — nedopĺňať odvodené hodnoty).
  // Country: vlož len ak je doslova v texte ako lokatív (pravidlo Fázy 0 #4).
  // Hľadáme patterny "v/na {Stem}{u|om}" — to filtruje adjektívne výskyty ako
  // "Slovenského kniežaťa" (ktoré označuje pôvod osoby, nie umiestnenie hradiska).
  // Príklady ktoré tieto patterns trafia: "v Maďarsku", "na Slovensku", "v Rakúskom".
  const COUNTRY_LOCATIVES = {
    'Slovensko': /\b(?:v|na)\s+Slovensk[uo]m?\b/i,
    'Maďarsko': /\b(?:v|na)\s+Maďarsk[uo]m?\b/i,
    'Rakúsko': /\b(?:v|na)\s+Rakúsk[uo]m?\b/i,
    'Česko': /\b(?:v|na)\s+Česk[uo]m?\b/i,
    'Poľsko': /\b(?:v|na)\s+Poľsk[uo]m?\b/i,
    'Ukrajina': /\b(?:v|na)\s+Ukrajin[eyu]\b/i,
    'Nemecko': /\b(?:v|na)\s+Nemeck[uo]m?\b/i,
    'Chorvátsko': /\b(?:v|na)\s+Chorvátsk[uo]m?\b/i,
    'Slovinsko': /\b(?:v|na)\s+Slovinsk[uo]m?\b/i,
  };
  let country = null;
  let bestCount = 0;
  for (const [name, re] of Object.entries(COUNTRY_LOCATIVES)) {
    const reGlobal = new RegExp(re.source, 'gi');
    const matches = fullText.match(reGlobal);
    if (matches && matches.length > bestCount) {
      country = name;
      bestCount = matches.length;
    }
  }

  // BUG 2: ak locatív v texte nič nenašiel, použij krajinu z label suffixu
  // ("Staré Město - Velehrad (CZ)" → Česko). NIE heuristika "Morava→Česko" (krehká).
  // Suffix je spoľahlivý identifikačný signál autora. "(CZ/SK)" → prvý kód.
  if (!country && sourceLabel) {
    const m = sourceLabel.match(/\(([A-Z][A-Z\/]*)\)\s*$/);
    const code = m ? m[1].split('/')[0] : null;
    const LABEL_COUNTRY = {
      SK: 'Slovensko', CZ: 'Česko', H: 'Maďarsko', A: 'Rakúsko', PL: 'Poľsko',
      UA: 'Ukrajina', D: 'Nemecko', HR: 'Chorvátsko', SLO: 'Slovinsko',
    };
    if (code && LABEL_COUNTRY[code]) country = LABEL_COUNTRY[code];
  }

  // Region: striktne len ak v texte explicitne stojí "<Slovo> župa/kraj/marka"
  let region = null;
  const regionMatch = fullText.match(
    /\b([A-ZÁ-Ž][a-zá-ž]+(?:ská|cká|cha|nia))\s+(župa|kraj|marka)\b/,
  );
  if (regionMatch) region = `${regionMatch[1]} ${regionMatch[2]}`;

  return {
    name,
    latitude: ll.latitude,
    longitude: ll.longitude,
    region,
    country,
  };
}

// -----------------------------------------------------------------------------
// Excerpt + readingTime
// -----------------------------------------------------------------------------

function buildExcerpt($, bodyRoot, maxLen = 250) {
  // Vezmi prvý div ktorý — PO ODSTRÁNENÍ media child elementov (iframe/img/table) —
  // obsahuje > 60 znakov plain textu. Predtým buildExcerpt skipoval celý div ak mal
  // hocikde vnútri iframe/img, čo preskočilo úvodný odstavec o Blatnohrade (mal v sebe
  // <iframe> Google Maps) aj druhý odstavec (mal vnútri <table> s obrázkom).
  const divs = $(bodyRoot).children('div').toArray();
  for (const div of divs) {
    const $clone = $(div).clone();
    // BUG 6: okrem média odstráň aj mapový odkaz "Zväčšiť mapu"/"View Larger Map"
    // (`<small><a href="...maps.google...">`), inak preniká do excerptu.
    // Odstráň aj básne (data-poem/data-poem-skip z markPoemRuns) — verše sú lyrické,
    // nie faktický popis článku, a nesmú sa dostať do excerptu ako "prvý odsek".
    $clone.find('iframe, img, table.tr-caption-container, div.separator, a[href*="maps.google"], a[href*="/maps"], [data-poem], [data-poem-skip]').remove();
    if ($(div).is('[data-poem], [data-poem-skip]')) continue;
    let t = $clone.text().replace(/[ \s]+/g, ' ').trim();
    // Niektoré staršie články majú netypickú štruktúru (Nitra) — celý úvod vrátane
    // krátkej citačnej poznámky v zátvorke ("(Slovenské Spevy vyd. ... 1883)") je
    // vnorený v JEDNOM top-level dive namiesto plochých súrodeneckých divov, takže
    // sa táto poznámka zlepí s nasledujúcim reálnym odsekom. Odstráň vedúcu zátvorkovú
    // citáciu, ak za ňou nasleduje podstatne dlhší text (t.j. nie je to sama sebou excerpt).
    t = t.replace(/^\([^)]{3,120}\)\s*/, (m) => (t.length - m.length >= 60 ? '' : m));
    if (t.length >= 60) {
      const truncated = t.length > maxLen ? t.slice(0, maxLen).replace(/\s+\S*$/, '') + '…' : t;
      return truncated;
    }
  }
  return '';
}

function estimateReadingTime(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// -----------------------------------------------------------------------------
// Komentáre
// -----------------------------------------------------------------------------

function loadComments() {
  if (!existsSync(COMMENTS_PATH)) return { count: 0, items: [] };
  const j = JSON.parse(readFileSync(COMMENTS_PATH, 'utf8'));
  const entries = j.feed?.entry || [];
  const count = parseInt(j.feed?.['openSearch$totalResults']?.$t ?? entries.length, 10) || entries.length;
  const items = entries.map((c) => ({
    id: c.id?.$t,
    author: c.author?.[0]?.name?.$t || 'Anonymous',
    authorProfile: c.author?.[0]?.uri?.$t || null,
    published: c.published?.$t,
    updated: c.updated?.$t,
    content: c.content?.$t || '',
    inReplyTo: c['thr$in-reply-to']?.href || null,
  }));
  return { count, items };
}

// -----------------------------------------------------------------------------
// Hlavná funkcia
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Detekcia edge-cases (Krok B): hľadáme štruktúry, na ktoré parser zatiaľ nebol
// testovaný a ktoré by mohli ticho zhltnúť obsah.
// -----------------------------------------------------------------------------

function runChecks($, html) {
  // 1) <h2>/<h3>/<h4> priamo v tele — convertDivToBlocks rieši len <b>-only divs
  const nativeHeadings = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    nativeHeadings.push({
      level: el.tagName.toLowerCase(),
      text: $(el).text().replace(/[ \s]+/g, ' ').trim().slice(0, 80),
    });
  });

  // 2) <iframe> iné než maps.google.com — YouTube, Flickr, Vimeo, ...
  const allIframes = $('iframe').toArray();
  const mapIframes = [];
  const nonMapIframes = [];
  for (const i of allIframes) {
    const src = $(i).attr('src') || '';
    if (/maps\.google\.com/.test(src)) mapIframes.push(src);
    else nonMapIframes.push(src);
  }

  // 3) Obrázky s captionom ako <i>/<small>/<em> text priamo pod obrázkom
  //    (nie tr-caption-container). Pattern: <a><img></a> bezprostredne nasleduje
  //    <i>/<small>/<em> alebo <p class="italic"> ako sibling.
  let italicCaptions = 0;
  $('a > img').each((_, img) => {
    const $a = $(img).parent('a');
    // Najbližší významný sibling po <a> elemente
    let next = $a[0].nextSibling;
    while (next && next.type === 'text' && !next.data.trim()) next = next.nextSibling;
    if (next && next.type === 'tag') {
      const tag = next.tagName.toLowerCase();
      if (tag === 'i' || tag === 'em' || tag === 'small') {
        italicCaptions++;
      } else if (tag === 'p' || tag === 'div') {
        // wrap ktorý začína <i>/<em>/<small>
        const $next = $(next);
        const firstChild = $next.children().first();
        if (firstChild.length) {
          const ftag = firstChild[0].tagName?.toLowerCase();
          if (ftag === 'i' || ftag === 'em' || ftag === 'small') italicCaptions++;
        }
      }
    }
  });

  // 4) Image count (všetky <img>) a samostatný count obrázkov v tr-caption-container
  const totalImages = $('a > img').length;
  const captionedImages = $('table.tr-caption-container').length;
  const separatorImages = $('div.separator > a > img').length;

  return {
    nativeHeadings, // [{level, text}]
    nativeHeadingCount: nativeHeadings.length,
    mapIframeCount: mapIframes.length,
    mapIframeSrcs: mapIframes,
    nonMapIframeCount: nonMapIframes.length,
    nonMapIframeSrcs: nonMapIframes,
    italicCaptionCount: italicCaptions,
    totalImages,
    captionedImages,
    separatorImages,
  };
}

// -----------------------------------------------------------------------------
// Sanity flags (Krok C): post-fact analýza vyrobeného output objektu.
// -----------------------------------------------------------------------------

function runSanity(output, checks) {
  const flags = [];
  const bp = output.blogPost;
  if (bp.blocks.length === 0) flags.push('zeroBlocks');
  if (bp.gallery.length === 0) flags.push('zeroImages');
  if (bp.citations.length === 0) flags.push('zeroCitations');
  if (!bp.excerpt || bp.excerpt.length < 100) flags.push('shortExcerpt');

  // Dlhý rich-text blok (možno sa nerozdelili odstavce)
  const longRichText = bp.blocks.find((b) => {
    if (b.__component !== 'content.rich-text') return false;
    const totalLen = (b.body || []).reduce((sum, node) => {
      const text = (node.children || [])
        .map((c) => c.text || (c.children?.[0]?.text ?? ''))
        .join(' ');
      return sum + text.length;
    }, 0);
    return totalLen > 2500;
  });
  if (longRichText) flags.push('longRichText');

  // Missing location
  if (!bp.location) flags.push('noLocation');

  // Multiple map iframes — viac lokácií, momentálne zachytáme len prvú
  if (checks.mapIframeCount > 1) flags.push('multipleMapIframes');

  // Edge-case warnings z runChecks
  if (checks.nativeHeadingCount > 0) flags.push('hasNativeHeadings');
  if (checks.nonMapIframeCount > 0) flags.push('hasNonMapIframes');
  if (checks.italicCaptionCount > 0) flags.push('hasItalicCaptions');

  return flags;
}

// -----------------------------------------------------------------------------
// Build output pre jednu entry (extrakcia hlavnej logiky z main).
// -----------------------------------------------------------------------------

function buildOutputForEntry(entry, commentsData, sourceFeedPath) {
  const title = entry.title?.$t || '';
  const slug = slugify(title);
  const postId = entry.id?.$t || '';
  const published = entry.published?.$t || '';
  const updated = entry.updated?.$t || '';
  const authorName = entry.author?.[0]?.name?.$t || '';
  const labels = (entry.category || []).map((c) => c.term);
  const html = entry.content?.$t || '';

  // sourceLabel = label so zátvorkovým suffixom typu (H), (CZ/SK), (CZ), (SK), (D)…
  // To je identita článku / hradiska, nepoužíva sa ako tag. Ostatné labely → tagy.
  const sourceLabel = labels.find((l) => /\([A-Z][A-Z\/]*\)\s*$/.test(l)) || null;
  const tags = labels.filter((l) => l !== sourceLabel);

  const $ = cheerio.load(html);
  const bodyRoot = $('body')[0];
  const fullText = plainText($, bodyRoot);

  const { mainBlocks, galleryRefs, sourceDivs, sourcePostLines, poemMeta } = buildBlocksFromBody($, bodyRoot, title);

  const citations = [];
  if (sourcePostLines) {
    citations.push(...classifyCitationFromLines(sourcePostLines));
    for (const d of sourceDivs.slice(1)) {
      citations.push(...classifyCitation($, d));
    }
  } else {
    for (const d of sourceDivs) {
      citations.push(...classifyCitation($, d));
    }
  }

  // BUG 3 (časť 2): zo `sourceDivs` ide do citácií iba TEXT — `classifyCitation`
  // obrázky ignoruje. Ak však zdrojová sekcia obsahuje reálne fotky (napr. 8 fotiek
  // veľkomoravských šperkov z múzea vo Velehrade), vyžobreme ich a pridáme do galérie,
  // aby sa po splite nestratili. Pracujeme na klone divu (convertDivToBlocks mutuje DOM).
  for (const d of sourceDivs) {
    const harvested = convertDivToBlocks($, $(d).clone()[0], { captionedIdx: 0 });
    for (const hb of harvested) {
      if (hb.__component === 'content.image-block' && hb.imageRef) galleryRefs.push({ ...hb.imageRef, caption: hb.caption || null });
    }
  }

  let blocks = [...mainBlocks];
  if (citations.length > 0) {
    blocks.push(buildSourcesBlock(citations));
  }
  removeMapsExpandLinks(blocks);
  cleanupOrphanChildren(blocks);
  // cleanupOrphanChildren vyprázdni `body` odsekov bez reálneho textu, ale nechá
  // samotný (teraz prázdny) content.rich-text blok stáť — ak je to PRVÝ takýto blok
  // v článku, frontend naň napriek prázdnote naviaže "prvý rich-text blok" pre drop-cap
  // a iniciála sa v článku nezobrazí vôbec (Velehrad: blocks[0] = {body: []}).
  blocks = blocks.filter((b) => b.__component !== 'content.rich-text' || (b.body && b.body.length > 0));
  blocks = mergeConsecutiveQuotes(blocks);
  blocks = splitLongParagraphsBySectionHeaders(blocks);
  convertShortParagraphsToHeadings(blocks);
  blocks = reorderHeadingBeforeImage(blocks);
  pairAdjacentImages(blocks);

  let coverImage = null;
  for (const b of blocks) {
    if (b.__component === 'content.image-block' && b.imageRef) {
      coverImage = b.imageRef;
      break;
    }
    if (b.__component === 'content.image-gallery' && b.imageRefs?.length) {
      coverImage = b.imageRefs[0];
      break;
    }
  }

  // Top-level gallery: sumarizujúca Fotogaléria pod článkom. Zahŕňa VŠETKY obrázky
  // článku (cover + captioned v tele + no-caption odložené orchestrátorom),
  // deduplikované podľa sourceUrl. Každý si nesie `caption` ktorý sa pri uploade
  // zapíše do Strapi media metadata (frontend ho zobrazí pod náhľadom).
  const galleryMap = new Map();
  const addToGallery = (ref, caption) => {
    if (!ref?.sourceUrl) return;
    const existing = galleryMap.get(ref.sourceUrl);
    if (!existing) {
      galleryMap.set(ref.sourceUrl, { ...ref, caption: caption || null });
    } else if (caption && !existing.caption) {
      existing.caption = caption;
    }
  };
  // 1) Cover
  if (coverImage) addToGallery(coverImage, null);
  // 2) Captioned v tele (čerpáme z mainBlocks po orchestrátorovi)
  for (const b of mainBlocks) {
    if (b.__component === 'content.image-block' && b.imageRef) {
      addToGallery(b.imageRef, b.caption || null);
    }
  }
  // 3) No-caption odložené orchestrátorom
  for (const r of galleryRefs) addToGallery(r, r.caption || null);

  const gallery = [...galleryMap.values()];

  const location = detectLocation($, fullText, title, sourceLabel);
  const excerpt = buildExcerpt($, bodyRoot, 250);
  const readingTime = estimateReadingTime(fullText);
  const checks = runChecks($, html);

  const repliesLink = entry.link?.find((l) => l.rel === 'replies')?.href || null;
  const commentCount = commentsData?.count ?? 0;
  const comments = commentsData?.items ?? [];

  const output = {
    $meta: {
      sourceFeed: sourceFeedPath,
      sourceLabel,
      postId,
      bloggerPostUrl: entry.link?.find((l) => l.rel === 'alternate')?.href || null,
      repliesLink,
      extractedAt: new Date().toISOString(),
      coverImageNeedsReview: true,
      commentCount,
      comments,
      checks,
      poemCount: poemMeta?.poemCount || 0,
      poemSingleFlags: poemMeta?.poemSingleFlags || [],
    },
    blogPost: {
      title,
      slug,
      excerpt,
      authorName,
      publishedAt: published,        // pôvodný Blogger dátum (Strapi ho však pri POST ignoruje)
      originalPublishedDate: published, // custom field; zachová Blogger dátum bezpečne
      updatedAt: updated,
      readingTime,
      featured: false,
      coverImage,
      gallery,
      tags,
      category: null,
      location,
      keyFacts: [],
      timeline: [],
      quotes: [],
      blocks,
      citations,
    },
  };

  output.$meta.sanityFlags = runSanity(output, checks);
  return output;
}

// -----------------------------------------------------------------------------
// Network helper: stiahne JSON cez fetch (Node 18+).
// -----------------------------------------------------------------------------

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** Z Blogger `link[rel=related].href` extrahuje parent comment Blogger post-id.
 *  Formát URL: `.../comments/default/<postId>` — vrátime posledný segment. */
function extractReplyToBloggerId(href) {
  if (!href) return null;
  const m = href.match(/\/comments\/default\/(\d+)\b/);
  return m ? m[1] : null;
}

/** Z entry.id (`tag:blogger.com,1999:blog-X.post-Y`) extrahuje len numerické Y. */
function extractBloggerPostId(entryId) {
  if (!entryId) return null;
  const m = entryId.match(/\.post-(\d+)/);
  return m ? m[1] : null;
}

function parseCommentsFeed(j) {
  const entries = j.feed?.entry || [];
  const count =
    parseInt(j.feed?.['openSearch$totalResults']?.$t ?? entries.length, 10) ||
    entries.length;
  const items = entries.map((c) => {
    const relatedHref = c.link?.find((l) => l.rel === 'related')?.href || null;
    return {
      id: c.id?.$t,
      bloggerPostId: extractBloggerPostId(c.id?.$t),
      author: c.author?.[0]?.name?.$t || 'Anonymous',
      authorProfile: c.author?.[0]?.uri?.$t || null,
      published: c.published?.$t,
      updated: c.updated?.$t,
      content: c.content?.$t || '',
      // thr$in-reply-to ukazuje na URL ČLÁNKU (nie na parent komentár) — nepoužiteľné pre threading.
      inReplyToArticle: c['thr$in-reply-to']?.href || null,
      // link[rel=related].href ukazuje na parent KOMENTÁR (Blogger autoritatívne).
      replyToBloggerId: extractReplyToBloggerId(relatedHref),
      replyToFeedHref: relatedHref,
    };
  });
  return { count, items };
}

async function main() {
  // ---------- BATCH MODE: --label=<path> ----------
  if (args.label) {
    const LABEL_PATH = resolve(__dirname, args.label);
    if (!existsSync(LABEL_PATH)) {
      console.error(`[err] label feed not found: ${LABEL_PATH}`);
      process.exit(1);
    }
    const feed = JSON.parse(readFileSync(LABEL_PATH, 'utf8'));
    const entries = feed.feed?.entry || [];
    if (entries.length === 0) {
      console.error('[err] label feed has no entries');
      process.exit(1);
    }
    const totalResults = parseInt(feed.feed?.['openSearch$totalResults']?.$t ?? entries.length, 10);
    console.log(`[batch] label="${feed.feed?.title?.$t || '?'}" — entries=${entries.length} (totalResults=${totalResults})`);

    const fetchComments = args.fetchComments !== 'false';
    const summaries = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const title = entry.title?.$t || '';
      const slug = slugify(title);

      // Komentáre cez network (Node 18+ fetch)
      let commentsData = { count: 0, items: [] };
      const repliesLink = entry.link?.find((l) => l.rel === 'replies')?.href;
      if (fetchComments && repliesLink) {
        try {
          const url = repliesLink.includes('?') ? `${repliesLink}&alt=json` : `${repliesLink}?alt=json`;
          const cj = await fetchJson(url);
          commentsData = parseCommentsFeed(cj);
        } catch (e) {
          console.warn(`  [warn] comments fetch failed for "${title}": ${e.message}`);
        }
      }

      const output = buildOutputForEntry(entry, commentsData, LABEL_PATH);
      const outFile = resolve(OUT_DIR, `${slug}.intermediate.json`);
      writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');

      const checks = output.$meta.checks;
      const bp = output.blogPost;
      summaries.push({
        index: i + 1,
        title,
        slug,
        blocks: bp.blocks.length,
        images: bp.gallery.length,
        citations: bp.citations.length,
        excerpt: bp.excerpt.length,
        commentCount: output.$meta.commentCount,
        location: bp.location ? `${bp.location.name ?? '?'} (${bp.location.country ?? '?'})` : null,
        nativeHeadings: checks.nativeHeadingCount,
        nonMapIframes: checks.nonMapIframeCount,
        italicCaptions: checks.italicCaptionCount,
        mapIframes: checks.mapIframeCount,
        sanityFlags: output.$meta.sanityFlags,
      });

      console.log(
        `[${(i + 1).toString().padStart(2)}/${entries.length}] ${slug.slice(0, 40).padEnd(40)} ` +
          `blocks=${bp.blocks.length.toString().padStart(2)} img=${bp.gallery.length.toString().padStart(2)} ` +
          `cit=${bp.citations.length.toString().padStart(2)} cmt=${output.$meta.commentCount.toString().padStart(2)} ` +
          `flags=${output.$meta.sanityFlags.length ? output.$meta.sanityFlags.join(',') : '—'}`,
      );
    }

    // ---------- Summary report ----------
    const reportPath = resolve(OUT_DIR, '_dry-run-report.json');
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          label: feed.feed?.title?.$t || null,
          extractedAt: new Date().toISOString(),
          totalEntries: entries.length,
          summaries,
        },
        null,
        2,
      ),
      'utf8',
    );

    // ---------- Console tabuľka Krok B ----------
    console.log('\n=== Krok B: edge-case detekcia ===');
    console.log(
      'idx | title'.padEnd(48) +
        '| H2/H3 native | non-map iframe | <i>/small caption | map iframes',
    );
    console.log('-'.repeat(120));
    for (const s of summaries) {
      const t = s.title.slice(0, 40).padEnd(40);
      const flagged =
        s.nativeHeadings > 0 ||
        s.nonMapIframes > 0 ||
        s.italicCaptions > 0 ||
        s.mapIframes !== 1;
      console.log(
        `${s.index.toString().padStart(3)} | ${t} | ${s.nativeHeadings.toString().padStart(12)} | ${s.nonMapIframes.toString().padStart(14)} | ${s.italicCaptions.toString().padStart(17)} | ${s.mapIframes.toString().padStart(11)}${flagged ? '  ⚠' : ''}`,
      );
    }

    console.log('\n=== Krok C: sanity flags + štatistika ===');
    console.log(
      'idx | title'.padEnd(48) +
        '| blocks | imgs | cit | excerpt | flags',
    );
    console.log('-'.repeat(120));
    for (const s of summaries) {
      const t = s.title.slice(0, 40).padEnd(40);
      const flagsStr = s.sanityFlags.length ? s.sanityFlags.join(',') : '—';
      console.log(
        `${s.index.toString().padStart(3)} | ${t} | ${s.blocks.toString().padStart(6)} | ${s.images.toString().padStart(4)} | ${s.citations.toString().padStart(3)} | ${s.excerpt.toString().padStart(7)} | ${flagsStr}`,
      );
    }

    console.log(`\n[ok] dry-run report: ${reportPath}`);
    return;
  }

  // ---------- SINGLE MODE: --post=<path> --comments=<path> ----------
  if (!existsSync(POST_PATH)) {
    console.error(`[err] post feed not found: ${POST_PATH}`);
    process.exit(1);
  }
  const feed = JSON.parse(readFileSync(POST_PATH, 'utf8'));
  const entry = feed.feed?.entry?.[0];
  if (!entry) {
    console.error('[err] feed has no entry');
    process.exit(1);
  }

  let commentsData = { count: 0, items: [] };
  // Comments: preferuj explicitne dodaný --comments path, inak online fetch
  // cez entry.link[rel=replies]. Fallback na default data/comments.json je
  // NEBEZPEČNÝ pri label-feed extrakcii kde data/comments.json patrí inému
  // článku — preto fallback len ak je daný explicitne args.comments.
  const explicitCommentsPath = args.comments != null;
  if (explicitCommentsPath && existsSync(COMMENTS_PATH)) {
    const cj = JSON.parse(readFileSync(COMMENTS_PATH, 'utf8'));
    commentsData = parseCommentsFeed(cj);
  } else {
    const repliesLink = entry.link?.find((l) => l.rel === 'replies')?.href;
    if (repliesLink) {
      try {
        const url = repliesLink.includes('?') ? `${repliesLink}&alt=json` : `${repliesLink}?alt=json`;
        const cj = await fetchJson(url);
        commentsData = parseCommentsFeed(cj);
        console.log(`     comments: fetched ${commentsData.count} from ${repliesLink}`);
      } catch (e) {
        console.warn(`  [warn] comments fetch failed: ${e.message}`);
      }
    }
  }

  const output = buildOutputForEntry(entry, commentsData, POST_PATH);
  const outFile = resolve(OUT_DIR, `${output.blogPost.slug}.intermediate.json`);
  writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf8');

  const bp = output.blogPost;
  const ch = output.$meta.checks;
  const stats = {
    totalBlocks: bp.blocks.length,
    richTextBlocks: bp.blocks.filter((b) => b.__component === 'content.rich-text').length,
    imageBlocks: bp.blocks.filter((b) => b.__component === 'content.image-block').length,
    galleries: bp.blocks.filter((b) => b.__component === 'content.image-gallery').length,
    galleryImages: bp.gallery.length,
    citations: bp.citations.length,
    commentCount: output.$meta.commentCount,
  };

  console.log(`[ok] ${basename(outFile)}`);
  console.log(`     title: ${bp.title}`);
  console.log(`     slug:  ${bp.slug}`);
  console.log(`     stats: ${JSON.stringify(stats)}`);
  console.log(
    `     location: ${bp.location ? `${bp.location.name} (${bp.location.latitude}, ${bp.location.longitude}) / region=${bp.location.region} / country=${bp.location.country}` : 'NONE'}`,
  );
  console.log(`     cover: ${bp.coverImage ? bp.coverImage.filename : 'NONE'}`);
  console.log(`     sourceLabel: ${output.$meta.sourceLabel}`);
  console.log(`     checks: nativeHeadings=${ch.nativeHeadingCount} nonMapIframes=${ch.nonMapIframeCount} italicCaptions=${ch.italicCaptionCount} mapIframes=${ch.mapIframeCount}`);
  console.log(`     sanityFlags: ${output.$meta.sanityFlags.length ? output.$meta.sanityFlags.join(',') : '—'}`);
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});

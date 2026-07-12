# Blog migration pipeline — Hradiska.sk Blogger → Strapi

Kompletný popis pipeline z Blogger feedu do Strapi: dáta, transformácie, upload, publish, override-y, frontend integrácia. Tento dokument je úplnou náhradou pamäti Claude session — z neho má byť možné v akejkoľvek novej session pokračovať bez straty kontextu.

**Referenčné články (overené, plne funkčné vrátane sidebaru + gramatiky):** Wogastisburg, Staré Město – Velehrad
**Posledný update:** Júl 2026 (v6 — rozbíjanie zhlukov, sidebar-agenti, report)

---

## 0. KOMPLETNÝ PIPELINE (v6 — aktuálny, 6 fáz)

Toto je hlavný flow. Každá fáza má samostatný artefakt (audit stopa, rollback-safe). Detaily fáz nižšie v dokumente.

```
Fáza 1  extract.mjs        → out/<slug>.intermediate.json   (telo v dok. poradí + rytmus obrázkov, galéria, lokalita, komentáre, embed, sources)
Fáza 1b Manuálna štruktúra → quote-blocky (dobové pramene), názov lokality, kategória   (definuje CHRÁNENÉ ZÓNY pre gramatiku)
Fáza 2  Agent 1 (sidebar)  → out/<slug>.timeline.json        (timeline[] + keyFacts[], LEN zo zdroja, overené proti telu)
Fáza 3  Agent 2 (gramatika)→ out/<slug>.grammar.json         (before→after opravy, len pravopis, chránené zóny)
Fáza 4  Upload / re-upload → Strapi (POST alebo idempotentný PUT so zachovaním quote/embed/obrázkov)
Fáza 6  report.mjs         → out/<slug>.report.md            (ZÁVER: štatistika všetkého — koľko, z čoho do čoho)
```

**Príkazy (z `hradiska-strapi/`):**
```powershell
# Fáza 1 — extract (doc-order + rozbíjanie zhlukov, prah 800)
node scripts/blog-migrate/extract.mjs --post=scripts/blog-migrate/data/<post>.json

# Fáza 1b — manuálne: rozdeliť dobové citáty do quote-block, doplniť location.name, kategóriu (--category alebo default)

# Fáza 2 + 3 — sidebar + gramatika: spusti agentov (Claude subagenty) na telo (rich-text),
#   výsledky → out/<slug>.timeline.json + out/<slug>.grammar.json (LEN po schválení používateľom)

# Fáza 4 — upload (token z .env). Nový článok: upload.mjs. Re-upload s aplikáciou audit súborov:
#   GET živý → aplikuj grammar/timeline/keyFacts → PUT (zachová quote-blocky, embed, obrázky, galériu)
node scripts/blog-migrate/upload.mjs --input=out/<slug>.intermediate.json --dry-run=false

# Fáza 6 — report (záver)
node scripts/blog-migrate/report.mjs --slug=<slug> --feed=data/<post>.json
```

**Kľúčové pravidlá (invarianty celého pipeline):**
- **Rytmus obrázkov (Fáza 1):** obrázok do tela len ak od posl. obrázka v tele pribudlo ≥800 zn textu; zhluky sa „rozbíjajú" (defer-queue, captioned priorita) do neskorších medzier. **Nikdy stena** (max 1 obrázok za sebou). No-caption zhluky + overflow → galéria **s popisom**. Viď §17.
- **Dobové citáty = quote-block:** iba pôvodný dobový prameň (kronika/listina). Napr. Fulda „svätopluk odišiel…" ostáva **malými písmenami** (článok argumentuje malými písmenami originálu). Viď §18.
- **Agent 1 (sidebar):** timeline + keyFacts **LEN z textu článku**, žiadne externé znalosti; rok bez opory → `⚠ NEISTÝ`, nevymýšľať; pred zápisom **overiť každú zdrojovú vetu proti telu**. Viď §18.
- **Agent 2 (gramatika):** LEN pravopis, žiadne preformulovanie. Ochrana: **štrukturálna** (vidí len `content.rich-text`, quote-blocky nikdy) + **lexikálna** (`protected-terms.json`) + **pri pochybnosti nechať a označiť**. Viď §18.
- **Re-upload zachováva ručnú prácu:** quote-blocky, embed, obrázky, galéria, kategória, tagy sa pri PUT **nesmú stratiť** — payload sa stavia z GET živého článku, mení sa len čo treba.
- **Audit súbory** (`.timeline.json`, `.grammar.json`) sú oddelené od surového extraktu — rollback + prehľad. Token natrvalo v `.env` (§6.2).
- **Básne = quote-block, ale iný komponent:** centrovaný kurzívový beh ≥2 veršov → `content.poem` (nie `content.rich-text`, nie `quote-block`). Detekcia je automatická (pre-pass `markPoemRuns`), žiadny manuálny krok. Viď §20.
- **Zdrojová sekcia (Fáza 1) sa nesmie duplikovať v tele:** `content.sources`/citácie AJ trim z tela musia súhlasiť — over pri každom novom článku s "atribučným" markerom (Spracoval/Foto/Zdroj) uprostred väčšieho divu. `findInternalSourcesSplit` (kde sa zdroje začínajú) a `looksLikeSources` (čo sa z tela vystrihne) sú DVE oddelené funkcie s vlastným marker-setom — musia sa udržiavať ručne synchrónne. Viď §9.6, §9.8.
- **Pri redeployi (zmazať+nahrať nanovo) skontroluj `out/<slug>.overrides.json`:** ak existuje zo staršej session, `upload.mjs` ho aplikuje automaticky — môže niesť žiadanú kurátorskú prácu (cover/excerpt/vložené obrázky), ale môže kolidovať s novým dokumentovým poradím po fixoch v extract.mjs (napr. 2 obrázky na tej istej pozícii → riešiť cez `pairWithNext`, nie mazať override). Viď §9.10.

---

## 1. Architektúra pipeline

```
┌──────────────────────┐  HTTP/JSON  ┌───────────────────────┐  fs   ┌─────────────────────┐
│  Blogger Atom feed   │ ────────▶  │  Fáza 1: extract.mjs  │ ────▶ │ <slug>.intermediate │
│  hradiska.sk/feeds   │             │  (Node + cheerio)     │       │ .json (na disku)    │
└──────────────────────┘             └───────────────────────┘       └──────────┬──────────┘
                                                                                │
                                                                                ▼
┌──────────────────────┐  REST API  ┌───────────────────────┐  fs   ┌─────────────────────┐
│ Strapi 5 (sqlite,    │ ◀──────── │  Fáza 2: upload.mjs    │ ────▶ │ <slug>.payload.json │
│ port 1337, blog-post │            │  (download + POST/PUT)│       │ <slug>.upload-log   │
│ blog-comment, etc.)  │            └───────────────────────┘       └─────────────────────┘
└──────────┬───────────┘
           │ GET populate=*
           ▼
┌──────────────────────┐
│  React frontend      │
│  (Webdesignforhrad…) │
└──────────────────────┘
```

**Tri fázy:**

| Fáza | Skript | Vstup | Výstup | Status pre Blatnohrad |
|------|--------|-------|--------|----------------------|
| 0 | (manuálne) | URL Blogger feedu | Pochopenie štruktúry | ✓ hotové |
| 1 | `extract.mjs` | Blogger JSON feed | medzistupňový JSON | ✓ hotové |
| 2 | `upload.mjs` | medzistupňový JSON | Strapi DB záznamy | ✓ hotové |

---

## 2. Súborová štruktúra (relevantná pre migráciu)

```
hradiska-strapi/
├── .env                              # PORT=1337, DATABASE_FILENAME=.tmp/data.db
├── .tmp/data.db                      # SQLite — referenčný zdroj pravdy
├── public/uploads/                   # Strapi media library (binárky)
├── src/
│   ├── index.ts                      # Bootstrap: seed kategórií + Public permissions
│   ├── api/
│   │   ├── blog-post/                # collectionType
│   │   │   └── content-types/blog-post/schema.json
│   │   ├── blog-category/            # 6 predseedovaných kategórií
│   │   ├── blog-tag/                 # vytvárané pri uploade
│   │   └── blog-comment/             # public POST + admin moderation
│   │       ├── content-types/blog-comment/schema.json
│   │       ├── controllers/blog-comment.ts   # like / unlike / sanitize public POST
│   │       └── routes/blog-comment.ts        # CRUD + /like + /unlike
│   └── components/
│       ├── content/
│       │   ├── rich-text.json
│       │   ├── image-block.json     # position enum, width enum (30,40,50,60,100)
│       │   ├── image-gallery.json
│       │   ├── quote-block.json
│       │   └── embed.json           # youtube/sketchfab/vimeo/blogger
│       ├── sidebar/
│       │   ├── location.json        # lat, lng, name, region, country
│       │   ├── key-fact.json
│       │   └── timeline-event.json
│       └── shared/
│           └── quote.json
└── scripts/blog-migrate/
    ├── extract.mjs                   # Fáza 1
    ├── upload.mjs                    # Fáza 2
    ├── data/
    │   ├── post.json                 # single-post Blogger feed (Blatnohrad)
    │   ├── comments.json             # komentárový feed Blatnohrad
    │   ├── label-blatnohrad.json     # label feed (1 článok)
    │   └── label-najvyznamnejsie.json # label "Najvýznamnejšie hradiská" (13 článkov)
    └── out/
        ├── <slug>.intermediate.json  # Fáza 1 output, kontrolovateľný
        ├── <slug>.payload.json       # Fáza 2 dry-run output
        ├── <slug>.upload-log.json    # Fáza 2 real upload log
        └── _dry-run-report.json      # batch dry-run summary
```

**Frontend repo (samostatne):**
```
Webdesignforhradiskask/
├── src/components/
│   ├── CommentSection.tsx           # Strapi-backed komentáre s like/reply/threading
│   └── HistoricalGallery.tsx        # FB-style lightbox pre gallery
├── src/pages/ArticlePage.tsx        # Hero, telo, gallery, comments
├── src/lib/strapi.ts                # API helpers, populate config
└── src/hooks/useStrapi.ts           # useBlogPost hook
```

---

## 3. Strapi schémy

### 3.1 `api::blog-post.blog-post`

```jsonc
{
  "kind": "collectionType",
  "options": { "draftAndPublish": true },
  "attributes": {
    "title": "string required",
    "slug": "uid targetField=title required",
    "excerpt": "text maxLength=500",
    "coverImage": "media single images",
    "gallery": "media multiple images",        // VŠETKY obrázky článku (29 pre Blatnohrad)
    "category": "manyToOne → blog-category",
    "tags": "manyToMany → blog-tag",
    "authorName": "string",
    "featured": "boolean",
    "readingTime": "integer min=1",
    "metaTitle": "string maxLength=70",
    "metaDescription": "text maxLength=160",
    "originalPublishedDate": "datetime",        // pôvodný Blogger dátum (publishedAt je Strapi managed)
    "comments": "oneToMany → blog-comment",
    "quotes": "component shared.quote repeatable",
    "blocks": "dynamiczone [content.rich-text, content.image-block, content.quote-block, content.image-gallery, content.embed]",
    "location": "component sidebar.location",
    "keyFacts": "component sidebar.key-fact repeatable",
    "timeline": "component sidebar.timeline-event repeatable"
  }
}
```

### 3.2 `api::blog-comment.blog-comment`

```jsonc
{
  "kind": "collectionType",
  "options": { "draftAndPublish": false },
  "attributes": {
    "authorName": "string required maxLength=100",
    "authorEmail": "email",
    "authorProfile": "string maxLength=500",
    "content": "text required maxLength=5000",
    "approved": "boolean required default=false",     // moderation gate
    "likes": "integer min=0 default=0",
    "sourceBlogger": "boolean default=false",          // true pre importované z Bloggera
    "sourceBloggerId": "string maxLength=200",         // pre idempotency dedup
    "originalDate": "datetime",                        // pôvodný comment dátum
    "inReplyTo": "string maxLength=200",               // parent strapi documentId (threading)
    "post": "manyToOne → blog-post"
  }
}
```

### 3.3 Kľúčové komponenty

**`content.image-block`** — captioned image v tele článku:
- `image` (media), `alt`, `caption`
- `position` enum: `[left, right, center, full, breakout]` (✗ `full` nepoužívame)
- `width` enum: `[30, 40, 50, 60, 100]` (✗ `100` nepoužívame; používame `40/50/60`)
- `aspectRatio` enum: `[3:2, 16:9, 4:3, 1:1, 2:3, 9:16, 3:4, auto]`
- `pairWithNext` bool, `showCaption` bool, `rounded` bool, `shadow` bool

**`content.embed`** — YouTube/Sketchfab/Vimeo:
- `provider` enum: `[youtube, sketchfab, vimeo, blogger]` required
- `embedId`, `url`, `caption`

**`sidebar.location`** — lokalita pre mapu:
- `name` required, `latitude` float required, `longitude` float required
- `region` (len ak doslova v texte), `country` (default "Slovensko")

### 3.4 Public role permissions (cez `bootstrap` v `src/index.ts`)

```js
[
  'api::blog-post.blog-post.find', 'api::blog-post.blog-post.findOne',
  'api::blog-category.blog-category.find', 'api::blog-category.blog-category.findOne',
  'api::blog-tag.blog-tag.find', 'api::blog-tag.blog-tag.findOne',
  'api::aktualita.aktualita.find', 'api::aktualita.aktualita.findOne',
  'api::blog-comment.blog-comment.create',  // visitor POST
  'api::blog-comment.blog-comment.find',
  'api::blog-comment.blog-comment.findOne',
]
```

Plus custom routes `/blog-comments/:documentId/like` a `/unlike` majú `config.auth: false` (verejné bez Public role permission).

---

## 4. Fáza 0 — prieskum (referenčné fakty)

### 4.1 URL Blogger feedov

| Účel | URL |
|------|-----|
| Single post (Blatnohrad) | `http://www.hradiska.sk/feeds/posts/default/-/Blatnohrad%20%20-%20Pribinovo%20s%C3%ADdlo%20v%20Pan%C3%B3nii%20%28H%29?alt=json&max-results=1` |
| Komentáre k postu | `http://www.hradiska.sk/feeds/<numericPostId>/comments/default?alt=json` (numericPostId = posledný segment `entry.id.$t`) |
| Label batch | `http://www.hradiska.sk/feeds/posts/default/-/<URL-encoded-label>?alt=json&max-results=500` |
| Replies link priamo | `entry.link[rel=replies].href` |

### 4.2 HTML struktúra v `entry.content.$t`

| Element | Význam | Pattern |
|---------|--------|---------|
| `<div style="text-align: justify;">` | Odstavec | wrapper |
| `<div class="MsoNormal">` | Prvý odstavec (MS Word artefakt) | wrapper, často s `<iframe>` mapy |
| `<table class="tr-caption-container">` | Obrázok s popisom | `<tr><td><a><img></a></td></tr><tr><td class="tr-caption">CAPTION</td></tr>` |
| `<div class="separator">` | Obrázok bez popisu | `<a href=".../s1600/..."><img src=".../s320/..."></a>` |
| `<iframe src="...maps.google.com/?...ll=LAT,LNG">` | Mapa polohy | `ll=` query param → location |
| `<iframe src="...youtube.com/embed/ID">` | Video | → `content.embed` |
| `<b>NÁZOV</b>` v solo divu | H2 medzinadpis | žiadny `<h2>` priamo |

**Plné rozlíšenie obrázka:** vždy v `<a href=".../sNUMBER/..."`. `<img src>` má `/s320/` (thumbnail). My ho rewritujeme na `/s0/` (originál) s fallbackom na `/s1600/`.

### 4.3 Komentárový feed štruktúra

```jsonc
{
  "id": { "$t": "tag:blogger.com,1999:blog-X.post-NUMERIC" },
  "published": { "$t": "ISO8601 with TZ" },
  "author": [{ "name": { "$t": "..." }, "uri": { "$t": "https://blogger.com/profile/..." } }],
  "content": { "type": "html", "$t": "<HTML>" },
  "thr$in-reply-to": { "href": "http://www.hradiska.sk/.../<post-url>.html" },  // VŽDY URL ČLÁNKU, nie parent komentár!
  "link": [
    { "rel": "edit", ... },
    { "rel": "self", ... },
    { "rel": "alternate", ... },
    { "rel": "related", "href": ".../comments/default/<PARENT_NUMERIC_ID>" }  // ← TU je threading info!
  ]
}
```

**Threading:** `thr$in-reply-to.href` ukazuje na článok (nepoužiteľné). `link[rel=related].href` posledný segment = **parent comment Blogger ID**. Funguje len pre top-level komentáre s 1 reply (prípad Orgon→Jusuf).

---

## 5. Fáza 1 — `extract.mjs` (detail)

### 5.1 CLI

```powershell
# Single post mode
node scripts/blog-migrate/extract.mjs `
  --post=scripts/blog-migrate/data/post.json `
  --comments=scripts/blog-migrate/data/comments.json `
  --out=scripts/blog-migrate/out

# Batch dry-run cez label feed (Krok A v Fáze 1b)
node scripts/blog-migrate/extract.mjs `
  --label=scripts/blog-migrate/data/label-najvyznamnejsie.json
# Stiahne komentáre per article (fetch), generuje out/<slug>.intermediate.json pre každý
# + out/_dry-run-report.json so súhrnnou tabuľkou Krok B + Krok C
```

### 5.2 Output JSON štruktúra

```jsonc
{
  "$meta": {
    "sourceFeed": "<absolute path>",
    "sourceLabel": "Blatnohrad  - Pribinovo sídlo v Panónii (H)",  // label s (H) suffix
    "postId": "tag:blogger.com,1999:blog-X.post-Y",
    "bloggerPostUrl": "http://www.hradiska.sk/2011/05/blatnohrad-...html",
    "repliesLink": "http://www.hradiska.sk/feeds/<id>/comments/default",
    "extractedAt": "ISO8601",
    "coverImageNeedsReview": true,
    "commentCount": 5,
    "comments": [
      {
        "id": "tag:blogger.com,1999:blog-X.post-Y",
        "bloggerPostId": "<numeric>",
        "author": "Lukas",
        "authorProfile": "https://blogger.com/profile/...",
        "published": "ISO8601",
        "content": "<HTML>",
        "inReplyToArticle": "http://www.hradiska.sk/...",  // ALWAYS článok URL — nepoužiteľné
        "replyToBloggerId": "<numeric parent ID alebo null>",  // ← threading
        "replyToFeedHref": "<full related href>"
      }
    ],
    "checks": {                  // Krok B: edge-case detekcia
      "nativeHeadings": [],     // <h2>/<h3>/<h4> priamo (treba doplniť parser)
      "nativeHeadingCount": 0,
      "mapIframeCount": 1,       // ≠1 = problém (0 alebo viac máp)
      "mapIframeSrcs": [...],
      "nonMapIframeCount": 0,    // YouTube/Sketchfab → content.embed
      "nonMapIframeSrcs": [],
      "italicCaptionCount": 0,   // <i>/<small> caption pod img (treba doplniť)
      "totalImages": 29,         // <a> + <img>
      "captionedImages": 12,     // tr-caption-container
      "separatorImages": 17      // div.separator
    },
    "sanityFlags": []            // Krok C: zeroBlocks, zeroImages, zeroCitations, shortExcerpt, longRichText, noLocation, multipleMapIframes, hasNativeHeadings, hasNonMapIframes, hasItalicCaptions
  },
  "blogPost": {
    "title": "Blatnohrad  - Pribinovo sídlo v Panónii",
    "slug": "blatnohrad-pribinovo-sidlo-v-panonii",
    "excerpt": "...",
    "authorName": "Orgon",
    "publishedAt": "2011-05-09T21:40:00+02:00",
    "originalPublishedDate": "2011-05-09T21:40:00+02:00",
    "updatedAt": "2019-02-21T...",
    "readingTime": 9,
    "featured": false,
    "coverImage": { /* imageRef */ },
    "gallery": [                  // VŠETKY obrázky článku, dedup cez sourceUrl
      {
        "sourceUrl": ".../s0/mapa.jpg",
        "fallbackUrl": ".../s1600/mapa.jpg",
        "filename": "mapa.jpg",
        "blogger": { "anchorHref": "...", "displayedWidth": 320, "displayedHeight": 236, "originalWidth": null, "originalHeight": null },
        "caption": "Predpokladaný rozsah Koceľovho panstva..."  // ← null pre no-caption
      }
    ],
    "tags": ["Najvýznamnejšie hradiská"],   // sourceLabel `(H)` filtrovaný preč
    "category": null,                        // manuálne v admin
    "location": {
      "name": "Zalavár",
      "latitude": 46.660755,
      "longitude": 17.1382,
      "region": null,             // LEN ak doslova v texte (Fáza 0 #4)
      "country": "Maďarsko"       // hľadáme `v/na {Stem}u` lokatív
    },
    "keyFacts": [], "timeline": [], "quotes": [],  // manuálne v admin
    "blocks": [
      {
        "__component": "content.rich-text",
        "body": [
          { "type": "paragraph", "children": [{ "type": "text", "text": "..." }] },
          { "type": "heading", "level": 2, "children": [{ "type": "text", "text": "..." }] }
        ]
      },
      {
        "__component": "content.image-block",
        "imageRef": { /* viď gallery */ },
        "alt": "...", "caption": "...",
        "position": "right",       // left/right/center (NIE full)
        "width": "50",             // 40/50/60 (NIE 100)
        "aspectRatio": "auto", "showCaption": true, "rounded": true, "shadow": true
      }
    ],
    "citations": [
      { "type": "internal-link" | "external-url" | "book" | "attribution",
        "url": "...", "title": "...", "text": "..." }
    ]
  }
}
```

### 5.3 Hlavná pipeline `buildOutputForEntry(entry, commentsData, sourceFeedPath)`

1. **Slugify title** (`normalize NFD` → odstrániť diakritiku → lowercase → kebab)
2. **Cheerio load** plain (`cheerio.load(html)`) — wraps v `<html><body>` sám
3. **`buildBlocksFromBody($, bodyRoot)`** → `{ mainBlocks, galleryRefs, sourceDivs, sourcePostLines }`
4. **Citácie** zo `sourceDivs` + optional `sourcePostLines` (internal split case)
5. **Posledný rich-text blok** "Zdroje a literatúra" pripojený, ak citations.length > 0
6. **CoverImage** = prvý image-block z mainBlocks (alebo prvý gallery image)
7. **Gallery** = dedup cez sourceUrl:
   - cover image
   - každý captioned image-block z mainBlocks (s caption)
   - každý no-caption gallery ref od orchestrátora (caption: null)
8. **Location** z `<iframe[src*=maps.google.com]>` (parse `ll=LAT,LNG`)
9. **Excerpt** = prvý zmysluplný `<div>` z `bodyRoot.children('div')` po **odstránení iframe/img/table/separator** child elementov, max 250 znakov
10. **ReadingTime** = ceil(words / 200), min 1
11. **runChecks($, html)** + **runSanity(output, checks)**

### 5.4 `buildBlocksFromBody` — orchestrátor

Kľúčový algoritmus s pravidlami:

```
1. top-level children: <div> + <table.tr-caption-container> (oba!)
2. Pre každý: detekuj `sourcesStartIdx` cez `findInternalSourcesSplit(splitDivIntoLines(...))`
   - hľadá: bold "Preložili sme...", holú URL ako jediný riadkový text,
     alebo riadok s LEN internal hradiska.sk/search/label/ alebo hradiska.sk/YYYY/ anchormi
3. mainDivs = topLevel[0..sourcesStartIdx]
   sourceDivs = topLevel[sourcesStartIdx..]
4. Pre každý mainDiv volá convertDivToBlocks($, div, ctx)
   - ctx.captionedIdx = counter naprieč článkom pre layout rotáciu
5. PRAVIDLO pre image-blocks:
   - No-caption → do `galleryRefs` (no caption v tele)
   - Captioned → v tele LEN ak predošlý blok nebol image (žiadne 2+ za sebou),
     inak tiež do `galleryRefs`
6. ŽIADNE content.image-gallery bloky v tele (úplne preč)
```

### 5.5 `convertDivToBlocks($, el, ctx)` — single div/table

```
0. Ak el je <table>: vytvor image-block z neho, return
1. Tabuľky tr-caption-container vnútri → image-block-y (NIE early return!)
2. div.separator > a:has(img) vnútri → image-block-y (vrátane keď sú aj tabuľky)
3. iframe Google Maps → IGNORUJ (preč len zo step 5 paragraph)
   ⚠ NIE early return — text okolo iframu musí ostať!
4. Bold-only div → heading H2
5. Paragraph (po $clone.find('iframe, img, table.tr-caption-container, div.separator').remove())
   - Rieši inline <b>, <i>, <a>, <br>
   - splitInlineByDoubleNewline na viac odstavcov
```

### 5.6 `pickLayoutForCaptioned(idx, ref)` — aspect-aware rotácia

```
aspect = original W/H || displayed W/H || 1

wide (≥1.6):    center 60 → right 60 → left 60  (ŽIADNY full)
landscape (≥1.2): right 50 → left 50 → right 40 → left 40 → center 60
square (≥0.85): right 40 → left 40 → right 50 → left 50
portrait (<0.85): right 40 ↔ left 40 (text vždy obteká)
```

Validné widths (schema enum): `30, 40, 50, 60, 100`. Používame **iba 40/50/60**.

### 5.7 Citácie — `classifyCitation($, divNode)` a `classifyCitationFromLines(lines)`

Pre každý zdrojový div alebo line set:
- `<a>` anchory → `internal-link` (hradiska.sk) alebo `external-url`
- `<b>` bold-text > 8 chars, neštart na `•` → `attribution`
- Plain text: regex `https?:\/\/\S+` → ďalšie `external-url`
- Zvyšný text ≥ 4 slová → `book` (alebo `attribution` ak match `/obr[áa]zk|prevzat|stv2|fotiek|orgo[nň]/i`)

Plus auto-pridaný heading "Zdroje a literatúra" v rich-text body.

---

## 6. Fáza 2 — `upload.mjs` (detail)

### 6.1 CLI

```powershell
# Default — dry-run (NIČ neposiela, len out/<slug>.payload.json)
node scripts/blog-migrate/upload.mjs

# Reálny upload — token sa načíta AUTOMATICKY z hradiska-strapi/.env (viď 6.2).
# Netreba $env:STRAPI_TOKEN ani --token, ak je STRAPI_TOKEN vyplnený v .env.
node scripts/blog-migrate/upload.mjs --dry-run=false

# Konkrétny článok (BEZPEČNÉ — spracuje len tento jeden súbor, neiteruje celý out/)
node scripts/blog-migrate/upload.mjs `
  --input=out/<slug>.intermediate.json `
  --category=<documentId>

# (Voliteľné) jednorazový override tokenu bez zápisu do .env:
#   $env:STRAPI_TOKEN = "<token>"   alebo   --token=<token>   (majú prednosť pred .env)
```

### 6.2 STRAPI_TOKEN — natrvalo v `.env` (auto-load cez dotenv)

**Token stačí nastaviť RAZ. Od tej chvíle každý upload beží automaticky, bez zadávania cez CLI/shell.**

Kde token žije: `hradiska-strapi/.env`, riadok `STRAPI_TOKEN=<hodnota>` (na konci súboru, sekcia „Blog migrácia"). Súbor je v `.gitignore` (riadok `.env`) → do gitu nepôjde. `upload.mjs` ho načíta sám na začiatku cez:

```js
import dotenv from 'dotenv';
dotenv.config({ path: resolve(__dirname, '..', '..', '.env') }); // → hradiska-strapi/.env
```

Poradie priority tokenu v skripte (`upload.mjs:48`): `--token=…` (CLI) → `process.env.STRAPI_TOKEN` (shell alebo .env) → `null`. dotenv **neprepíše** už existujúcu shell/CLI premennú.

**Ako token vytvoriť (len ak v `.env` ešte nie je alebo ho treba rotovať):**
Strapi admin → `Settings → API Tokens`. Buď **Regenerate** pri existujúcom tokene „blog-migrate", alebo **Create new token** (Token type: **Full access**, duration: **Unlimited**). Hodnota sa zobrazí **len raz** — okamžite skopíruj a vlož do `.env` za `STRAPI_TOKEN=`.

⚠ **Token sa z DB späť neprečíta** — `strapi_api_tokens` uchováva len hash (stĺpec `access_key`). V admin sa existujúci token dá len premenovať alebo **regenerovať** (nová hodnota, stará sa zneplatní), nie zobraziť. Preto: ak hodnota nie je v `.env`, treba regenerovať/vytvoriť novú.

**Overenie, že token v `.env` funguje (bez vypísania hodnoty):**
```powershell
node -e "require('dotenv').config({path:'.env'}); const t=process.env.STRAPI_TOKEN||''; fetch('http://localhost:1337/api/upload/files?pagination[pageSize]=1',{headers:{Authorization:'Bearer '+t}}).then(r=>console.log('token',r.status===200?'OK ✅':'CHYBA '+r.status))"
```

**Bezpečnosť:** token nikdy neposielaj do chatu ani do commitu. Ak sa niekedy dostane do chatu/logu, po použití ho **regeneruj** v admin (stará hodnota prestane platiť). User Hradiska má pravidlo „API kľúče/tokeny nezdieľať v chate" — vždy upozorni.

### 6.3 Krok-za-krokom flow `doRealUpload`

```
[1/5] Tag resolve (idempotentne cez SLUG, nie cez name)
  - slugify(name) → GET /api/blog-tags?filters[slug][$eq]=...
  - Ak exists → reuse documentId
  - Inak POST /api/blog-tags { name, slug }

[2/5] Load existing Media Library
  - GET /api/upload/files?pagination[page]=N&pageSize=100 (loop)
  - Snapshot before count z public/uploads/

[3/5] Download + upload obrázkov — multi-pass, continue-on-error
  Stratégia: 6 passes, medzi passmi re-fetch media library index
  Pre každý imageRef m:
    a) existingByName.get(m.filename) → REUSE existing id (žiadny download)
    b) downloadImage(s0 url, s1600 fallback) cez retry 3×
       - HTTP 404 → skús fallback /s1600/
       - Buffer < 1024 B → skús fallback
       - "fetch failed" → wait + retry (1.5s, 3s)
       - 3 fail → vráti null, item ide do nextRemaining
    c) sha256(buffer) → local dedup (rovnaký SHA v batch → reuse media id)
    d) strapiUploadFile(buf, name, mime, caption) cez retry 3× s Connection:close
       - fileInfo JSON: { caption, alternativeText, name } pre nové uploady
       - Po každom uploade `setTimeout(1000)` throttle (SQLite + thumbnaily)
       - 3 fail → wait 3s + nextRemaining
  Multi-pass: medzi pass refresh existingByName cez loadExistingMediaIndex()
  Ak po 6 passes ostávajú failed → throw "Upload incomplete"

[3b] Update metadata pre REUSE existing files čo dostali caption
  - Pre každý m s caption a action=reused-by-name
  - strapiUpdateFileMetadata(mediaId, caption) cez POST /api/upload?id=<id> s fileInfo

[4/5] Substitute <media-ref:N> placeholders → reálne media ids
  - Rekurzívna substitúcia v payload.data
  - tags placeholder _resolve:'pending' → { connect: [{ documentId: tagDocId }] }

[5/5] Idempotent POST/PUT
  - GET /api/blog-posts?filters[slug][$eq]=...&publicationState=preview
  - Ak existing → PUT /api/blog-posts/<documentId>
  - Inak POST /api/blog-posts

[6/6] Import komentárov (2-pass threading)
  Pass 1: create/reuse
    - Lookup cez bloggerPostId v sourceBloggerId field (numeric, nie full tag)
    - Pre nové: POST /api/blog-comments {
        authorName, content (stripped HTML), approved: true (Blogger schválené),
        sourceBlogger: true, sourceBloggerId: c.bloggerPostId,
        originalDate: c.published, post: <blog-post documentId>
      }
    - Mapuj: bloggerIdToDocId.set(bloggerPostId, strapiDocId)
  Pass 2: threading
    - Pre každý c s c.replyToBloggerId:
      - parentDocId = bloggerIdToDocId.get(c.replyToBloggerId)
      - myDocId = bloggerIdToDocId.get(c.bloggerPostId)
      - PUT /api/blog-comments/<myDocId> { inReplyTo: parentDocId }

[Verify] GET /api/blog-posts?filters[slug][$eq]=...&populate=*
  - Vypíš documentId, blocks count, blockCounts, coverImage, gallery, category, tags, location
  - Spočítaj public/uploads/ files after vs before (diff = nové uploady)
  - Zapíš out/<slug>.upload-log.json s kompletným záznamom
```

### 6.4 `MediaRegistry` — dedup + caption tracking

```js
register(ref, usedAs, caption) {
  key = ref.sourceUrl
  if !exists: create { index, ref, usedAs:[], caption: caption || ref.caption || null }
  else if caption && !existing.caption: existing.caption = caption  // obohatenie
  entry.usedAs.push(usedAs)
  return index
}
placeholder(index) → "<media-ref:N>" string
```

Cover, image-block, gallery items volajú `register` s rovnakou `sourceUrl` → dedup. Caption sa "obohacuje" — ak prv prišlo bez (cover), neskôr s (block), nastaví sa.

### 6.5 Idempotentné správanie

| Veci | Idempotent kľúč | Kolízia handling |
|------|----------------|------------------|
| blog-post | `slug` | PUT na documentId |
| blog-tag | `slug` (slugified name) | reuse documentId |
| blog-comment | `sourceBloggerId` (bloggerPostId numeric) | skip s "REUSE" log |
| media file | `filename` v Media Library | reuse media id, optional caption update |
| media SHA-256 (in-batch) | content hash | reuse last id v rovnakom behu |

### 6.6 Známe edge cases / fixy v `upload.mjs`

| Problém | Fix | Riadky |
|---------|-----|--------|
| Undici socket drop pri uploade | `Connection: close` header + 1000ms throttle | `strapiUploadFile` |
| Strapi spadne pri concurrent thumbnail gen | 1s sleep medzi uploadmi, 3s po fail | processItem |
| Blogger /s0/ vráti 404 alebo prázdny | Fallback /s1600/ | downloadImage |
| Token v shell history | Cez `$env:STRAPI_TOKEN` env var, nie inline arg | docs |
| API token chýba → 403 | `--token=<value>` alebo `STRAPI_TOKEN` env | parseArgs |
| Public role create blocked | Token-authenticated path v controlleri | blog-comment.ts |

### 6.7 ⚠ Otvorené obmedzenie — manual overrides sa prepíšu pri PUT

Aktuálne `upload.mjs` pri PUT posiela kompletný `data` z intermediate JSON → **prepíše custom cover/excerpt** ktoré si manuálne nastavil cez admin.

**Workaround pre Blatnohrad:** po každom upload behu manuálne PUT-ni cover a excerpt:
```js
fetch('http://localhost:1337/api/blog-posts/gl8j9bym0c322wqg15l6t7lb', {
  method: 'PUT', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: {
    coverImage: 38,  // blatnohrad-rekonstrukcia-letecky.png
    excerpt: 'V roku 2009 sa pri Zalaváre vykopal črep s hlaholským nápisom — najstarší zachovaný v slovanskom svete. Nie je vylúčené, že ho písal samotný Metod, ktorý sa tu zdržiaval pol roka.'
  }})
})
```

**TODO pre škálovanie na 13+ článkov:** pridať `overrides.json` mechanizmus do `upload.mjs`:
- `out/<slug>.overrides.json` voliteľný súbor s `{ excerpt?, coverImageMediaId?, ... }`
- Pred PUT: `Object.assign(finalData, overrides)` ako finálny krok
- Pri batch import-e môžeš pre každý článok pripraviť overrides bez bránenia auto-flow

---

## 7. Frontend integrácia

### 7.1 Strapi populate query (`src/lib/strapi.ts:201`)

```
filters[slug][$eq]=<slug>
&populate[0]=coverImage
&populate[1]=gallery
&populate[2]=category
&populate[3]=tags
&populate[4]=quotes
&populate[5]=blocks.image       ← dôležité pre image-block.image
&populate[6]=blocks.images      ← pre image-gallery (ak by sa pridali späť)
&populate[7]=blocks.secondImage
&populate[8]=location
&populate[9]=keyFacts
&populate[10]=timeline
```

⚠ `populate=*` v Strapi 5 je **plytké** — neukazuje obrázky v `blocks` komponentoch. Nutné explicitné populate.

### 7.2 `ArticlePage.tsx` — kľúčové miesta

```tsx
// Strapi post fallback alebo Mock article
const mockArticle = mockArticles.find((a) => a.slug === articleSlug);
const article = mockArticle || (strapiPost ? {
  ...convertStrapiPostToArticle(strapiPost),
  // FE-specific transformations:
  images: strapiPost.gallery?.map(img => ({
    url: getStrapiImageUrl(img),
    caption: img.caption || img.alternativeText || ''
  })) || [],
  gallery: (strapiPost.gallery || []).map(img => ({  // ← VŠETKY obrázky tu
    url: getStrapiImageUrl(img),
    caption: img.caption || img.alternativeText || '',
    alt: img.alternativeText || img.caption || '',
  })),
  quotes: strapiPost.quotes || [],
  blocks: strapiPost.blocks || [],
  bibliography: [],
} : null);

// HistoricalGallery — LEN article.gallery (žiadny block extraction, žiadny coverImage dup)
{(article.gallery || []).length > 0 && (
  <HistoricalGallery images={article.gallery} title="Fotogaléria" />
)}

// CommentSection — postDocumentId pre Strapi backed komentáre
<CommentSection postDocumentId={strapiPost?.documentId} />
```

### 7.3 `CommentSection.tsx` — features

**Fetch** (`GET /api/blog-comments?filters[post][documentId][$eq]=<docId>&sort[0]=originalDate:desc&sort[1]=createdAt:desc&pagination[pageSize]=100`):
- Controller filtruje `approved=true` pre Public role (admin vidí všetky)
- `buildCommentTree(flat)` zostaví nested štruktúru cez `inReplyTo` → documentId

**Submit nový komentár** (`POST /api/blog-comments` s `{ data: { authorName, authorEmail?, content, post: docId, inReplyTo?: replyingToDocId } }`):
- Controller force-sanitizuje pre public: `approved: false, sourceBlogger: false`
- Pre token-authenticated requesty (migrácia) povolí ľubovoľné polia

**Like toggle**:
- Klik na ThumbsUp:
  - Ak nie liked: optimistic +1, POST `/api/blog-comments/<docId>/like`, `localStorage.hradiska:liked-comments.add(docId)`
  - Ak liked: optimistic -1, POST `/api/blog-comments/<docId>/unlike`, `localStorage.delete(docId)`
- Server response zafixuje finálnu hodnotu cez `setLikesInTree`
- Network error → rollback (delta vrátený, localStorage vrátený)
- `aria-pressed={liked}`, tooltip "Páči sa mi" / "Zrušiť reakciu"

**Reply**:
- Klik "Odpovedať" → `setReplyingTo({ docId, author })`, scroll k formuláru
- Formulár: nadpis "Odpovedať na <Author>", banner "Odpovedáte na komentár od X.   [Zrušiť]", border highlight
- Submit pošle `inReplyTo: replyingTo.docId` — controller propaguje (vo whitelist)

### 7.4 `HistoricalGallery.tsx` — Facebook-style lightbox

- Grid plochých kariet (`grid-auto-rows-fr`, hover scale)
- Klik → portal-rendered fullscreen lightbox cez `createPortal(<Lightbox>, document.body)` (vďaka transform/filter parent stacking context)
- Image stage (flex:1) + side panel (avatar Hradiská.sk, caption, count, action bar Like/Comment/Share, comments mock-data, input)
- Klávesnica: ESC / ← / → / klik na overlay
- Mobile: stack vertikálne pri `<768px`
- Caption ide priamo z `image.caption` (Strapi media field)

---

## 8. Aktuálny stav Blatnohrad v DB

### 8.1 Strapi blog-post
- **documentId:** `gl8j9bym0c322wqg15l6t7lb`
- **slug:** `blatnohrad-pribinovo-sidlo-v-panonii`
- **title:** "Blatnohrad - Pribinovo sídlo v Panónii" (single space po normalize)
- **excerpt:** "V roku 2009 sa pri Zalaváre vykopal črep s hlaholským nápisom — najstarší zachovaný v slovanskom svete. Nie je vylúčené, že ho písal samotný Metod, ktorý sa tu zdržiaval pol roka."
- **coverImage:** `blatnohrad-rekonstrukcia-letecky.png` (media id=38)
- **gallery:** 29 items (13-37 z prvého kola + 38 nový cover + 39-42 z druhého kola fixov)
- **blocks total:** ~35 (~24 rich-text + ~10 image-block, 0 image-gallery v tele)
- **category:** `Kniežacie sídla` (documentId `l148rpkbsf47iy63jb0afpwn`)
- **tags:** ["Najvýznamnejšie hradiská"] (documentId `am3leyengmwiod0tw6ynnx5o`)
- **location:** Zalavár, 46.660755, 17.1382, country=Maďarsko, region=null
- **originalPublishedDate:** 2011-05-09T19:40:00Z (UTC z +02:00)
- **publishedAt:** Strapi managed (dnes)
- **comments:** 5 (Lukas, Anonymous 2018, Orgon→Jusuf threading, Jusuf, Anonymous 2013)

### 8.2 Strapi blog-comment threading
- Orgon `documentId=vj03hx0spfzahni4saywr1g1` má `inReplyTo=kk1coyvg7kf7t54t4gla40r6` = Jusufov documentId

### 8.3 6 existujúcich blog-category (NEVYTVÁRAJ duplicitne)
| Name | Slug | DocumentId |
|------|------|-----------|
| Kniežacie sídla | `kniezacie-sidla` | `l148rpkbsf47iy63jb0afpwn` |
| Mocenské centrá | `mocenske-centra` | `iei9y9c9x3fd4yy1z6uz6osz` |
| Strážna funkcia | `strazna-funkcia` | `xl5emzcwsvq6m9hzy66avvmt` |
| Refugiá | `refugia` | `ju7qzoselv8vtk40oiddwps8` |
| Staroveké sídla | `staroveke-sidla` | `pc1i0qyu1ghzecz9ntunboof` |
| Ostatné | `ostatne` | `vophy6w40xd2rak2z5hr55yg` |

### 8.4 Strapi runtime
- Port: **1337**
- Admin: `http://localhost:1337/admin`
- Email: `hradiskastrapi@gmail.com` (heslo cez `npx strapi admin:reset-user-password --email=...`)
- DB: SQLite `.tmp/data.db` (~1.2 MB)
- Media Library: `public/uploads/` (167+ súborov vrátane thumbnaily)

---

## 9. Známe problémy + ich príčiny + fixy (historický záznam)

### 9.1 Cheerio chyby

| Problém | Symptom | Príčina | Fix |
|---------|---------|---------|-----|
| Cheerio body parse | `body.children('div').length === 0` | `cheerio.load('<body>HTML</body>', null, false)` | Použiť `cheerio.load(html)` default — wraps html/body sám |
| NBSP whitespace | `replace(/ /g, ' ')` no-op | Blogger ukladá `&nbsp;` ako entity, cheerio dekóduje na ` ` | Regex `/[ \s]+/g` |

### 9.2 Bugy v `extract.mjs` (všetky vyriešené)

| # | Bug | Symptom | Fix riadky | Status |
|---|-----|---------|-----------|--------|
| 1 | Country false positive | `Slovenský` (adjektívum) trafil stem | Stem patterns → locatívne `\b(?:v|na)\s+{Stem}u\b` | ✓ |
| 2 | Excerpt skip pri iframe | Prvý odsek skip ak má `<iframe>` | `$clone.find('iframe,img,table').remove()` pred plain text | ✓ |
| 3 | Sources detection cez celý div | Posledný obsahový odsek išiel do citations | Internal-split cez `splitDivIntoLines` + `findInternalSourcesSplit` (line-level) | ✓ |
| 4 | `tables.length === 0` blocker | Separators v divoch s tables stratené | `if (separators.length > 0)` bez tables condition | ✓ |
| 5 | Early return po tables | `if (plainText < 30) return blocks` zahodil separators | Odstránený early return | ✓ |
| 6 | Top-level `<table>` ignorovaný | `bodyRoot.children('div')` vynechalo solo tables | `children().filter(div OR table.tr-caption-container)` + `convertDivToBlocks` rozpoznáva `tagName === 'table'` | ✓ |
| 7 | iframe Maps early return | Prvý odsek (text + mapa) stratený | Odstránený early return v step 3 — paragraph step klonuje a `.remove('iframe')` | ✓ |
| 8 | image-gallery dlhé série | 5+8 obrázkov v rade | Max 4 per gallery — neskôr úplne preč z tela | ✓ |
| 9 | Full layout dominantný | `position: full` často | Aspect-aware rotácia bez `full` | ✓ |
| 10 | No-caption v tele | Stĺpce obrázkov bez textu | Presun do top-level `gallery` field | ✓ |
| 11 | Width 45/55 invalid | `ValidationError: must be one of [30,40,50,60,100]` | Rotácia len 40/50/60 | ✓ |

### 9.3 Strapi crashes počas uploadu

| Pri čom | Príčina | Mitigation |
|---------|--------|-----------|
| 2-3 obrázky za sebou | Undici socket drop | Connection:close + 1s throttle + 3s po fail |
| Veľký PNG (11.5 MB) | Thumbnail generation timeout | Continue-on-error multi-pass, manuálny reštart cez `npm run develop` |
| Concurrent metadata updates | SQLite lock | Serial loop pre captionUpdates |

**Reštart Strapi:** `Stop-Process -Id <PID> -Force` (PowerShell) alebo `taskkill /F /PID <PID>`, potom `npm run develop` v `hradiska-strapi/`. Wait kým `curl http://localhost:1337/_health` vráti 204.

### 9.4 Bugy v `upload.mjs` (vyriešené)

| Bug | Fix |
|-----|-----|
| `__publicField is not defined` (esbuild helper z lightgallery) | Polyfill v `main.tsx` + `optimizeDeps.esbuildOptions.target: 'esnext'` v `vite.config.ts` — vlastne to bolo frontend issue, riešené odstránením lightgallery |
| Strapi 5 publishedAt managed | Pridať `originalPublishedDate` datetime field |
| Public role 403 na POST | Vyžaduje API token Full Access |
| Custom route `/like` 405 | Strapi 5 nezlučuje samostatné route files — manuálne `routes/blog-comment.ts` so všetkými CRUD + custom |
| TS error v controlleri (spread filters) | `q.filters = (q.filters && typeof q.filters === 'object' ? q.filters : {}) as Record<string, any>` |
| Reply approved:true visitor pokúsi | Controller force `approved: false` pre non-token auth |

### 9.5 Frontend bugy (vyriešené)

| Bug | Fix |
|-----|-----|
| Tlačidlo Like disabled po prvom kliku | Odstránený `disabled={liked}`, klik toggle cez `/unlike` |
| `populate=*` plytké, blocks.image chýba | Explicitné `populate[5]=blocks.image` |
| ImageWithFallback absolute conflict | `position: relative` na obale, `absolute inset-0 w-full h-full object-cover` na img |
| Lightbox containing block (transform v parent) | `createPortal(<Lightbox>, document.body)` |
| Mock comments hard-coded | `CommentSection` fetchuje cez `STRAPI_URL` + `postDocumentId` prop |
| Dlhé URL v komentári pretekali cez box | `overflowWrap: 'anywhere'` na `<p>` s `comment.content` (`CommentSection.tsx`) |
| `location.name` sa zobrazoval malými písmenami ("Mys arkona, rujana") | `ArticleSidebar.tsx` robil `charAt(0).toUpperCase() + slice(1).toLowerCase()` na celý viacslovný názov — Strapi dáta sú už správne, transform úplne odstránený |

### 9.6 Sources-split trim loop — 2 bugy (Arkona, vyriešené v6.1)

Zdrojová sekcia (Fáza 1) sa v tele nesmie duplikovať — `content.sources` sa stavia z `sourcePostLines`, ale telo (`mainDivs`/internal-split `produced`) musí tie isté riadky **vystrihnúť** cez `looksLikeSources` heuristiku v `buildBlocksFromBody`. Pri Arkone zlyhala dvojnásobne:

| # | Bug | Symptom | Fix |
|---|-----|---------|-----|
| 1 | `looksLikeSources` URL regex vyžadoval doslovné `https?://` | Blogger preklep bez dvojbodky (`http//pospolitost.wordpress.com/...`) nezhodol regex → trim slučka sa zastavila **na poslednom bloku** a nič nevystrihla (Spracoval/bibliografia/2×URL ostali duplicitne v tele AJ v `content.sources`) | Dvojbodka voliteľná: `https?:?\/\//` — rovnaká zmena aj v `classifyCitation`/`classifyCitationFromLines` (URL sa navyše normalizuje, dvojbodka sa doplní späť pri uložení) |
| 2 | Extrakcia textu v trim slučke čítala `c.text` priamo | `type:'link'` deti (odkazy) majú text v `c.children[0].text`, nie `c.text` — glejnutý odkaz na konci odseku (`"...Praha 2002"` + `<a>http://www.sho.sk/</a>`) bol pre kontrolu "neviditeľný", takže `looksLikeSources` vrátilo `false` aj keď blok reálne obsahoval URL | Extrakcia berie `c.url` (skutočný href) namiesto zobrazeného textu odkazu pre link-type deti |

Regresne overené na Blatnohrad/Mikulčice/Velehrad/Wogastisburg — identické počty blokov/citácií pred aj po (0 zmien).

### 9.7 Komentáre — nedekódované HTML entity (Arkona, vyriešené)

`upload.mjs` pri importe komentárov (Pass 1) čistil HTML tagy a `&nbsp;`, ale nedekódoval ostatné entity (`&quot;`, `&amp;`, `&lt;`, `&gt;`, `&#39;`...) — v texte ostávalo napr. `pre memosk29&quot;Podivne...&quot;` namiesto skutočných úvodzoviek.

**Fix:** `decodeHTML` z balíka `entities` (tranzitívna závislosť cheeria, netreba pridávať do `package.json` — rovnaký prístup ako `dotenv`). `decodeHTML` dekóduje `&nbsp;` na skutočné U+00A0, preto sa ešte normalizuje späť na bežnú medzeru (`.replace(/ /g, ' ')`), konzistentne s `NBSP_RE` v `extract.mjs`.

```js
import { decodeHTML as decodeHtmlEntities } from 'entities';
const cleanText = decodeHtmlEntities((c.content || '').replace(/<[^>]+>/g, ''))
  .replace(/ /g, ' ')
  .trim();
```

**Fix je len pre budúce importy** (nový komentár cez Pass 1 create). Už zmigrované komentáre s entitami sa neopravia automaticky pri re-uploade (Pass 1 ich cez `sourceBloggerId` len REUSE-uje, netýka sa ich). Audit naprieč všetkými 6 vtedy živými článkami napočítal **14/57** postihnutých komentárov — opravené jednorazovo cieleným `PUT /api/blog-comments/<documentId>` (len `content`, nedotklo sa `documentId`/likes/threadingu). Ak sa objavia ďalšie staré komentáre s entitami (napr. po dokončení zvyšných 11 článkov), rovnaký jednorazový patch-skript zopakovať.

### 9.8 Sources-split trim loop — 3. bug: bold/atribučné markery (Blatnohrad, vyriešené v6.1)

Rovnaká rodina ako §9.6, iný spúšťač. `looksLikeSources` (trim v tele) poznala len `zdroj:/pramen:/literatúra:` a `https?://`, ale nezrkadlila **všetky** markery, ktoré `findInternalSourcesSplit` (rozhoduje KDE sa zdroje začínajú) už uznáva — bold "Preložili sme", `spracoval/autori/prebral/prevzaté:`, fráza "prevzatý z/preložené z". Blatnohradova 116-znaková intro veta k zdrojom ("**Preložili sme pre Vás odborné články...**") nezhodla ani jeden z troch pôvodných trim-markerov (nie je URL, nie je `zdroj:`, dlhšia než 30 znakov) → ostala duplicitne v tele aj v `content.sources`.

**Fix:** trim-check rozšírený o rovnaký marker-set ako `findInternalSourcesSplit` (bold "Preložili sme", atribučné prefixy, "prevzatý/preložené z" fráza) — obe funkcie teraz musia zhodnúť rovnaký začiatok zdrojov, inak sa split a trim rozídu. Regresne overené na Mikulčice/Velehrad/Wogastisburg/Arkona (0 zmien).

**Poučenie pre budúce články:** ak sa objaví duplicita zdrojov aj po tomto fixe, over najprv `findInternalSourcesSplit` (§ vyššie v extract.mjs) vs. `looksLikeSources` (trim) — sú to DVE oddelené funkcie s vlastnými zoznamami markerov, ktoré sa musia ručne udržiavať synchrónne. Bezpečnejší dlhodobý fix (zatiaľ neurobený) by bol zdieľať jeden marker-set.

#### 9.8b Sources-trim, 4.–5. bug: obrázok v strede zdrojov + neúplný "foto:" marker (Nitra, vyriešené v6.1)

Nitra má sources sekciu s **vloženým obrázkom uprostred** citačných riadkov (autor dal fotku medzi dva odkazy). Pôvodná trim-slučka bola jednoduchý `while(pop)` od konca poľa, ktorý sa **zastavil na prvom nie-rich-text bloku** (`if (last.__component !== 'content.rich-text') break;`) — takže keď narazila na ten vložený obrázok, prestala trimovať, a všetky zdrojové rich-text bloky PRED obrázkom ostali v tele.

**Fix:** nahradený dvojfázovým backward-scanom (`isSourceLikeRichText` + cyklus zisťujúci hranicu `cutFrom`) — obrázky/embed VNÚTRI potvrdeného zdrojového chvosta sa tiež trimujú (nie zastavia scan), ale osamotený trailing obrázok BEZ zdrojového textu za ním (legitímna posledná fotka článku) sa nechá na pokoji.

Súčasne sa ukázalo, že marker pre fotokredit vyžadoval doslovné `foto:` (bez textu medzi slovom a dvojbodkou) — Nitrina "Foto hradiska Zobor a Šindolka: Anna Halčinová AVANS 2008" (opis MEDZI "Foto" a ":") tento marker nezhodla. Rozšírené na `/^\s*foto\b[^:]{0,60}:/i`.

Nitra: 80 → 73 blokov po fixe (7 duplicitných zdrojových blokov odstránených), 0 zvyšných výskytov "Spracoval"/"Foto hradiska Zobor" v tele. Regresne overené na 5 ostatných článkoch (0 zmien).

### 9.9 `normalizeLeading` orezávala aj koncový whitespace (Mikulčice, vyriešené v6.1)

Funkcia `normalizeLeading(s)` (aplikovaná na prvé dieťa odseku) napriek názvu orezávala `^[\s ]+` AJ `[\s ]+$` — teda aj koncovú medzeru. Keď bolo prvé dieťa odseku obyčajný text končiaci tesne pred odkazom/boldom/italic (bežné pri Blogger vetách plynulo prechádzajúcich do `<a>`, napr. "...Kopčany s kostolom " + `<a>Kostol sv. Margity...</a>`), medzera pred nasledujúcim uzlom zmizla a text sa zlepil: `"kostolomKostol"`, `"tu:Bohatstvo"`.

**Fix:** orezáva LEN úvodný whitespace, ako názov aj komentár nad funkciou vždy sľubovali. Diagnostika trvala dlho — bug bol v inline text-processing vrstve (`flushInlineBuf`/`normalizeLeading`), nie v sources-split logike, kde sa hľadalo najprv. Regresný test: hľadanie vzoru malé-veľké písmeno bez medzery (`/\p{Ll}\p{Lu}/gu`) v extrahovanom texte naprieč všetkými článkami — 0 výskytov po fixe.

**Poučenie:** pri budúcom podozrení na "zlepený text" (dve slová bez medzery na hranici inline uzlov) hľadaj najprv v `flushInlineBuf`/`normalizeLeading`/`inlineChildren`, nie len v sources-split.

### 9.10 Staré `overrides.json` sa ticho reaplikuje pri redeployi (Mikulčice, zdokumentované, nie bug)

Pri kompletnom znovu-nasadení článku (zmazať + nahrať nanovo) `upload.mjs` **automaticky** aplikuje `out/<slug>.overrides.json`, ak súbor v `out/` existuje — aj keď pochádza z predchádzajúcej, staršej migračnej session. Pri Mikulčiciach to bola žiaduca vec (zachovala sa staršia kurátorská práca: cover, excerpt, lokalita, ručne vložený obrázok kostola cez `blocksInsertAt`), ale spôsobilo to vedľajší efekt: vložený obrázok pristál vedľa iného, novo-vygenerovaného obrázka na tej istej pozícii (obaja `position: right`) → vizuálna "stena" 2 obrázkov za sebou.

**Fix (obsahový, nie kódový):** zmenená pozícia vloženého obrázka na `left` + `pairWithNext: true` — namiesto steny sa vykreslí ako spárovaný riadok vedľa seba (existujúci frontend mechanizmus, `DynamicZoneRenderer.tsx`).

**Vedľajší fix v `report.mjs`:** wall-detekcia (`§19`, "max 1 obrázok za sebou") nepoznala `pairWithNext` a falošne hlásila stenu aj pri korektne spárovaných obrázkoch. Opravené — obrázok bezprostredne za `pairWithNext:true` súrodencom nepredlžuje "run" (je súčasť toho istého vizuálneho riadku). Regresne overené na 5 ostatných článkoch (0 zmien vo verdiktoch).

**Poučenie pre budúci redeploy:** PRED vymazaním + nahraním nanovo skontroluj `out/<slug>.overrides.json` — ak existuje, over jeho obsah (môže byť stará kurátorská práca, ktorú chceš zachovať, ale môže kolidovať s novým dokumentovým poradím obrázkov po fixoch v extract.mjs).

**Overenie stien s `blocksInsertAt` overrides — dry-run NEPOMÔŽE.** `upload.mjs --dry-run=true` **neaplikuje** `overrides.json` vôbec (len `doRealUpload` to robí) — takže dry-run payload NEUKÁŽE steny spôsobené vloženými obrázkami. Pred reálnym uploadom s viacerými `blocksInsertAt` polož vlastný simulačný skript (Node, mimo upload.mjs), ktorý napodobní presne tú istú `afterHeading`+`offset` insert logiku nad `intermediate.json.blogPost.blocks`, a skontroluje výsledné pole na 2+ po sebe idúce `content.image-block` (bez `pairWithNext` výnimky). Použité pri Nitre (8 vložení, 3 kolízie nájdené a opravené pred uploadom).

### 9.11 `content.image-block.alt` má schema limit 255, `caption` má 500 (Nitra, vyriešené)

`alt` sa v `extract.mjs` odvodzuje priamo z `caption` (`alt: caption || ctx.articleTitle || 'Obrázok'`), ale Strapi schema má `alt` limitované na 255 znakov, zatiaľ čo `caption` dovoľuje až 500. Autorská poznámka pod fotkou dlhšia než 255 zn. (Nitra: 264-znakový rozvláčny komentár k fotke z Lupky) prešla cez `caption` bez problému, ale ako `alt` zhodila celý `POST /api/blog-posts` s `ValidationError: blocks[N].alt must be at most 255 characters` — v strede 55-obrázkového uploadu, po úspešnom stiahnutí/reuse všetkých médií.

**Fix:** `alt: (caption || ctx.articleTitle || 'Obrázok').slice(0, 255)` — orezanie bez elipsy (alt je pre screen readery, nie viditeľný čitateľovi, orezanie uprostred vety je akceptovateľné). Aplikuje sa automaticky pre všetky budúce články.

### 9.12 Tri UX bugy z vizuálnej kontroly Nitry (vyriešené, 2/3 potvrdene celoplošné)

Zistené priamym prehliadaním publikovaného článku (screenshoty), nie automatizovaným reportom — pripomienka, že `report.mjs` overuje integritu obsahu, nie vizuálny výsledok.

**a) Drop-cap na osamotenej zátvorke.** Frontend (`DynamicZoneRenderer.tsx`) aplikuje veľkú iniciálu na PRVÝ `content.rich-text` blok v článku bez ohľadu na jeho obsah. Ak báseň/citát má krátku citačnú poznámku hneď za sebou ako samostatný odsek (Nitra: `"(Slovenské Spevy vyd. v Turč. Sv. Martine r. 1883)"` po ľudovej piesni), táto poznámka sa stane "prvým odsekom" a dropcap skončí na otváracej zátvorke namiesto na skutočnom prvom odseku. **Fix (dátový, per-článok):** presunúť citáciu do `content.quote-block.source` poľa danej básne/citátu a odstrániť samostatný blok. Nie je to (zatiaľ) automatizované v `extract.mjs` — pri budúcich článkoch s rovnakým vzorom (krátka zátvorková citácia hneď za quoteDivs blokom) over ručne v Fáze 1b.

**b) Sketchfab fallback-attribution unikala do tela (extract.mjs, celoplošný fix).** Sketchfab pod každý embed automaticky vygeneruje `<div>` s 3 odkazmi (názov modelu / "by" autor / "on Sketchfab", všetky s `utm_medium=embed`). Bez filtra sa jeho text vytrhol z kontextu a objavil sa v tele ako 3 nelogické riadky. **Fix:** `isEmbedAttributionDiv()` vo `walkDocOrder` rozpozná div, ktorého JEDINÝ obsah sú sketchfab.com/utm_medium=embed odkazy (+ "by"/"on" spojky), a zahodí ho celý.

**c) Bibliografické citácie zlepené bez zalomenia (extract.mjs, celoplošný fix, dodatočne potvrdené aj na Arkone).** `splitDivIntoLines()` (používa `findInternalSourcesSplit` aj `classifyCitation*`) predtým riadkovala LEN podľa `<br>` — vnorené `<div>`/`<p>` bez `<br>` medzi nimi sa ticho rekurzovali do TOHO ISTÉHO riadku. Viacero samostatných top-level `<div>` bibliografických záznamov (bežný formát: každá citácia = vlastný `<div>`, žiadny `<br>` medzi nimi) sa tak zlialo do jedného obrovského textu (Nitra: 4 samostatné záznamy → 1; Arkona: 2 → 1, potvrdené pri re-extrakcii). **Fix:** `<div>`/`<p>` teraz vždy začínajú/končia nový riadok, rovnako ako `<br>`. Frontend (`SourcesRenderer`) už mal správny `<ul><li>` per-item layout a `break-all` na dlhých URL — problém bol výhradne v dátach, nie v renderovaní.

**Dopad na už migrované články:** Arkona bola tiež postihnutá (b) aj (c) fixmi — re-uploadnutá v tejto session. Blatnohrad/Mikulčice/Velehrad/Wogastisburg regresne overené ako nedotknuté (0 zmien v počte blokov/citácií), takže pravdepodobne nemajú tento vzor v zdrojovom HTML — ale vizuálne neboli kontrolované, len automatizovane.

### 9.13 Ďalšie 3 bugy z druhého kola vizuálnej kontroly (Velehrad, Wogastisburg — vyriešené)

**d) Prázdny prvý blok tiež kradol drop-cap (Velehrad, extract.mjs, celoplošný fix).** `cleanupOrphanChildren` vyprázdni `body` odseku bez reálneho textu, ale nechala stáť samotný (teraz prázdny) `content.rich-text` blok — ak bol PRVÝ v článku, frontend naň napriek prázdnote naviazal drop-cap (nič sa nezobrazilo, žiadna iniciála v celom článku). Fix: `content.rich-text` blok s `body: []` sa po `cleanupOrphanChildren` úplne odstráni z výstupu. Postihlo aj Nitru (70→68 blokov pri re-teste).

**e) `<i><b>` opačné poradie vnorenia unikalo quote-block detekcii (Wogastisburg, extract.mjs, celoplošný fix).** Dva rôzne detekčné miesta (§4.5 vnorené quoteDivs pre básne/verše, §4 bold-only-div pre nadpisy/citáty) hľadali `<b>` ako priamy potomok (`> b`, `> div > b`) — dobový citát so štruktúrou `<div><i><b>text</b></i></div>` (kurzíva OBALUJE tučné písmo, opačne než zvyčajné `<b><i>`) tak ostal ako obyčajný `content.rich-text` odsek namiesto `content.quote-block`. Fix: rozšírený selektor o `> i > b` (§4) a symetrický i/b check (§4.5). Fredegarova kronika vo Wogastisburgu sa teraz správne rozpozná ako quote-block.

**f) Drop-cap na nadpise namiesto odseku — hlbšia, frontendová oprava (3. variant tej istej rodiny bugov: d + Nitra §9.12a + toto).** Po presunutí atribúcie citátu preč (viď §9.12a vzor), sa novým "prvým rich-text blokom" niekedy stane blok obsahujúci LEN nadpis (`type: 'heading'`), nie odsek — `renderRichText` aplikuje drop-cap výhradne na `type: 'paragraph'` uzly, takže nadpis ho jednoducho preskočí a *žiadny* nasledujúci blok už drop-cap nedostane (`isFirstRichTextBlock` je `true` len pre JEDEN konkrétny index). **Fix (frontend, `DynamicZoneRenderer.tsx`, celoplošný):** `firstRichTextIndex` teraz hľadá prvý `content.rich-text` blok, ktorý má aspoň jeden `paragraph` uzol s reálnym textom (nielen akýkoľvek rich-text blok) — rieši naraz prázdne bloky (d), nadpisové bloky (f) aj krátke citačné odseky (§9.12a) ako jedna všeobecná trieda bugov, bez potreby ručne opravovať dáta pri každom budúcom výskyte.

**Poučenie:** táto rodina bugov (zlý "prvý rich-text blok") mala 3 rôzne dátové príčiny (prázdny blok, citácia, nadpis) ale JEDNU spoločnú frontendovú slabinu — `firstRichTextIndex` bol príliš naivný. Fix (f) je teraz robustný voči všetkým variantom naraz, vrátane akýchkoľvek budúcich neobjavených.

---

## 10. Recovery procedure — ak nová Claude session

### 10.1 Overiť stav

```powershell
# 1. Strapi beží?
curl -s -o $null -w "%{http_code}" http://localhost:1337/_health
# 204 = OK, 000 = down → cd hradiska-strapi && npm run develop

# 2. Aktuálne kategórie/tagy
curl -s http://localhost:1337/api/blog-categories | jq '.data[] | {name, slug, documentId}'
curl -s http://localhost:1337/api/blog-tags | jq '.data[] | {name, slug, documentId}'

# 3. Blatnohrad status
$env:STRAPI_TOKEN = "<token>"
curl -s -H "Authorization: Bearer $env:STRAPI_TOKEN" `
  "http://localhost:1337/api/blog-posts?filters[slug][\$eq]=blatnohrad-pribinovo-sidlo-v-panonii&populate[gallery]=true&populate[coverImage]=true&populate[comments]=true" | jq '.data[0] | {documentId, gallery: (.gallery|length), coverImage: .coverImage.name, comments: (.comments|length), excerpt}'

# 4. SQLite tabuľky
cd hradiska-strapi
node -e "const Database = require('better-sqlite3'); const db = new Database('.tmp/data.db', {readonly:true}); console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'blog_%'\").all());"
```

### 10.2 Re-extract Blatnohrad (ak treba)

```powershell
cd hradiska-strapi
node scripts/blog-migrate/extract.mjs --post=scripts/blog-migrate/data/post.json
# Output: scripts/blog-migrate/out/blatnohrad-pribinovo-sidlo-v-panonii.intermediate.json
# Stats expected: blocks ~35, gallery 29, comments 5, image-blocks ~10, image-galleries 0
```

### 10.3 Re-upload Blatnohrad

```powershell
$env:STRAPI_TOKEN = "<token>"
node scripts/blog-migrate/upload.mjs --dry-run=false
# Po dokončení: re-aplikuj cover (id=38) a vlastný excerpt cez explicit PUT (viď 6.7)
```

### 10.4 Reset hesla admin

```powershell
cd hradiska-strapi
npx strapi admin:reset-user-password --email=hradiskastrapi@gmail.com
# Interaktívne sa opýta na nové heslo
```

### 10.5 API token

Token je natrvalo v `hradiska-strapi/.env` (`STRAPI_TOKEN=`), načíta sa automaticky (viď 6.2). Nový/rotovaný token: Admin → Settings → API Tokens → Regenerate „blog-migrate" (alebo Create new, Full Access, Unlimited) → vlož do `.env`. Hodnota sa z admin ani DB späť neprečíta (len hash).

---

## 11. Roadmap — čo zostáva pre dávkový import

### 11.1 Pred dávkou cez label `Najvýznamnejšie hradiská` (13 článkov)

**Edge cases z `_dry-run-report.json` (viď [`out/_dry-run-report.json`](out/_dry-run-report.json)):**

| # | Článok | Edge case |
|---|--------|-----------|
| 1 | Blatnohrad | ✓ hotový |
| 2 | Spišské Tomášovce | zeroCitations (nemá zdroje?) |
| 3 | Wogastisburg | nonMapIframes=1 (YouTube), noLocation |
| 4 | Devín | 3 map iframes (viac lokalít) |
| 5 | Majcichov | nonMapIframes=1 (YouTube) |
| 6 | Havránok | clean |
| 7 | Nitra | 3 map iframes, nonMapIframes=1 (Sketchfab), shortExcerpt=0 |
| 8 | Sv. Jur – Neštich | nonMapIframes=3 (Sketchfab + Blogger video + YouTube) |
| 9 | Ducové | nonMapIframes=2 (Google Maps `pb=` newer format + YouTube), noLocation |
| 10 | Pobedim | clean |
| 11 | Divinka | **STUB** — HTML 88 znakov (redirect na blogspot subdomain) |
| 12 | Molpír | nonMapIframes=5 (Sketchfab + 4 YouTube), noLocation |
| 13 | Bojná | **91 false-positive citations** (split-point detection too aggressive) |

**TODO opravy parsera:**
1. Google Maps embed `google.com/maps/embed?pb=!2d{lng}!3d{lat}` (Ducové) — rozšíriť `detectLocation` + `runChecks`
2. Bojná 91 citations — split-point detection: hľadať explicit `Zdroje:` heading; ignorovať `blogger.googleusercontent.com` URL v zdrojoch
3. Embedded YouTube/Sketchfab → `content.embed` block (schéma už existuje, treba parser)
4. Divinka stub — `content.length < 200` detect → `$meta.isStub: true` + skip
5. Multiple map iframes — prvý → `location`, ostatné do `$meta.additionalLocations` (vyriešiť pri škále)
6. Bibliografia v `<i>/<small>` v texte — kontroluje sa, zatiaľ žiadny prípad

### 11.2 Override mechanism (vysoká priorita)

Pridať do `upload.mjs` pred POST/PUT:
```js
const overridesPath = resolve(dirname(INPUT_PATH), `${bp.slug}.overrides.json`);
if (existsSync(overridesPath)) {
  const overrides = JSON.parse(readFileSync(overridesPath, 'utf8'));
  Object.assign(finalData, overrides);
  console.log(`     ✓ overrides applied: ${Object.keys(overrides).join(', ')}`);
}
```

Pre Blatnohrad `out/blatnohrad-pribinovo-sidlo-v-panonii.overrides.json`:
```json
{
  "coverImage": 38,
  "excerpt": "V roku 2009 sa pri Zalaváre vykopal črep s hlaholským nápisom — najstarší zachovaný v slovanskom svete. Nie je vylúčené, že ho písal samotný Metod, ktorý sa tu zdržiaval pol roka."
}
```

### 11.3 Kategórie pre 12 zostávajúcich článkov

Mapping je podľa **funkcie hradiska**, nie lokality. Tých 6 kategórií:
- Kniežacie sídla, Mocenské centrá, Strážna funkcia, Refugiá, Staroveké sídla, Ostatné

User musí pre každý článok manuálne určiť kategóriu pred uploadom (poznáš obsah). Nepoužívať batch mapping.

---

## 12. API endpoints cheatsheet

| Endpoint | Metóda | Auth | Účel |
|----------|--------|------|------|
| `/_health` | GET | public | Strapi alive check (204) |
| `/api/blog-posts` | GET | public | List (Public.find) |
| `/api/blog-posts?filters[slug][$eq]=...` | GET | public | Find by slug |
| `/api/blog-posts/<docId>?populate=*` | GET | public | Single (plytké populate) |
| `/api/blog-posts/<docId>?populate[gallery]=true&populate[coverImage]=true&...` | GET | public | Single (hĺbkové) |
| `/api/blog-posts` | POST | **token** | Create |
| `/api/blog-posts/<docId>` | PUT | **token** | Update |
| `/api/blog-posts/<docId>` | DELETE | **token** | Delete |
| `/api/blog-categories` | GET | public | 6 kategórií |
| `/api/blog-tags?filters[slug][$eq]=...` | GET | public | Tag lookup |
| `/api/blog-tags` | POST | **token** | Create tag |
| `/api/blog-comments?filters[post][documentId][$eq]=<id>` | GET | public | Approved-only filter cez controller |
| `/api/blog-comments` | POST | public (sanitized) | Visitor komentár |
| `/api/blog-comments/<docId>/like` | POST | public | +1 likes |
| `/api/blog-comments/<docId>/unlike` | POST | public | -1 likes (min 0) |
| `/api/blog-comments/<docId>` | PUT | **token** | Admin moderation (approved toggle) |
| `/api/upload/files?pagination[page]=N` | GET | **token** | List media |
| `/api/upload` | POST | **token** | Upload file (multipart: `files`, `fileInfo`) |
| `/api/upload?id=<id>` | POST | **token** | Update metadata only (multipart: `fileInfo`) |

---

## 13. Príkaz cheatsheet

```powershell
# Strapi reštart (z hradiska-strapi/)
npm run develop

# Strapi reset hesla
npx strapi admin:reset-user-password --email=hradiskastrapi@gmail.com

# Extract single post
node scripts/blog-migrate/extract.mjs --post=scripts/blog-migrate/data/post.json

# Batch dry-run cez label
node scripts/blog-migrate/extract.mjs --label=scripts/blog-migrate/data/label-najvyznamnejsie.json

# Upload (dry-run default)
node scripts/blog-migrate/upload.mjs

# Upload real — token sa berie automaticky z hradiska-strapi/.env (viď 6.2)
node scripts/blog-migrate/upload.mjs --dry-run=false

# Inspect aktuálny post
node -e "fetch('http://localhost:1337/api/blog-posts?filters[slug][\$eq]=blatnohrad-pribinovo-sidlo-v-panonii&populate[gallery]=true&populate[coverImage]=true&populate[comments]=true', {headers:{Authorization:'Bearer '+process.env.STRAPI_TOKEN}}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j.data[0],null,2)))"

# SQLite peek
node -e "const D=require('better-sqlite3'); const db=new D('.tmp/data.db',{readonly:true}); console.log(db.prepare('SELECT id, document_id, slug FROM blog_posts').all());"

# Kill Strapi
Stop-Process -Id (Get-NetTCPConnection -LocalPort 1337 -State Listen | Select -First 1).OwningProcess -Force

# Curl health
curl -s -o $null -w "%{http_code}`n" http://localhost:1337/_health
```

---

## 14. Diagnostika — kde čo nájsť

| Problém | Kde sa pozrieť |
|---------|----------------|
| Nesedí počet obrázkov | `$('img').length` v `entry.content.$t` cez cheerio |
| Excerpt zlý | `buildExcerpt` v extract.mjs, dump `$.clone().find('iframe,img,table').remove()` |
| Komentár sa nezobrazil | Strapi admin → Blog Comment → `approved` field |
| Like nereaguje | DevTools console + localStorage `hradiska:liked-comments` |
| Threading chýba | DB query `SELECT * FROM blog_comments WHERE in_reply_to IS NOT NULL` |
| Cover image zlý | `populate[coverImage]=true` v query, skontroluj `media id` |
| Tag duplikát | Strapi admin → Blog Tag, hľadaj podľa slugu |
| Strapi crash | `tail -20 <task_output>` v claude tasks/, hľadaj `[error]` alebo `Shutting down` |
| Upload incomplete | `out/<slug>.upload-log.json` `uploads[]` action: `uploaded/reused-by-name/reused-by-sha` |

---

## 15. User context (z memory)

- **Komunikácia**: slovenčina
- **Žiadne platené API kľúče** v aplikácii (žiaden Anthropic/OpenAI SDK calls), iba Strapi
- **API kľúče/tokeny nezdieľať v chate** — vždy upozorniť + odporučiť rotáciu po dokončení
- **Pred docx export** najprv ukázať text v chate na schválenie
- **Pri tvorbe textu** najprv návrh na schválenie, potom finálny súbor

---

## 16. Quick recall pre Claude pri novej session

> Hradiska.sk blog migrácia z Blogger XML/JSON feedu do Strapi 5.
> Repo: `hradiska-strapi` (port 1337, SQLite). Frontend `Webdesignforhradiskask` (Vite, port 3000).
> Pipeline: `scripts/blog-migrate/extract.mjs` (Fáza 1, JSON na disk) → `scripts/blog-migrate/upload.mjs` (Fáza 2, REST API).
> Strapi schéma: `blog-post` (s `coverImage`, `gallery`, `blocks` dynamiczone, `comments` 1:N), `blog-comment` (verejné POST + like/unlike).
> Komentáre: `sourceBloggerId` numeric pre idempotency, threading cez `link[rel=related]` z Blogger feedu (`inReplyTo` = parent Strapi documentId).
> Token pre upload je natrvalo v `hradiska-strapi/.env` (`STRAPI_TOKEN=`, Full Access) a `upload.mjs` ho načíta sám cez dotenv — netreba ho zadávať (viď 6.2). Manuálne overrides cez `out/<slug>.overrides.json` (blocksPrepend/Append/InsertAt + plain fields).
> **Všetkých 6 pôvodných článkov je na v6 pipeline** (sidebar + gramatika aplikovaná, `report.mjs` verdikt ✅ MIGRÁCIA ÚPLNÁ): **Arkona** (`lfaky9t9qtgoi8qygfyflmd8`, 5× `content.poem`), **Staré Mesto-Velehrad**, **Wogastisburg**, **Blatnohrad** (`wwwdw03vkhivy0embsfq74no`), **Mikulčice-Kopčany** (`emqid1imvyqts9xnv9mcwzs2`), **Nitra** (`yyj3l81exo9usa5jkitd9yyy`, najkomplexnejší doteraz — 6 podlokalít, 81 blokov, 20 timeline, 9 keyFacts). Migrácia týchto 6 je HOTOVÁ.
> **Básne (`content.poem`, v6.1):** centrovaný kurzívový beh ≥2 veršov sa deteguje automaticky (`markPoemRuns` pre-pass v `extract.mjs`, žiadny manuálny krok), excerpt ich preskakuje, `report.mjs` ich počíta do pokrytia. Frontend `PoemRenderer` má vlastný vizuál (ornamentálny rám — parchment panel, ornament nad textom, zlatá atribúcia). Viď §20.
> **Sources-split bugy (v6.1, §9.6+§9.8, 5 samostatných príčin naprieč Arkonou/Blatnohradom/Nitrou)**, **entity dekódovanie v komentároch (§9.7)**, **`normalizeLeading` glejenie textu (§9.9)** a **`alt` 255-znakový limit (§9.11)** opravené — všetky automaticky pre budúce články. **§9.10:** pri redeployi VŽDY skontroluj, či existuje staré `out/<slug>.overrides.json` — aplikuje sa automaticky (LEN v `doRealUpload`, dry-run ho ignoruje!) a môže kolidovať s novým poradím obrázkov (pairWithNext rieši, over vlastnou simuláciou pred uploadom pri viacerých `blocksInsertAt`).
> Cieľ: postupne zvyšných 11 článkov z labelu Najvýznamnejšie hradiská (Bojná, Devín, Divinka, Ducové, Havránok, Sv. Jur–Neštich, Majcichov, Molpír, Pobedim, Spišské Tomášovce — extrahované do `out/*.intermediate.json`, ešte nenahrané). Pred dávkou opraviť parser pre Google Maps `pb=`, embed videí, Bojná false positive citations, Divinka stub (§11.1 — stále otvorené).

---

## 17. Rytmus obrázkov — dokumentové poradie + rozbíjanie zhlukov (v6)

Nahrádza staré pravidlo „captioned→telo, no-caption→galéria". Dva mechanizmy v `extract.mjs`:

**A. Dokumentové poradie (`walkDocOrder` v `convertDivToBlocks`).** Prejde potomkov divu v poradí a vydáva bloky interleaved — nazbieraný text sa flushne ako odsek vždy keď narazí na obrázok/embed. Predtým sa obrázky **front-loadovali** pred text (všetky tabuľky, potom text), čím strácali kontextovú pozíciu. Teraz ostávajú medzi pasážami ako v origináli.

**B. Rozbíjanie zhlukov + captioned priorita (gallery-merge).** `BODY_IMAGE_TEXT_THRESHOLD = 800`.
- VŠETKY obrázky idú do **fronty** (dok. poradie).
- Po každom odseku, keď od posl. obrázka v tele pribudlo **≥800 zn**, umiestni sa 1 z fronty: **najskorší captioned** (hodnotné/kontextové prednosť), inak najskorší (najbližší zhluk).
- **1 na slot → žiadna stena** (medzi dvoma obrázkami v tele je vždy odsek). Zvyšok fronty (nezmestí sa do rytmu) → galéria, **popis zachovaný** (opravená stará null-caption diera).

Prečo: staré blogy majú obrázky v zhlukoch (0 zn medzi nimi) — čistý prah ich anti-stenou nepustí do tela, ostanú v galérii, hoci telo má veľké bloky textu bez ilustrácie. Rozbíjanie ich rozpustí do medzier. Prah 800 = pomer ~obrázok/2–3 odseky, konzistentný naprieč článkami (vybraný po simulácii; Blatnohrad 9, Mikulčice 7, Velehrad 5, Wogastisburg 4).

Regresne overiť po zmene: span-level úplnosť textu (100 %, false-positives = map-widget „View Larger Map", tvarové varianty, link-uzly) + max stena = 1.

---

## 18. Sidebar agenti (Fázy 2–3) + chránené zóny

Agenti = **Claude subagenti**, ktorí čítajú telo a LEN NAVRHUJÚ; používateľ schvaľuje pred zápisom. Žiadne platené API v appke. Poradie: **telo → quote/lokalita → Agent 1 → Agent 2** (gramatika posledná, lešti finálny text; quote-splits pred ňou definujú chránené zóny).

### 18.1 Agent 1 — Timeline + KeyFacts
- **Vstup:** telo (`content.rich-text` uzly). **Výstup:** `out/<slug>.timeline.json` = `{ timeline[], keyFacts[] }` (schémy §3.3: year/title/description/type; label/value/icon).
- **Pravidlo (memory `agent-timeline-keyfacts-source-only`):** IBA to, čo je reálne v texte. Žiadne externé/„všeobecne známe" fakty ani roky. Rok bez explicitnej opory → `⚠ NEISTÝ` (pre DB `year:"neznámy"`), **nevymýšľať** (vzor: bitka pri Wogastisburgu). Kvantitá (250 ha, 10 000 hrobov) nie sú timeline udalosti, ale môžu byť keyFact.
- **Pred zápisom OVERIŤ:** každá zdrojová veta musí byť doslovne z tela (grep proti telu); položku bez opory vyhoď.
- Flexibilné `year`: „623", „623–624", „po 630", „~631", „13. storočie", „50. roky 20. storočia". Frontend (`ArticleSidebar.tsx`) rendruje timeline v poradí poľa (BEZ sortovania) — neistý label ostáva na svojej chronologickej pozícii.

### 18.2 Agent 2 — Gramatická korektúra
- **Vstup:** telo (`content.rich-text`) + `scripts/blog-migrate/protected-terms.json`. **Výstup:** `out/<slug>.grammar.json` = `{ corrections: [{block, before, after, reason}] }`.
- **Rozsah:** LEN pravopis — čiarky/bodky, i/y, dĺžne, nominatív plurálu, zhoda podmet–prísudok, predložky, veľké/malé, preklepy. **Žiadne preformulovanie / slovosled / štylistika.** Oprava platí len ak sa before/after líšia výhradne v pravopise.
- **Ochrana v 3 vrstvách:** (1) **štrukturálna** — vidí len rich-text, `quote-block`/`sources`/`embed` **nikdy** (dobové citáty automaticky chránené); (2) **lexikálna** — `protected-terms.json` (kmeňová zhoda; vlastné mená, odborné/dobové termíny, pramene, autori — **rastie s každým článkom**); (3) **behaviorálna** — pri pochybnosti **nemeniť, označiť** do sekcie „⚠ NEISTÉ".
- **Aplikácia:** `before` musí presne+jednoznačne sedieť s uzlom (over grep, počet=1). Aplikuje sa pri re-uploade (GET živý → replace v text-uzloch → PUT). Captions a `content.sources` sú **mimo** (URL, bibliografia).

### 18.3 Re-upload so zachovaním ručnej práce
PUT nesmie stratiť quote-blocky, embed, obrázky, galériu, kategóriu, tagy. Postup: **GET živý článok (deep populate)** → prestav write-payload (media → id, relácie → connect/set, quote/embed/sources verbatim) → aplikuj grammar na rich-text + nastav timeline/keyFacts → **PUT na documentId**. Dry-run najprv overí integritu (počty blokov, quote/embed/obrázky zachované, grammar aplikovaná 100 %). Vzor skriptu: `_woga-reupload.mjs` / `_vele-reupload.mjs` (dočasné, mazané po behu).

---

## 19. Fáza 6 — Report + audit súbory

**`report.mjs`** (záver pipeline). Per článok vyrobí `out/<slug>.report.md` + konzolový súhrn:
```powershell
node scripts/blog-migrate/report.mjs --slug=<slug> [--feed=data/<post>.json]   # feed = pridá % pokrytia textu
node scripts/blog-migrate/report.mjs --all                                       # všetky publikované
```
Obsah reportu: bloky (rich-text/quote/image/embed/sources), obrázky (telo/galéria/popisy + mená), **timeline** (zoznam), **keyFacts** (zoznam), **gramatika** (počet + kategórie: interpunkcia/i-y/nominatív/zhoda/predložky/veľké-malé/preklepy + tabuľka before→after), komentáre, znaky textu, % pokrytia vs originál. To je tá „jasná štatistika — koľko, z čoho do čoho, čo sa pridalo/upravilo".

**Sekcia „✅ Integrita a úplnosť" (ochrana + verdikt) — na začiatku reportu:**
- **VERDIKT:** `✅ MIGRÁCIA ÚPLNÁ — nič sa nestratilo` alebo `⚠ POZOR` (podľa text+obrázky+rytmus).
- Text: % pokrytia vs originál, pričom **gramaticky opravené slová sú vyňaté** (pôvodný typ. tvar sa v migrovanom nenachádza, lebo bol opravený — nie stratený; auto-počíta z `<slug>.grammar.json`). Feed sa auto-mapuje (`FEED_MAP` v `report.mjs`), netreba `--feed`.
- Obrázky evidované: telo ⊆ galéria (žiadny sa nestratil — galéria obsahuje všetky, dedup).
- Rytmus: max 1 obrázok za sebou (žiadna stena).
- Sidebar + gramatika (doplnky — neovplyvňujú verdikt „nič sa nestratilo", ktorý sleží na text+obrázky+rytmus).

**Audit súbory v `out/` (per článok, rollback-safe, oddelené od surového extraktu):**
| Súbor | Fáza | Obsah |
|---|---|---|
| `<slug>.intermediate.json` | 1 | surový extrakt (telo, galéria, lokalita, komentáre) |
| `<slug>.overrides.json` | 4 | manuálne overrides (cover, excerpt, blocksInsertAt…) |
| `<slug>.timeline.json` | 2 | schválená timeline + keyFacts (Agent 1) |
| `<slug>.grammar.json` | 3 | schválené gram. opravy before→after (Agent 2) |
| `<slug>.report.md` | 6 | finálny report (štatistika) |
| `protected-terms.json` | — | globálny glosár chránených termínov (rastie) |

---

## 20. Básne (`content.poem`) — detekcia, extrakcia, vizuál (v6.1)

Pôvodne parser spracoval centrované kurzívové verše ako obyčajný `content.rich-text` odsek — zalomenie po veršoch aj centrovanie sa stratili (nájdené na Arkone: 5 básní o Arkone/Rujane splynutých s okolitým textom). Fáza 1 teraz básne rozpoznáva a extrahuje ako samostatný komponent, plne automaticky.

### 20.1 Detekcia — `markPoemRuns` (pre-pass v `buildBlocksFromBody`)

Beh ≥2 po sebe idúcich veršov (centrovaný `<div>` + kurzíva, prípadne oddelené prázdnymi centrovanými divmi = predel strofy) sa označí v DOM (`data-poem` na prvom verši, `data-poem-skip` na ostatných), aby ich `convertDivToBlocks`/`walkDocOrder` vydali ako `content.poem` namiesto `content.rich-text`.

```
poemVerseInfo(div):  text-align:center + obsahuje <i>/<em> + žiadny <img>  → {verse: text}
                      text-align:center + prázdny                          → {empty: true} (predel strofy)
                      inak                                                  → null

markPoemRuns: beh (V|_)+ s ≥2 veršami (V) → content.poem (text: verše spojené \n, strofy oddelené \n\n)
              beh s 1 veršom → NIE báseň (meta.poemSingleFlags, spracuje sa ako bežný text)
              <br> vnútri behu NEPRETŔHA (verše na riadkoch v rámci jedného <div>)
              próza/obrázok/tabuľka beh PRETRHNE (vzdialené básne sa prirodzene oddelia)
```

**Regresne overené** (0 falošných pozitív): Blatnohrad, Mikulčice-Kopčany, Staré Mesto-Velehrad, Wogastisburg — žiadny `content.poem` blok, excerpty nedotknuté. Arkona: 35/35 veršov zachytených v 5 samostatných `content.poem` blokoch (článok prekladá básne prózou/nadpisom/obrázkami — 5 blokov je vernejšie originálu než umelé zlúčenie do menej celkov).

### 20.2 Nadväzujúce opravy

- **`buildExcerpt`** teraz zo svojich kandidátov odstraňuje `[data-poem], [data-poem-skip]` elementy pred meraním dĺžky textu — inak si zoberie prvú báseň ako "prvý zmysluplný odsek" (bug nájdený na Arkone, excerpt bol báseň č. 1 namiesto prózy).
- **`report.mjs`** počíta text z `content.poem` blokov (nielen `content.rich-text`) do % pokrytia — inak nahlasoval verše presunuté do básne ako "chýbajúce".

### 20.3 Manuálne pole (nezautomatizovateľné)

`author`/`source` na konkrétnej básni (napr. báseň citujúca pieseň) sa dopĺňa ručne do `blogPost.blocks[].author`/`.source` v `intermediate.json` pred uploadom — nedá sa odvodiť z textu. Príklad (Arkona, báseň 5): `author: "Ancestral Volkhves"`, `source: "A Ruiny Prehovoria, Keď Stíchne Čas"`.

### 20.4 Frontend — `PoemRenderer` (Variant A: ornamentálny rám)

Vlastný vizuál, zámerne odlišný od `quote-block` (ten má zlatý ľavý okraj): podfarbený panel (`rgba(196,165,116,0.07)`), tenké orámovanie, ornament (linka–kosoštvorec–linka) nad veršami, atribúcia oddelená zlatou linkou pod textom, uppercase + letter-spacing (rovnaký vzor ako `QuoteBlock`'s Feather+cite). Farby/písmo výhradne z existujúcej palety (`#a87437`/`#7d4f1d`, Georgia serif) — 3 varianty (rám / iniciála / bočný ornament) navrhnuté ako HTML mockup a odsúhlasené pred zápisom.

---

**Koniec dokumentácie.**

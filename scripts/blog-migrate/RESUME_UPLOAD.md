# Stav migrácie — reálny (overený priamo z bežiacej Strapi DB)

> ## ✅ MIGRÁCIA KOMPLETNÁ (2026-07-17)
> `_status-check.mjs` naprieč celou queue: **SPOLU: 44 | live=44 | chýba=0 | treba-PUT=0**.
> Posledných 9 chýbajúcich 3D článkov (padli v predošlej session na image-timeout) bolo donahratých cez `upload.mjs` — jeden po druhom, s verifikáciou. `keyFacts`/`timeline` sa nastavili **priamo pri POST-e z intermediate**, žiadny dodatočný PUT nebol potrebný.
> Zoznam „Zostáva nahrať" nižšie je preto **vybavený** (ponechaný ako audit stopa). Aj 3 „na posúdenie" položky sú **vyriešené** (2026-07-18): `velky-tribec` re-uploadnutý (*Strážna*), `divinka-pri-ziline` = prázdny stub a `zilina-zavodie-2016` = duplikát → nemigrujú sa. Viď koniec dokumentu. **Nič otvorené nezostáva.**

**Aktualizované: 2026-07-17** — tento súbor bol prepísaný podľa **skutočného stavu v DB**, nie podľa staršieho odhadu. Predošlá verzia (batch „34/68") bola už výrazne zastaraná: Odborné texty sú medzitým kompletné a 3D modely postúpili.

Overené cez `GET /api/blog-posts?pagination[pageSize]=100&populate[0]=category&publicationState=preview` (3 stránky, 223 článkov) + cross-check proti `out/*.intermediate.json`.

## Celkový obraz

- **223 článkov v DB, všetky publikované (0 draftov)**, v 12 kategóriách.
- Počty podľa kategórie (živé):

| Kategória | documentId | Počet |
|---|---|---|
| Strážna a hospodárska funkcia | `xl5emzcwsvq6m9hzy66avvmt` | 40 |
| 3D modely | `dv132j3g3ek629nwpmbnugun` | 32 |
| Mocenské centrá | `iei9y9c9x3fd4yy1z6uz6osz` | 29 |
| Staroveké sídla | `pc1i0qyu1ghzecz9ntunboof` | 23 |
| Odborné texty | `xffbpfyel46l2xro9s7hwm8d` | 21 |
| Listiny a písomné zdroje | `skof8do5athszi97mp2wkj3u` | 19 |
| Všeobecne o hradiskách | `u4sopv9mmxstlicww25pldjc` | 15 |
| Refugiá | `ju7qzoselv8vtk40oiddwps8` | 13 |
| Povesti | `gkl6r8p9t71feu4wxt6dclua` | 13 |
| Svätyne a sakrálne objekty | `v1w38fn24cvwd18r9c538wzk` | 11 |
| Kniežacie sídla | `l148rpkbsf47iy63jb0afpwn` | 6 |
| (bez kategórie) | — | 1 |

## Batch Povesti / Odborné / 3D (pôvodná „68-dávka") — reálny stav

| Kategória | Starý dokument | **Reálne** |
|---|---|---|
| Povesti | 13/13 | **13 — HOTOVO** |
| Odborné texty | 4/21 | **21 — HOTOVO (celé)** |
| 3D modely | ~17/45 | **32 live** |

Odborné texty aj Povesti sú kompletné. Zostáva už len dokončiť 3D modely + pár neistých položiek nižšie.

---

## ⚠️ KRITICKÉ upozornenia (stále platné)

1. **Upload je pomalý na strane Strapi** (sharp thumbnaily + SQLite + ~20k plochých súborov v `public/uploads/`) — veľký s0 obrázok sa spracúva 60–120 s. Klientský timeout preto musí byť nad tým (`_upload-aktuality.mjs`: default 180 s, override `--timeout=`), inak klient abortuje (ECONNRESET) hoci Strapi upload dokončí. **Spúšťať len 1 upload naraz, nikdy paralelne.**
2. **Len JEDEN proces reštartuje Strapi.** Zdravie overuj cez `curl http://localhost:1337/api/blog-categories` (rýchle 200), nie len TCP connect.
3. **Diskový I/O:** `public/uploads/` má ~19 800+ súborov (plochá štruktúra, Windows) — aj sólo beh je pomalší.
4. **Fixy v `upload.mjs`** (na disku, prežijú reštart): dedup výhradne cez SHA-256; `loadExistingMediaIndex` neopakuje fetch; všetky fetch majú `AbortSignal.timeout`; Step 4b aplikuje `out/<slug>.overrides.json` (dry-run ho ignoruje).
5. **`upload.mjs` nečíta `<slug>.timeline.json`** — číta len `bp.timeline`/`bp.keyFacts` z intermediate. Ak existuje samostatný `timeline.json` s obsahom, po POST-e ho treba ručne PUT-núť. (Pre nižšie uvedené zvyšné 3D články samostatný `timeline.json` neexistuje → netýka sa ich.)
6. **Kozmetický log:** `upload.mjs` vypisuje natvrdo `=== REAL UPLOAD — Blatnohrad ===` bez ohľadu na článok. Ignorovať.

---

## ✅ VYBAVENÉ — 3D modely donahraté (2026-07-17)

Kategória pre všetkých: **3D modely** `dv132j3g3ek629nwpmbnugun`.
Vzor: `node scripts/blog-migrate/upload.mjs --input=out/<súbor> --category=dv132j3g3ek629nwpmbnugun --dry-run=false`

Posledných 9 (ktoré neboli live pri obnove) nahraté a overené v tejto session:

| Slug | Obr. | documentId |
|---|---|---|
| `zvolen-motova-3d-panorama` | 0 | `n22c921y464vn53esjr2262v` |
| `velkomoravsky-kovac-z-vrsatca` | 1 | `nfk38zl9ofafholcjmz73kkk` |
| `velmozska-mohyla-holasky-1` | 1 | `oeubatcl35afuh1dhl1ll8y7` |
| `vidiecke-opevnene-sidlisko` | 1 | `e4916m1kgkqqzgtswmjxvqi2` |
| `svaty-jur-nestich-3d` | 3 | `nmjfmefio2j05g7rm5xk8xur` |
| `keltska-osada-3d` | 8 | `gvs12y7ce04upxw6wq82cfn3` |
| `zvolen-motova-kresba` | 9 | `thp9f9txpvuff1tiaugfg0rw` |
| `velkomoravske-hradisko-zvolen-motova-3d` | 11 | `toa2ldmkroj9ztcnkyx8j4iw` |
| `detva-kalamarka-3-d` | 14 | `jo87p3zpdzxfn81m53lgr08y` |

Zvyšné z pôvodného zoznamu (`bratislava-kresba`, `slovanska-svatyna-most-pri-bratislave`, `slovansky-velmozsky-dvorec`, `surany-v-16-storoci-3d`) už boli live pred obnovou — potvrdené status-checkom.

---

## ✅ Na posúdenie — VYRIEŠENÉ (2026-07-18)

Všetky 3 „na posúdenie" položky preverené proti živej DB aj obsahu súborov:

- **`velky-tribec-mohutne-praveke-hradisko`** — plnohodnotný článok (22 blokov, 28 obr. po dedupe, KF 9, TL 10), bol zmazaný z DB. Po rozhodnutí používateľa **RE-UPLOADNUTÝ** do *Strážna a hospodárska funkcia* — nový documentId **`vs384eo8efjqjy0gpmbjbyqd`**, sidebar overený (KF 9 / TL 10). HOTOVO.
- **`divinka-pri-ziline`** — ❌ **prázdny stub** (0 blokov, 0 obr., 0 citácií, `sanityFlags: zeroBlocks…`), starý Blogger redirect z 2010. Lokalita je už pokrytá 3 živými článkami (`hradisko-velky-vrch-divinka` Mocenské, `divinka-velky-vrch-v-dobe-latenskej-kresba` 3D, `naucny-chodnik-divinka-velky-vrch`) + Schreiber odborný text. **Nemigrovať.**
- **`zilina-zavodie-2016`** — ❌ **duplikát** už-živého `zilina-zavodie` (Refugiá, `pqb6c6shctjeviikuzmtskpw`): rovnaký titul/9 blokov/17 obr., ale `-2016` má horšiu extrakciu (CSS v exceprte). Live verzia je lepšia. **Nemigrovať.**

---

## Postup (jeden beh naraz, jemne)

1. Over zdravie: `curl http://localhost:1337/api/blog-categories` → rýchle 200.
2. Spusti JEDEN článok, počkaj na `✓ Upload log` + VERIFY blok, over `blocks total` / `gallery` / `category`.
3. Až potom ďalší. Pri zlyhaní na timeout: skript má vlastný 6-pass retry; ak spadne Strapi, reštartuj `npm run develop` a pokračuj tým istým článkom (idempotentné cez slug/SHA).
4. `keltska-osada-3d` (8 obrázkov) nechať na koniec / samostatne.

# Migrácia AKTUALITY — kompletný denník cesty

> **Stav: DOKONČENÉ (2026-07-19).** Verifikácia: `live=67 | chýba=0 | draft=0 | typ-nesedí=0`.
> Kolekcia `aktualita` (krátke príspevky o činnosti OZ Hradiská), oddelená od `blog-post`.

Nadväzuje na `MIGRATION.md` (6-fázový pipeline v6/v7) a `RESUME_UPLOAD.md`. Blog-posty (238)
boli hotové skôr; tento dokument pokrýva **migráciu 67 aktualít** z Blogger feedu do Strapi.

---

## 1. Východiskový stav

- Fronta: **67 aktualít** (`data/_aktuality-queue.json`), všetky s hotovým `extract` (intermediate).
- V DB live len **5** (2010–2013) + 3 novšie „seed" (2026, mimo fronty).
- Agent 2 (grammar-sk) hotový len pre **7/67**; upload dobehnutý na 5/67.
- Beh predtým **spadol** počas uploadu 6. položky (Strapi zomrel; oba porty voľné pri obnove).

## 2. Pipeline pre aktuality (čo sa aplikuje)

| Fáza | Aktuality? | Poznámka |
|---|---|---|
| 1 extract → intermediate | ✅ | telo, galéria, dátum |
| 1b quote-zóny + `typAktivity` + `zvyraznene` | ✅ | kategórie **ponechané** per rozhodnutie používateľa (max FLAG, žiadne presuny) |
| 2 Agent 1 (timeline/keyFacts) | — | N/A, aktualita tieto polia nemá |
| **3 grammar-sk v7 (§21)** | ✅ | jadro tejto migrácie — vetná gramatika, nie regex |
| 4 upload (`_upload-aktuality.mjs`) | ✅ | idempotentný cez `nazov` + SHA-256 dedup fotiek |
| 6 verifikácia (`_verify-aktuality.mjs`) | ✅ | live/publikovaná/typ/fotky |

## 3. Agent 2 — grammar-sk v7 (§21), ťažisko

Spracované **8 dávok** (položky 8–67; 1–7 hotové skôr). Princípy:
- **Vetná úroveň**, nie plošný regex: čiarky (spojky/vzťažné zámená, uzavretie vsuviek), poloha
  zvratného *sa/si* (Wackernagel), zhoda podmet–prísudok, pádové väzby, slovosled, **bohemizmy**
  (jedná sa o→ide o, nakoľko→keďže, snáď→azda, za účelom→na/s cieľom…).
- **Typografia** (bezpečné): en dash (–), slovenské „ ", oddeľovač tisícov, jednotky s medzerou,
  medzery po ordináloch/bodkách, lomky→zátvorky.
- **Diakritika / preklepy**: najdete→nájdete, dobrovolníci→dobrovoľníci, nemôžme→nemôžeme,
  statožňovať→stotožňovať, oborných→odborných, posieľali→podieľali…
- **Veľké/malé**: kultúry malým, etnonymá veľkým (kelti→Kelti, germánov→Germánov), vlastné mená
  (Konštantína Filozofa).
- **Titulky** (`nazov`): opravené **priamym patchom** `bp.title` — `apply-grammar` mení len
  rich-text bloky, nie title (§21.4 pritom vyžaduje cross-field aj na title).

### Chránené zóny (§21.3 — NEDOTKNUTÉ, verbatim/cudzojazyčné pramene)
- #8 česká pozvánka na festival (celý text CZ) — 0 opráv, potvrdené používateľom.
- #16 recenzia z HISTORYWEB, #18/#19 texty organizátorov (FB-štýl bez diakritiky),
  #30 reprodukovaný odborný článok Z. Stanekovej + dobové citáty/listy, #43 stanovisko Žiarislava,
  #59 český názov knihy, #65 český projektový text AV ČR Brno.

### Riešené špecifiká
- **Cross-node zhody**: `apply-grammar` matchuje v rámci JEDNÉHO text-nodu; frázy cez hranicu nodu
  (napr. „Jedná sa o pomerne | vysoké percento", úvodzovky v samostatných nodoch) riešené
  skrátením `before` alebo cieleným node-patchom (#12, #16, #19).

## 4. Upload (Fáza 4) — priebeh a úzke hrdlo

- **Sériovo, 1 upload naraz** (idempotentné): `drain1` (11,13–20) → auto-chain → `drain2` (21–67).
- **Úzke hrdlo: ~1 fotka/min.** Príčina = `public/uploads/` je plochý priečinok s ~3000+ media
  (~15 000+ reálnych súborov: originál + 4 thumbnaily) na Windows NTFS → disk I/O sa spomaľuje
  s rastom počtu. Sekundárne: sharp thumbnaily, možný antivírus scan. **Nie RAM** (24 GB, 14 GB
  voľných) — starý údaj „8 GB RAM" v poznámkach bol nesprávny/iný stroj (odstránený).
- Cez noc stroj **zaspal** → jeden upload „trval" 5,5 h (pauza, nie zásek). Vyriešené
  `powercfg /change standby-timeout-ac 0` (+ hibernate).

## 5. Zádrhely a ich riešenia

| # | Problém | Riešenie |
|---|---|---|
| #8 | Veľký PNG leták (s0) → sharp timeout aj pri 3× 180 s | prepínač **`--prefer=s1600`** (menší variant, pre web stačí) |
| — | Klientský timeout 60 s < reálny upload 60–120 s → ECONNRESET | **`FETCH_TIMEOUT_MS` 60→180 s** (override `--timeout=`) |
| #16 | Vynechaný z drain1 (8 položiek namiesto 9) | dodatočne nahraté |
| #22/#39 | Rovnaký `nazov` „Darujte nám 2% z dane" (2016 aj 2018) → dedup PUT prepísal 2016 | prepínač **`--force-new`** (skip dedup) → 2 samostatné záznamy |
| #55 | 199-znakový filename bez prípony s `=` (blogger `/img/a/` hash `=s811`) → Strapi odmietol | **`safeFilename()`** sanitizácia (strip `=s\d+`, doplň `.jpg`, skráť) |
| #63 | „fotky 13 vs 17" | **nie chyba** — 4 obrázky bajtovo identické → SHA dedup na 13 |

## 6. Otvorené FLAG-y (na konzultáciu — `_AKTUALITY_FLAGS.md`)

§21.5: agent nahlási, neopravuje sám. **Nie sú to chyby uploadu.**
- Sploštené zoznamy bez zalomení (extrakčný artefakt): **#27** (lokality), **#44** (knihy),
  **#63** (zlepené nadpisy „KartágoKartágo").
- Chýbajúce slovo (§21.6 nedopĺňam): **#38** (predložka „na" pri čísle účtu), **#45** (sloveso pri mape).
- Dátum vs. obsah: **#52** (článok z 2020 spomína „2025/2026" — neskôr aktualizovaný).
- Poznámka ku kategorizácii (ponechané, len záznam): ankety=podujatie, michalovce=ine.

## 7. Zmeny v kóde (reverzibilné) a artefakty

**`_upload-aktuality.mjs`** (na disku, prežijú reštart):
- `FETCH_TIMEOUT_MS` default 180 s + `--timeout=`
- `--prefer=s1600` (swap preferred/fallback variantu)
- `--force-new` (skip `findExisting` dedup)
- `safeFilename()` sanitizácia názvov fotiek

**Skripty / audit:**
- `apply-grammar.mjs`, `_bulk-apply.mjs` (dávkové aplikovanie gramatiky)
- `out/aktuality-*.grammar.json` — audit každej gram. dávky (67×)
- `_verify-aktuality.mjs` — Fáza 6 verifikácia
- `_drain-uploads.sh`, `_drain2-uploads.sh`, `_chain-drain2.sh`, `_faza6.sh` — sériové drainy
- `_AKTUALITY_FLAGS.md` — otvorené FLAG-y

## 8. Ako overiť / zopakovať

```bash
# zdravie
curl http://localhost:1337/api/blog-categories        # rýchle 200
# verifikácia všetkých 67
node scripts/blog-migrate/_verify-aktuality.mjs
# re-upload jednej položky (idempotentné)
node scripts/blog-migrate/_upload-aktuality.mjs --slug=<slug> --prefer=s1600 --dry-run=false
```

# Plán dokončenia migrácie — 67 chýbajúcich príspevkov

Nadväzuje na `MIGRATION.md` (pipeline v6/v7) a audit
`hradiska-migration/MISSING_CONTENT_AUDIT.md` (+ `MISSING_CONTENT.json`).
Stav: **NÁVRH na odsúhlasenie. Nič sa nespúšťa, kým sa nedohodneme.**

## Zásada č. 1 — najprv všetko ULOŽIŤ, až potom nahrávať
Migrácia (upload s downloadom + uploadom obrázkov) je náročná na zdroje a
**zhadzuje PC** (viď MIGRATION.md §9.3). Preto rozdelíme na dve časti:

- **PRÍPRAVA (nenáročná, bezpečná):** extract + manuál + Agent 1 + grammar-sk
  korektúra pre VŠETKY položky → artefakty na disk (`out/<slug>.intermediate.json`,
  `.timeline.json`, `.grammar.json`, `.review.json`, `.report.md`). Toto vieme
  spraviť celé dopredu; ak PC spadne, nič sa nestratí, len sa pokračuje.
- **UPLOAD (náročný):** `upload.mjs --input=<jeden súbor>` **po jednom článku**,
  Strapi v produkčnom režime, throttle + retry + continue-on-error. Nikdy nie
  dávkovo cez celý `out/`. Po každom článku overiť (počet blokov, obrázky) a až
  potom ďalší.

## Zásada č. 2 — korektúra (grammar-sk) je povinná pre KAŽDÝ článok
Žiadny nový článok sa nenahrá bez prejdenia grammar-sk agentom (§21). Dobové
citáty (Holuby 1924, Janšák 1928 a pod.) sa **nedotýkajú** — chránené zóny.
Pri pochybnosti FLAG do `.review.json` a nechať na teba, nie tichý zásah.

---

## Kategórie — čo vytvoriť
Podľa dohody:
- **Nová kategória „Informačné tabule"** — 13 príspevkov o tabuliach OZ (aktivita
  združenia, nie encyklopedický článok o lokalite). Prepojenie na lokalitu cez tag.
- **Návrh: nová kategória „Výskumy a nálezy"** — reporty z výskumov/nálezov
  (Bronzový poklad, Prosné-Zlatý kôň výskum, Nálezy z Dolnej Marikovej…), aby sa
  neplietli s encyklopedickými článkami. *(potvrdiť — alebo dať do Aktualít)*
- **Výpravy → do Aktualít** (činnosť OZ), nie samostatná kategória — podľa dohody.
- **English — NEMIGROVAŤ** (3 položky vypadnú).
- **Indexové (Rozdelenie…, Videá) — NEMIGROVAŤ** (nahradené kategóriami; redirect).
- Články o hradiskách/odborné → existujúce kategórie podľa OBSAHU (Mocenské centrá,
  Staroveké hradiská, Odborné texty, Refugiá, Všeobecne, Listiny, Svätyne…).

---

## Rozsah — čo sa reálne migruje (56 z 67)
| Skupina | Počet | Kam |
|---|---|---|
| Skutočné články (hradiská + odborné) | 38 | existujúce kategórie podľa obsahu |
| Informačné tabule | 13 | nová kat. „Informačné tabule" |
| Výpravy | 5 | Aktuality |
| **Nemigruje sa** | | |
| English | 3 | — (vypadne) |
| Indexové | 3 | — (redirect na kategórie) |
| Stuby (aj prázdne, napr. „Film o VM" 32 z) | 5 | posúdiť 1-po-1, väčšina von |

*(Presné zaradenie každej položky do kategórie sa určí z OBSAHU pri príprave —
nie z názvu — kvôli duplicitám lokalít.)*

---

## Zdroj dát pre chýbajúce
- **Plný text:** `hradiska-migration/link_audit/data/all_posts_full.json`.
- **Obrázky + HTML:** `hradiska-migration/hradiska-web/<rok>/…`.
- **Blogger feed (pre extract.mjs):** starý web je stále živý → pre každú položku
  stiahnuť per-post feed (MIGRATION.md §4.1) do `data/<slug>.json`. To je vstup,
  ktorý extract.mjs očakáva (rovnaký flow ako pri pôvodných 305).

---

## Postup (fázy)

### F0 — Príprava zoznamu (uložiť)
Z `MISSING_CONTENT.json` spraviť pracovný zoznam 56 položiek s: slug, starý URL,
navrhovaná kategória (z obsahu), typ. Uložiť ako `out/_completion-queue.json`.

### F1 — Dávka PRÍPRAVY (bez uploadu, bezpečné pre PC)
Pre každú položku: fetch feed → `data/<slug>.json` → `extract.mjs` →
`out/<slug>.intermediate.json`. Manuál 1b (quote-blocky, lokalita, kategória).
Agent 1 (timeline/keyFacts). **grammar-sk korektúra** → `.grammar.json` + `.review.json`.
Všetko na disk. **Žiadny upload.** Priebežne commitovať artefakty.

### F2 — Kontrola (ty)
Prejsť `.review.json` FLAG-y (vecné/sémantické, ktoré agent zámerne nezmenil).
Schváliť. Toto je brána pred uploadom.

### F3 — UPLOAD po jednom (náročné, opatrne)
`upload.mjs --input=out/<slug>.intermediate.json --category=<docId>` — jeden po
druhom. Po každom: overiť v DB (bloky, obrázky, kategória), potom SEO
(metaTitle/metaDescription rovnakým procesom ako 305/305), až potom ďalší.

### F4 — Dokončenie SEO/infra
Po nahratí všetkých: regenerovať `sitemap.xml` + prerender hlavičky (nové URL
pribudnú automaticky zo search-index).

### F5 — Re-audit
Znovu spustiť porovnanie (nástroj z auditu) → cieľ **0 skutočných článkov chýbajúcich**.

### F6 — Redirecty (úplne posledné)
Mapa starý→nový podľa OBSAHU (nie názvu). Nespárované → 301 na kategóriu/domov.

---

## Rozhodnutia (odsúhlasené 2026-07-21)
1. **Výskumy/nálezy reporty → Aktuality** (nie samostatná kategória).
2. **Výpravy → Aktuality.**
3. **Jediná nová kategória: „Informačné tabule"** (13 položiek).
4. **Komentáre migrovať** — áno, ako pri celom blogu (2-pass threading, pipeline to vie).
5. **English (3) a indexové (3) — nemigrovať.**
6. **Stuby (5) — prejsť 1-po-1**, prázdne (napr. „Film o VM" 32 z) vynechať.

→ Aktualizovaný rozsah: **~51 migrovaných** (38 článkov + 13 tabúľ + 5 výprav +
report-y do Aktualít; − prázdne stuby), do **existujúcich kategórií + 1 nová**.

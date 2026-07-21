# DODATOK / RESUME — dokončenie migrácie (živý stav)

Tento súbor je **záchranná stopa**: ak session/PC spadne, z neho sa dá pokračovať
bez straty kontextu. Nadväzuje na `MIGRATION.md` (pipeline v6/v7) a
`MIGRATION_COMPLETION_PLAN.md` (plán + rozhodnutia). **Posledný update: 2026-07-21.**

## Čo robíme
Dokončujeme migráciu **67 príspevkov, ktoré nepreslo** pôvodnou migráciou (Strapi
malo 305, starý web 335). Audit: `hradiska-migration/MISSING_CONTENT_AUDIT.md`.
Migruje sa **60** (English 3 + indexové 3 + 1 prázdny stub sa vynechávajú).
Fronta so zaradením: **`hradiska-migration/out_completion-queue.json`** (má `interSlug`).

## Rozhodnutia (LOCKED)
- Nová kategória **„Informačné tabule"** — VYTVORENÁ, documentId `p35lgrkwzfg3vc0y6ngz9xun`.
- Výpravy + výskumy/nálezy/reporty → **Aktuality**. English + indexové → NEMIGROVAŤ.
- **Komentáre migrovať** (2-pass threading, upload.mjs to vie).
- Stuby prejsť 1-po-1; prázdne vynechať.
- **grammar-sk korektúra je povinná pre každý článok** (§21); dobové citáty chránené;
  moderná literatúra (napr. Janšák 1968) sa OPRAVUJE, nie je chránená zóna.

## Pipeline pre 1 článok (príprava — bezpečné pre PC)
```
1. fetch-post.mjs --id=<postId> --slug=<interSlug>   → data/<interSlug>.json   (obalí feed)
2. extract.mjs --post=data/<interSlug>.json          → out/<TITLE-slug>.intermediate.json
   ⚠ extract.mjs pomenúva výstup podľa SLUGU Z NÁZVU, nie z URL! Preto queue má `interSlug`
     = skutočný názov súboru (spárované cez $meta.bloggerPostUrl). VŽDY používaj interSlug.
3. 1b manuál: kategória z fronty; lokalita (ak zdroj nedáva súradnice → FLAG, NEVYMÝŠĽAŤ);
   dobové citáty (kronika/listina) → quote-block (moderná literatúra NIE)
4. Agent 1: out/<interSlug>.timeline.json  (keyFacts+timeline, LEN zo zdroja)
5. grammar-sk: out/<interSlug>.grammar.json (before→after) + out/<interSlug>.review.json (FLAG-y)
```
**Upload (F3) sa NEROBÍ počas prípravy** — je náročný a zhadzuje PC. Až po celej
príprave a schválení: `upload.mjs --input=out/<interSlug>.intermediate.json --category=<docId>`
PO JEDNOM článku, potom SEO (metaTitle/metaDescription), potom ďalší.

## AKO ZISTIŤ STAV / POKRAČOVAŤ (self-tracking)
Hotové = existuje `out/<interSlug>.grammar.json`. Zoznam čo zostáva:
```bash
cd hradiska-strapi/scripts/blog-migrate && node -e "
const fs=require('fs');const q=JSON.parse(fs.readFileSync('../../../hradiska-migration/out_completion-queue.json','utf8')).items;
const todo=q.filter(i=>!fs.existsSync('out/'+(i.interSlug||i.slug)+'.grammar.json'));
console.log('ZOSTÁVA',todo.length);todo.forEach(i=>console.log((i.interSlug||i.slug)+'  ['+i.category+']'));"
```
Výpis tela na korektúru: `node dump-body.mjs <interSlug> [...]`

## STAV k 2026-07-21
- **Feedy stiahnuté: 60/60** (data/*.json). **Extract: 60/60** (out/*.intermediate.json).
- **grammar-sk korektúra HOTOVÁ: 9/60** — nitra-v-9-storoci, 3d-rekonstrukcia-velmozskeho-
  dvorca-v-ducovom-kostolci, janovce-machalovce, archeologicke-kultury-na-slovensku-datovanie,
  skalica-hradisko-na-kalvarii, trstin-novy-hradok, okopanec-borinka, ponicka-huta-na-klastore,
  unin-zamcisko.
- **Zostáva 51** (viď príkaz vyššie): 13 informačné tabule, 13 aktuality (vr. 5 výprav),
  9 staroveké sídla, 5 všeobecne, 4 svätyne, 4 3D, 2 listiny, 1 povesti.
- **Upload: 0/60** (nezačaté). Redirecty (F6): nezačaté, robiť ÚPLNE posledné, podľa OBSAHU.

## Kľúčové pasce
- `interSlug` ≠ URL-slug (viď krok 2). Fronta má `interSlug` — používať ho.
- Jednopostový feed vracia `{entry}` na top-level; `fetch-post.mjs` ho obalí do `{feed:{entry:[…]}}`.
- Upload zhadzuje PC (MIGRATION.md §9.3) — príprava nie. Preto prípravu spraviť CELÚ prv.
- STRAPI_TOKEN je v `hradiska-strapi/.env` (auto-load). Nezdieľať v chate.
- Súvisí s memory: [[migration-gap-missing-content]], [[seo-overhaul-progress]], [[migration-pipeline-v6]].

## Nástroje (nové v tejto session)
- `fetch-post.mjs` — stiahne+obalí Blogger feed (`--id --slug` alebo `--queue`).
- `dump-body.mjs` — read-only výpis tela na korektúru.
- `hradiska-migration/MISSING_CONTENT.json`, `out_completion-queue.json` — dáta.

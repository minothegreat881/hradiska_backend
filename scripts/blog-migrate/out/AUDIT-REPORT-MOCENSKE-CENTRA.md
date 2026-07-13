# Audit report — Mocenské centrá (29 článkov)

Kompletný report z spätného auditu integrity celej dávky, vyvolaného otázkou:
*"Report neuvádza pokrytie textu, gramatické opravy a kontrolu úplnosti — over to."*

**Krátka odpoveď:** mal si pravdu. Pôvodné behy `report.mjs` počas migrácie bežali bez `--feed`,
takže sa reálne percento pokrytia textu vôbec nepočítalo — konzola ukázala len "gramatika: 0
opráv", čo som nesprávne interpretoval ako "skontrolované, čisté". Pri poriadnom overení (s
`--feed`, teda porovnaním proti originálnemu Blogger HTML) sa našli **3 samostatné, reálne bugy**,
ktoré postihli **20 z 29 živých článkov**. Všetky sú teraz opravené a overené.

---

## 1. Čo presne zlyhalo v pôvodnom procese

| Kontrola, ktorú si žiadal | Stav počas migrácie | Stav teraz |
|---|---|---|
| Pokrytie textu vs. originál (%) | **Nepočítalo sa** (chýbal `--feed` parameter) | Prepočítané pre všetkých 29, `--feed` proti originálnemu Blogger HTML |
| Gramatické opravy (Agent 2) | **Nebežal formálny pass** — len ručné ad-hoc regex kontroly (chýbajúce medzery, duplicitné slová) počas konverzácie, bez audit súboru | Zostáva rovnaký stav — pozri sekciu 5 |
| Duplicitné zdroje | Testované len *vnútri* `sources` bloku (0 nájdených) — nesprávny test | Nájdený skutočný vzor: text duplikovaný medzi telom a `sources` súčasne. 7 článkov opravených |
| Entity v komentároch | Netestované predtým | Otestované teraz: 0/65 komentárov malo nedekódované `&quot;` a pod. — v poriadku |
| "Nešpecifikovaná" lokalita | Nekomentované | Overené v texte: zámer (2 prehľadové články) |
| Autor "Unknown" | Nekomentované | Overené v zdroji: verná extrakcia (2 články majú v Bloggeri doslova "Unknown") |

---

## 2. Bug #1 — `extract.mjs`: obsah mimo `<div>` sa ticho zahodil

**Príčina:** Parser zbieral len priame `<div>`/`<table>` deti `<body>`. Staršie Blogger články
(copy-paste z Wordu/Google Docs) občas majú úvodnú vetu, mapový `<iframe>` alebo záverečné
citácie ako **holý text/inline tag priamo pod `<body>`**, bez obaľujúceho divu — parser ich
jednoducho preskočil, bez chyby či varovania.

**Dopad — potvrdená reálna strata textu:**

| Článok | Čo presne chýbalo |
|---|---|
| Klučov | Celá úvodná veta článku ("Podrobný výskum tohto slovanského hradiska...") |
| Ducové - Kostolec | Celý úvodný odsek s popisom polohy hradiska (~70 slov) |
| Nitrianske Pravno - Vyšehrad | 5 bibliografických položiek (Remiášová, Janšák, kniha Nitrianske Pravno, AVANS, Dvořák) |
| Pobedim | Citačný riadok (Laco Zrubec: Poklady Zeme) + fotokredit |
| Trenčín | Celý zoznam 6 odkazov + fotokredit |
| Vyšný Kubín | Literatúra (Hulínek/Čajka) + "bonus" odsek so starými fotkami |
| Libice | **Najzávažnejší prípad — pozri nižšie** |

**Oprava:** nová funkcia `wrapOrphanTopLevelContent()` v `extract.mjs` — pred spracovaním
zabalí každý osirelý beh obsahu do syntetického `<div>` na správnej pozícii v dokumente, takže
prejde rovnakým spracovaním ako všetko ostatné. Regresne otestované proti všetkých 29 článkov —
žiadny regres, len prírastky.

### Libice — samostatný, závažnejší bug v tom istom súbore

Toto nebola strata textu v zmysle "chýbajúce slová" (percento pokrytia to preto ani neodhalilo
spoľahlivo — slová *boli* prítomné, len na zlom mieste). Bare URL citácia uprostred článku
("http://www.slovane.cz/...") omylom spustila heuristiku na detekciu hranice zdrojov, ktorá potom
**celú druhú polovicu článku** — nadpis, obrázok a 8 odsekov o vyvraždení Slavníkovcov (995 n. l.)
— zaradila ako "citáciu" namiesto tela článku. Čitateľ by tak videl dramatický príbeh masakry
narvaný v postrannom paneli "Zdroje a literatúra" ako holý zoznam, nie ako čitateľný text.

Opravené ručne: text rekonštruovaný späť do tela ako nadpis + obrázok (Model.JPG, ktorý bol
mimochodom nahraný do knižnice médií, ale nikdy nepriradený k žiadnemu bloku) + 8 odsekov;
`sources` blok zredukovaný na skutočné 4 citácie.

---

## 3. Bug #2 — `upload.mjs`: dedup obrázkov podľa mena súboru, nie podľa obsahu

**Príčina:** Kód mal komentár priznávajúci kompromis: *"Pre dedup voči existujúcim files by sme
museli každý stiahnuť — namiesto toho použijeme filename match ako pragmatický pre-check (žiadny
z 54 nemá kolízne mená, takže sa neaplikuje)."* Toto platilo pre prvú dávku (54 súborov), ale
rozpadlo sa v Mocenské centrá batchi, keď viacerí autori nezávisle použili generické mená ako
`a.jpg`, `b.jpg`, `mapa.jpg`, `IMG_4111.JPG`.

**Dopad — potvrdené krížové zamenenie fotiek a popisov medzi nesúvisiacimi článkami:**

Napríklad Ducové, Vyšný Kubín a "Slovanské hradiská v Nemecku" zobrazovali vo svojej galérii fotky
a popisky patriace **Spišským Tomášovciam** ("Pamätná tabuľa pred hotelom Čingov", "hotelom Flora")
— text, ktorý s ich vlastným obsahom nemá nič spoločné. Celkovo **20 kolízií mien súborov naprieč
minimálne 12 článkami**.

**Oprava:** dedup teraz ide výhradne cez SHA-256 obsahu (vždy sa stiahne, spočíta hash, porovná
proti perzistentnému indexu naprieč všetkými behmi — `out/_media-sha256-index.json`, spätne
naplnenému z 35 existujúcich upload-logov). Meno súboru sa už na rozhodnutie o reuse nepoužíva.

Po oprave: **0 zostávajúcich kolízií** (overené: rovnaký SHA-256 vždy mapuje na rovnaké médium ID,
naprieč všetkými 29 článkami).

---

## 4. Bug #3 — duplicitný text medzi telom a `sources` blokom

**Príčina:** Nesúvisí s vyššie uvedenými dvomi. Záverečné citačné riadky ("Spracoval: Orgoň",
literatúra), ktoré parser správne rozpoznal a zaradil do `sources` bloku, **zostali navyše aj ako
samostatné odseky v tele článku** — ten istý text sa tak čitateľovi zobrazil dvakrát.

**Potvrdené na 7 živých článkoch:** Klučov, Chotěbuz-Podobora, Nitrianska Blatnica, Zemplín,
Svätý Jur-Neštich, Trenčín, Nitrianske Pravno.

**Oprava:** odstránené duplicitné odseky z tela; `sources` blok zostáva ako jediný zdroj tejto
informácie. Opravu som pri prvom prechode omylom o 1 index posunul pri Klučove (zmazal reálny
odsek namiesto duplicitu) — všimol som si to pri kontrole pokrytia (kleslo na 92 %), opravil a
znovu overil (99,82 %). Rovnaký druh chyby (o 1 blok posunuté mazanie) sa zopakoval pri Trenčíne
(druhá citácia zostala) — nájdené a opravené finálnym plošným re-scanom.

---

## 5. Gramatika — čo naozaj prebehlo

**Nebežal formálny "Agent 2" gramatický pass** na žiadnom z 29 článkov tejto dávky (0 súborov
`out/<slug>.grammar.json` — porovnaj so staršími článkami Arkona/Velehrad/Mikulčice/Blatnohrad/
Wogastisburg/Nitra, ktoré ho majú). Namiesto toho som počas spracovania každého článku spúšťal len
dva úzke regex testy priamo v konzole:

- chýbajúca medzera za bodkou pred veľkým písmenom (`\.[A-Z]`)
- bezprostredne opakované slovo (`\b(\w+)\s+\1\b`)

Toto zachytilo a opravilo desiatky reálnych preklepov (napr. `Bez zmeny.Nasledujúca` →
`Bez zmeny. Nasledujúca`), ale je to výrazne užší záber než plný jazykový pass (nezachytí zlú
zhodu podmet-prísudok, i/y, pád, interpunkciu v zloženejších vetách a pod.). Toto by som odporučil
ako samostatný krok, ak chceš mať istotu na úrovni, akú mali Arkona/Velehrad.

---

## 6. Finálny stav — všetkých 29 článkov

Legenda: **✅ opravené** = dotknuté jedným z bugov vyššie, opravené a re-nahraté. **fotky** = len
media re-upload (obsah nebol dotknutý). **čisté** = nebol dotknutý žiadnym z nájdených bugov.

| # | Článok | Bloky | Galéria | Komentáre | Stav |
|---|---|---:|---:|---:|---|
| 1 | Beckov (Slovanské Hradisko) | 19 | 8 | 0 | čisté |
| 2 | Bojná - Významné Veľkomoravské centrum | 88 | 95 | 11 | ✅ fotky |
| 3 | Bíňa | 60 | 57 | 1 | čisté |
| 4 | Bratislava | 48 | 17 | 0 | ✅ fotky |
| 5 | Břeclav - Pohansko | 12 | 8 | 2 | čisté |
| 6 | Chotěbuz - Podobora | 31 | 48 | 0 | ✅ opravené (orphan text + telo/zdroj duplicita) |
| 7 | Devín | 72 | 57 | 1 | ✅ fotky |
| 8 | Náučný chodník Divinka - Veľký vrch | 8 | 21 | 0 | ✅ fotky |
| 9 | Ducové - Kostolec | 27 | 43 | 13 | ✅ opravené (orphan text) |
| 10 | Gars - Thunau (Rakúsko) | 22 | 19 | 0 | ✅ fotky |
| 11 | Klučov | 25 | 16 | 0 | ✅ opravené (orphan text + telo/zdroj duplicita) |
| 12 | Libice - hlavné hradisko Slávnikovcov | 19 | 3 | 0 | ✅ opravené (**celá polovica článku zle zaradená**) |
| 13 | Slovanské hradiská v Nemecku | 46 | 62 | 4 | ✅ fotky |
| 14 | Nitrianska Blatnica - rotunda Blatnický Ďurko | 15 | 15 | 0 | ✅ opravené (telo/zdroj duplicita) |
| 15 | Nitrianske Pravno/Jasenovo - Vyšehrad | 57 | 30 | 3 | ✅ opravené (orphan text + telo/zdroj duplicita) |
| 16 | Novohrad (Nógrád) (H) | 12 | 7 | 0 | čisté |
| 17 | Slovanské Hradiská na Orave | 35 | 8 | 2 | čisté |
| 18 | Pobedim | 66 | 36 | 11 | ✅ opravené (orphan text) |
| 19 | Seňa | 27 | 11 | 2 | čisté |
| 20 | Spišské Tomášovce | 25 | 23 | 1 | ✅ fotky |
| 21 | Starý Tekov | 12 | 14 | 0 | čisté |
| 22 | Svätý Jur - Neštich | 52 | 37 | 4 | ✅ opravené (telo/zdroj duplicita); ⚠ pozri follow-up |
| 23 | Tlmače - Festunok | 20 | 22 | 0 | ✅ fotky |
| 24 | Trenčín - Veľkomoravské hradisko | 29 | 45 | 8 | ✅ opravené (orphan text + telo/zdroj duplicita ×2) |
| 25 | Visegrad (Maďarsko) | 20 | 13 | 0 | čisté |
| 26 | Vyšný Kubín - OSTRÁ SKALA | 30 | 22 | 0 | ✅ opravené (orphan text) + 2 zvyškové captiony vyčistené |
| 27 | Zemplín | 10 | 18 | 0 | ✅ opravené (telo/zdroj duplicita) |
| 28 | Zvolen - Môťová, hrádok Priekopa | 28 | 17 | 0 | ✅ fotky |
| 29 | Šarišské Sokolovce | 41 | 7 | 2 | čisté |

**Súhrn:** 9 článkov nedotknutých žiadnym bugom, 9 dostalo len opravu fotiek (obsah bol vždy v
poriadku), 11 malo reálny problém s obsahom — všetky opravené a znovu overené.

### Pokrytie textu (11 obsahovo dotknutých článkov, po oprave)

| Článok | Pokrytie |
|---|---:|
| Nitrianske Pravno - Vyšehrad | 100,00 % |
| Pobedim | 99,94 % |
| Vyšný Kubín | 99,88 % |
| Trenčín | 99,75 % |
| Libice | 99,64 % |
| Svätý Jur - Neštich | 99,65 % |
| Nitrianska Blatnica | 99,58 % |
| Ducové - Kostolec | 99,57 % |
| Klučov | 99,82 % |
| Zemplín | 99,08 % |
| Chotěbuz - Podobora | 97,88 % *(vysvetlené — pozri nižšie)* |

Chotěbuz pod 99 %: odstránené boli len redundantné nadpisy ("Fotogaléria:", "Literatúra:") a
jeden nefunkčný obrázkový hyperlink, ktoré sa už duplicitne nachádzali v `sources` bloku — nie
reálna strata informácie.

---

## 7. Otvorené na tvoje rozhodnutie

**Svätý Jur - Neštich — fotogaléria.** Pri čistení duplicít sa ukázalo, že 13 fotiek z tzv.
"Neštich 5.1.2012" sekcie skončilo ako holé URL adresy v `sources` bloku namiesto v galérii
(samostatný, menší prejav toho istého vzoru ako pri Libiciach). Vyčistil som `sources` (odstránené
nezmyselné URL položky), ale samotné fotky som **nezaradil naspäť** ako obrázky — vyžadovalo by to
opätovné stiahnutie a vloženie 13 obrázkov, čo som nechcel robiť bez potvrdenia. Chceš to dorobiť?

---

## 8. Zmeny v repozitári

- `scripts/blog-migrate/extract.mjs` — `wrapOrphanTopLevelContent()` (Bug #1)
- `scripts/blog-migrate/upload.mjs` — SHA-256 dedup namiesto filename (Bug #2)
- `scripts/blog-migrate/out/_media-sha256-index.json` — nový perzistentný index (spätne naplnený)
- 11 × `<slug>.intermediate.json` — opravený obsah
- Commit: `fix(migrate): recover orphaned top-level content, fix media SHA-256 dedup, remove body/sources duplication`

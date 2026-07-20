# Aktuality — FLAG-y na ručnú úpravu / konzultáciu

grammar-sk v7 §21.5: agent tieto veci **neopravuje sám**, len nahlási. Zaznačené počas
gramatického prechodu (dávky 1–8). Položky idú live tak, ako sú; opraviť po konzultácii.

## Štrukturálne — sploštené zoznamy (chýbajú zalomenia, zlepené slová)
Extrakčný artefakt: viacero položiek zoznamu splynulo do jedného odseku bez oddelenia.
- **#27 `hladajte-na-hradiskach-poklady`** blok [17]: „…Pružina - MesciskáNosice - HradiskoLiptov:Havránok…" — zoznam lokalít bez zalomení.
- **#44 `knihy-o-slovanoch`** blok [11]: „…Homza: Svätopluk v európskom písomníctveTurčan: Veľkomoravské hradiská…" — zoznam kníh bez zalomení.
- **#63 `putovanie-…-afrike`** [3] „KartágoKartágo má mnoho…", [6] „…nové mesto".História…" — zlepené nadpisy/vety.

## Chýbajúce slovo (MISSING_WORD — §21.6 nedopĺňam vetu)
- **#38 `vychadza-prvy-diel-…`** [4]: „…môže **tomto čísle účtu**:" — chýba predložka „na".
- **#45 `mapa-…-obchodnych-ciest`** [0]: „Martin Janmansson vytvoril a na stránke Merchant machine **[?]** zaujímavú mapu." — chýba sloveso (zverejnil/uverejnil).

## Vecné / dátumové
- **#52 `2-z-vasich-dani-…`** (datum 2020-03): telo spomína „V roku 2025" a „v roku 2026" — obsah bol zjavne neskôr aktualizovaný; dátum vs. obsah nesúladí. Blok [0] „na **5 slovanskom** mohylníku" — garbled (číslo tabúľ vs. poradie?).

## Poznámky ku kategorizácii (ponechané per rozhodnutie používateľa — NEMENIŤ, len záznam)
- `anketa-2014-maj`, `anketa-2014-jul` → `typAktivity=podujatie` (anketa ~ skôr `ine`).
- `michalovce-…-morave` → `typAktivity=ine` (ide o `podujatie`).

## Chránené zóny (correct — len pre prehľad, žiadna akcia)
Nedotknuté cudzojazyčné/verbatim pramene: #8 česká pozvánka, #16 recenzia HISTORYWEB,
#18/#19 texty organizátorov, #30 článok Stanekovej (+ dobové citáty), #43 Žiarislav,
#59 český názov knihy, #65 český projektový text AV ČR.

## Kolízia názvov (zistené pri uploade drain2) — RIEŠIŤ vo Fáze 6
- **#22 `darujte-nam-2-z-dane-2016`** vs **#39 `darujte-nam-2-z-dane-2018`**: oba majú `nazov="Darujte nám 2% z dane"`. `_upload-aktuality.mjs` deduplikuje podľa `nazov` (findExisting) → #39 spravilo PUT nad záznamom #22, takže 2016 verzia bola prepísaná obsahom 2018. Výsledok: 1 záznam namiesto 2.
- **Fix:** odlíšiť titulok jednej z nich (napr. "Darujte nám 2% z dane (2016)") a POST-núť samostatne. Skontrolovať aj ďalšie duplicitné `nazov` pred re-uploadom.

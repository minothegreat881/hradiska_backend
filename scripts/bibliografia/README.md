# Bibliografia — zjednotenie tvaru mien a poradia

Zdroje a literatúra sa za roky nazbierali v desiatkach zápisov: raz
`Pavel Dvořák:`, inokedy `DVOŘÁK, P. 2004:` alebo `P. Dvořák –  Z. Poláková`.
Tieto skripty z nich spravia jeden tvar — **`Priezvisko I.: dielo`** — zoradia
záznamy podľa priezviska a odkazy odsunú na koniec.

## Súbory

| súbor | čo robí |
|---|---|
| `pravidla.cjs` | rozpoznanie autora, zjednotenie tvaru, zatriedenie (autor / poznámka / odkaz) |
| `zapis.cjs` | prepíše databázu (bez prepínača beží nasucho) |
| `kontrola.cjs` | overí výsledok: abeceda, odkazy na konci, prázdne položky |
| `vypis.cjs` | vypíše bibliografiu jedného článku aj so zatriedením |

Spúšťa sa z koreňa projektu na serveri, kde je databáza:

```
node scripts/bibliografia/zapis.cjs              # nasucho, nič nezapíše
VYPIS=1 node scripts/bibliografia/zapis.cjs      # + vypíše navrhované prepisy
node scripts/bibliografia/zapis.cjs --zapisat    # zapíše
node scripts/bibliografia/kontrola.cjs
node scripts/bibliografia/vypis.cjs <slug>
```

## Prečo priamo do databázy, a nie cez API

`PUT` s poľom `blocks` prepíše **celú** dynamickú zónu, takže by sa musel
poslať každý blok článku znova — vrátane obrázkov a bohatého textu (viď
`savePost.ts` vo frontende). Tu sa pritom menia dva stĺpce: `text` v
`components_shared_source_items` a `order` v linkovacej tabuľke. Skript preto
siaha rovno na ne a ničoho iného sa nedotkne. Mení koncept **aj** publikovanú
verziu — každá má vlastné riadky komponentov.

Po zápise treba reštartovať Strapi (`systemctl restart hradiska`), inak API
vracia staré poradie z pamäte.

## Čoho sa skript nedotkne

* **Články s číslovanými poznámkami** (`1. …`, aj bez bodky `1 Grekov, B. D.: …`).
  To nie je bibliografia, ale poznámkový aparát — poradie v ňom nesie význam.
* **Články, kde sa do zdrojov rozsypalo telo článku** (známy defekt migrácie):
  `spissky-stvrtok-slovenske-mykeny`, `belusske-slatiny-hradisko`,
  `zilina-zastranie-stranik`. Sú vymenované v `zapis.cjs`.
* **Záznamy s viacerými autormi** — tie sa len zaradia podľa prvého priezviska,
  text ostáva slovo za slovom taký, aký bol.
* **Čokoľvek, čo sa nepodarí bezpečne rozobrať** — ostáva doslovne a skončí
  v skupine poznámok medzi literatúrou a odkazmi.

## Dve pasce, na ktorých to už raz stálo

1. **Spätné lomítka.** V bežnom reťazci ich JS zhltne (`'\s'` je len `s`),
   takže sa výraz tvári, že funguje, a pritom porovnáva niečo iné — z mena
   `MALEC` spravil `Lec`. Preto sú tu všetky triedy bez lomítok: namiesto
   `\s` je `[ ]`, namiesto `\.` je `[.]`.
2. **Vzor nesmie zhltnúť rok.** Vzor pre `Priezvisko I. rok:` má rok
   v predvídaní (lookahead), inak by ho prepis zmazal. Vzor pre dve iniciály
   text vôbec neprepisuje — druhú iniciálu by zahodil.

## Stav k 27. 9. 2026

375 blokov prejdených, 0 chýb, 0 prázdnych položiek. Opakované spustenie už
nič nemení. Preskočených 12 článkov (viď vyššie).

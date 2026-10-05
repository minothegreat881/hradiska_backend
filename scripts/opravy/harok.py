"""Kontaktný hárok z dávky fotiek — mriežka očíslovaných zmenšenín.

Jeden obrázok namiesto šestnástich: dávka sa dá pozrieť naraz a čísla v rohu
sedia s poradím v `davka.json`.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

BUNKA = 400          # strana jednej dlaždice
STLPCOV = 4
RAM = 6
POZADIE = (24, 24, 28)
POPISKA = (250, 250, 250)


def main(adresar: str) -> None:
    kam = Path(adresar)
    davka = json.loads((kam / "davka.json").read_text(encoding="utf-8"))
    riadkov = (len(davka) + STLPCOV - 1) // STLPCOV
    harok = Image.new("RGB", (STLPCOV * BUNKA, riadkov * BUNKA), POZADIE)
    kresli = ImageDraw.Draw(harok)

    for i, polozka in enumerate(davka):
        cesta = kam / f"{polozka['id']}.obr"
        x = (i % STLPCOV) * BUNKA
        y = (i // STLPCOV) * BUNKA
        try:
            obr = Image.open(cesta).convert("RGB")
            obr.thumbnail((BUNKA - 2 * RAM, BUNKA - 2 * RAM), Image.LANCZOS)
            harok.paste(obr, (x + (BUNKA - obr.width) // 2, y + (BUNKA - obr.height) // 2))
        except Exception as chyba:            # poškodený alebo neznámy formát
            kresli.text((x + 20, y + 20), f"? {chyba}"[:40], fill=POPISKA)

        # Číslo dlaždice — vľavo hore, na tmavom podklade, nech je čitateľné.
        kresli.rectangle([x + 4, y + 4, x + 54, y + 34], fill=(0, 0, 0))
        kresli.text((x + 14, y + 11), str(i + 1), fill=POPISKA)

    cielova = kam / "harok.png"
    harok.save(cielova)
    print(f"[hárok] {cielova} — {len(davka)} fotiek, {harok.width}×{harok.height}")


if __name__ == "__main__":
    main(sys.argv[1])

#!/usr/bin/env python3
"""Hazır yazı tipi kütüphanesini `public/fonts/library` altına üretir.

Normalde çalıştırmaya gerek yok: üretilen .ttf dosyaları depoda duruyor.
Kütüphaneye font eklemek ya da bir ağırlığı değiştirmek gerektiğinde:

    python3 -m venv .venv-font && .venv-font/bin/pip install fonttools brotli
    .venv-font/bin/python scripts/font-library.py

Üç işlem yapılıyor, üçü de gerçek bir sorunu çözüyor:

1. AĞIRLIĞA SABİTLEME. Google Fonts artık çoğu aileyi yalnızca değişken font
   olarak yayınlıyor. opentype.js değişken fontu ekseninin en başında, yani
   en ince ustada açıyor: "Montserrat" yerine "Montserrat Thin" geliyor ve
   baskıda harfler saç teli gibi çıkıyor. Her aile burada tek bir ağırlığa
   sabitleniyor.

2. GSUB'IN ATILMASI. opentype.js 2.0.0 bazı bağlamsal değiştirme tablolarını
   desteklemiyor ve font YÜKLENİRKEN hata fırlatıyor
   ("substitutionType : 62 lookupType: 6 - substFormat: 2 is not yet
   supported"). Lora ve Great Vibes bu yüzden hiç açılmıyordu. Ligatüre
   ihtiyacımız yok; tabloyu atınca hem sunucu hem tarayıcı harfleri aynı
   şekilde diziyor, yani müşterinin gördüğü önizleme baskıya birebir uyuyor.

3. ALT KÜME. Tam Unicode kapsamı müşteri sayfasına boşuna yük bindiriyordu
   (Cormorant tek başına 750 KB). Latin + Latin-1 + Latin Genişletilmiş-A
   birlikte Türkçe, Almanca, Fransızca, İspanyolca, Lehçe ve Çekçe'yi
   karşılıyor. Sekiz fontun toplamı 2 MB'tan 400 KB'a iniyor.

Fontların hepsi SIL Open Font License 1.1; lisans metni fontların yanında.
"""

import os
import subprocess
import sys
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

KAYNAK = "https://raw.githubusercontent.com/google/fonts/main/ofl"

# (google/fonts yolu, sabitlenecek wght, çıktı adı)
ISLER = [
    ("montserrat/Montserrat%5Bwght%5D.ttf",               600, "montserrat.ttf"),
    ("poppins/Poppins-Medium.ttf",                       None, "poppins.ttf"),
    ("quicksand/Quicksand%5Bwght%5D.ttf",                 600, "quicksand.ttf"),
    ("oswald/Oswald%5Bwght%5D.ttf",                       500, "oswald.ttf"),
    ("playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",     600, "playfair.ttf"),
    ("cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf", 600, "cormorant.ttf"),
    ("dancingscript/DancingScript%5Bwght%5D.ttf",         700, "dancing-script.ttf"),
    ("greatvibes/GreatVibes-Regular.ttf",                None, "great-vibes.ttf"),
]

UNICODE = ",".join([
    "U+0020-007E",   # temel latin
    "U+00A0-00FF",   # latin-1: ç ö ü ğ dışındakiler, aksanlı harfler
    "U+0100-017F",   # latin genişletilmiş-A: ğ Ğ ş Ş İ ı burada
    "U+018F", "U+0192", "U+01FA-01FF", "U+02C6-02DD",
    "U+2000-206F",   # tırnak, tire, üç nokta
    "U+20AC", "U+20BA",  # € ₺
    "U+2122", "U+25CA",
])

HEDEF = os.path.join(os.path.dirname(__file__), "..", "public", "fonts", "library")


def main() -> int:
    os.makedirs(HEDEF, exist_ok=True)
    gecici = os.path.join(HEDEF, ".ham")
    os.makedirs(gecici, exist_ok=True)

    for yol, agirlik, cikti in ISLER:
        ham = os.path.join(gecici, cikti)
        urllib.request.urlretrieve(f"{KAYNAK}/{yol}", ham)

        f = TTFont(ham)
        if agirlik is not None:
            f = instancer.instantiateVariableFont(f, {"wght": agirlik}, updateFontNames=True)
        if "GSUB" in f:
            del f["GSUB"]
        f.save(ham)

        hedef = os.path.join(HEDEF, cikti)
        subprocess.run([
            sys.executable, "-m", "fontTools.subset", ham,
            f"--unicodes={UNICODE}",
            "--drop-tables=GSUB",
            "--layout-features=kern",
            "--name-IDs=*",
            "--notdef-outline",
            f"--output-file={hedef}",
        ], check=True)

        ad = TTFont(hedef)["name"].getDebugName(1)
        print(f"{cikti:<20} {ad:<32} {os.path.getsize(hedef):>7} bayt")

    for ad in os.listdir(gecici):
        os.remove(os.path.join(gecici, ad))
    os.rmdir(gecici)
    print("\nKütüphaneye font eklediyseniz app/lib/font-library.ts içine de ekleyin.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# Fotografie osob (FamilyTree 1.2.2)

V dialogu **Upravit osobu** se zobrazuje **Fotografie osoby**. Pokud jde o novou osobu, nejprve ji uložte; fotografie lze připojit až k existující osobě.

1. Použijte **Vybrat fotografii (JPG, PNG, WebP)**. Původní snímek zůstává uložený bez úprav.
2. Čtvercový portrét posouvejte tažením, přibližte posuvníkem a otočte doleva/doprava o 90°. Výřez se ukládá zvlášť jako JPEG.
3. Zvolte **Použít jako hlavní portrét** a klikněte na **Uložit fotografii**. Portrét se zobrazí v kartě osoby, detailu i stromu.
4. Každá osoba může mít více fotografií. U každé lze **Nastavit jako hlavní**, **Oříznout / otočit** (znovu načítá nezměněný originál), **Originál** (otevřít) nebo **Odstranit**.

Nové fotografie jsou uložené v soukromém aplikačním úložišti **Nextcloud AppData**. Zapisování přímo do Files vlastníka sdíleného rodokmenu by při práci jiného uživatele mohlo vyvolat chybu verzování souborů. Starší fotografie uložené v Files vlastníka se nadále načítají; při další úpravě výřezu se originál zkopíruje do AppData a zůstane neporušený. Přístup stále ověřuje chráněné API aplikace podle oprávnění k rodokmenu. Nepotřebují veřejnou URL. Externí odkaz na fotografii zůstává dostupný jako starší volitelný způsob, ale externí obsah se nestahuje a není součástí úplné zálohy.

Logická struktura cest v databázi: `Rodokmen/Fotografie/<SQL-ID-rodokmenu>/<stabilní-ID-osoby>/<ID-fotografie>/original.jpg|png|webp` a `portrait.jpg`. V tabulce `hc_familytree_documents` jsou záznamy `document_type=person_photo`, `file_path` ukazuje na originál a `source` na výřez; hlavní portrét ukazuje přes `people.photo_url` na výřez. To umožňuje zachovat **stávající 13tabulkové schéma**, bez další migrační tabulky. AppData používá vlastní interní ploché složky pojmenované podle rodokmenu, osoby a fotografie. Nezasahujte do souborů ručně: změnila by se jejich vazba v aplikaci.

**Úplná nativní ZIP záloha v2** zahrnuje **originály i výřezy** všech fotografií; jejich dostupnost a SHA-256 kontroluje validátor zálohy. Obnova zakládá nový rodokmen a přemapovává jejich cesty na ID obnoveného rodokmenu a osoby. Před nasazením si ověřte praktický export a import na testovací instanci.

**GEDCOM 7 `.ged` neobsahuje binární obrázky** a GEDZIP výměnný export v této verzi nebyl rozšířen o nové fotografie galerie. Úplná přenosná záloha fotografií je tedy **pouze nativní ZIP v2**. Limity: 12 MiB na jednotlivý nahrávaný originál, 4 MiB na JPEG výřez, 48 MiB na soubor v záloze a 256 MiB souhrnně.

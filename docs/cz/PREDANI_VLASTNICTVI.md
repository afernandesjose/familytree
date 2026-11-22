# Předání vlastnictví rodokmenu (1.3.0)

## Použití

1. V seznamu rodokmenů otevřete nabídku `⋯` u rodokmenu, který vlastníte.
2. Vyberte **Předat vlastnictví rodokmenu**, zvolte existujícího uživatele Nextcloudu (nikoli skupinu).
3. Zkontrolujte vybraného uživatele v potvrzovacím dialogu a potvrďte předání. Zadání hesla ani opisování názvu se nevyžaduje.

Příjemce se ihned stane skutečným vlastníkem: může upravovat osoby a vztahy, spravovat sdílení a případně rodokmen odstranit. Předávající ztrácí vlastnictví, ale může stále vidět rodokmen prostřednictvím existujícího skupinového sdílení. Nový vlastník může rodokmen znovu sdílet. Pokud již otevřený deník či seznam rodokmenů krátce ukazuje původního vlastníka, obnovte stránku, aby se znovu načetla oprávnění ze serveru.

## Data a bezpečnost

- ID rodokmenu, osoby, historie, výzkumný deník, fotografie a sdílení se nemění. Převod se zaznamená do auditní historie.
- Historické lokální přílohy v původním Files se bez mazání zkopírují do soukromého AppData aplikace. Díky tomu je může zobrazit i nový vlastník a zůstanou v úplné záloze ZIP v2.
- Pokud některou původní přílohu nelze bezpečně přečíst nebo je překročen limit (1000 souborů, 48 MiB/soubor, 256 MiB celkem nově kopírovaných souborů), převod se zablokuje a vlastnictví zůstane nezměněno.
- Odkazy na externí weby zůstávají odkazy, jejich obsah aplikace nestahuje.
- Předání nepřevádí celý osobní prostor Nextcloud Files ani neslouží jako obnova nativní zálohy.

Před předáním doporučujeme vytvořit úplnou zálohu. Funkci je nutné ověřit na NAS s dvěma oddělenými účty před veřejným vydáním.

Lokální dokumenty a zdrojové archivy lze po převodu otevřít přes ověřené odkazy FamilyTree; v prohlížeči není potřeba sdílet soubory cizího uživatele.

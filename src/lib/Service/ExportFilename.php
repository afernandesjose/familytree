<?php
declare(strict_types=1);
/**
 * @file Bezpečné názvy souborů exportovaných rodokmenů FamilyTree.
 * Maďarská notace: s = string, o = objekt, n = číslo.
 * Nemění obsah zálohy ani její formát; výhradně jméno souboru ke stažení.
 */
namespace OCA\HcFamilyTree\Service;

final class ExportFilename {
    /**
     * @brief Sestaví jméno ze skutečného názvu stromu a časové značky DDMMRRRR_HHMM.
     * @param string $sTreeName Název rodokmenu nebo skupiny rodokmenů.
     * @param string $sExtension Povolená přípona zip nebo ged.
     * @param ?\DateTimeImmutable $oDate Datum exportu, pro testy lze dodat pevné datum.
     * @return string Bezpečný název souboru (bez cesty).
     */
    public static function build(string $sTreeName, string $sExtension, ?\DateTimeImmutable $oDate = null): string {
        if (!in_array($sExtension, ['zip', 'ged'], true)) {
            throw new \InvalidArgumentException('Unsupported genealogy export extension.');
        }
        // Původní jméno (včetně české diakritiky) zachovat; mezery nahradit podtržítky.
        $sName = preg_replace('~[<>:"/\\|?*\x00-\x1F\x7F]~u', '_', trim($sTreeName));
        $sName = preg_replace('~\s+~u', '_', $sName ?? '');
        $sName = preg_replace('~_+~u', '_', $sName ?? '');
        $sName = trim((string)$sName, " ._-");
        $sName = preg_match('~^.{0,100}~us', $sName, $aMatches) ? $aMatches[0] : 'Rodokmen';
        if ($sName === '') $sName = 'Rodokmen';
        $oDate ??= new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
        return $sName . '_' . $oDate->format('dmY_Hi') . '.' . $sExtension;
    }

    /**
     * @brief Vrátí bezpečnou HTTP hlavičku pro Unicode název souboru.
     * @param string $sFilename Již ověřený název bez cesty.
     * @return string HTTP Content-Disposition s ASCII náhradou a UTF-8 filename*.
     */
    public static function contentDisposition(string $sFilename): string {
        $sAscii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $sFilename);
        $sAscii = preg_replace('~[^A-Za-z0-9_.-]+~', '_', is_string($sAscii) ? $sAscii : $sFilename);
        $sAscii = trim((string)$sAscii, '._-');
        if ($sAscii === '') $sAscii = 'Rodokmen';
        return 'attachment; filename="' . $sAscii . '"; filename*=UTF-8\'\'' . rawurlencode($sFilename);
    }
}

<?php
declare(strict_types=1);
/**
 * @file Soukromé AppData pro přílohy předaných rodokmenů, nezávislé na vlastníkovi.
 * Maďarská notace: s = string, n = int, a = array, o = objekt, b = bool.
 * Předání nikdy nemaže původní soubory a nevyvolává Files Versions cizího účtu.
 */
namespace OCA\Lignees\Service;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IAppData;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;

final class TreeMediaStorage {
    private const MAX_FILE = 48 * 1024 * 1024;
    private const MAX_TOTAL = 256 * 1024 * 1024;
    private const MAX_FILES = 1000;

    /** @brief Inicializuje uložiště souborů nezávislé na osobním Files vlastníka.
     * @param IAppData $oAppData Soukromé AppData FamilyTree.
     * @param IRootFolder $oRoot Kořen uživatelských souborů pro čtení před převodem.
     */
    public function __construct(private IAppData $oAppData, private IRootFolder $oRoot) {}

    /** @brief Zajistí bezpečnou relativní cestu a vyloučí URL a cestování adresáři.
     * @param string $sPath Cesta původní přílohy.
     * @return string Ověřená relativní cesta.
     */
    private static function safe(string $sPath): string {
        $sPath = ltrim($sPath, '/');
        if (!NativeArchiveFormat::safePath($sPath) || filter_var($sPath, FILTER_VALIDATE_URL)) {
            throw new \InvalidArgumentException('Unsafe tree attachment path.');
        }
        return $sPath;
    }

    /** @brief Vytvoří deterministický bezpečný klíč podkladové složky.
     * @param int $nTreeId ID rodokmenu.
     * @param string $sPath Relativní cesta.
     * @return string Název ploché složky v AppData.
     */
    private static function key(int $nTreeId, string $sPath): string {
        if ($nTreeId < 1) throw new \InvalidArgumentException('Invalid tree ID.');
        return 'tree-file-' . $nTreeId . '-' . hash('sha256', self::safe($sPath));
    }

    /** @brief Ověří přítomnost kopie přílohy bez přístupu k Files uživatele.
     * @param int $nTreeId ID rodokmenu.
     * @param string $sPath Původní relativní cesta.
     * @return bool Příloha je bezpečně zkopírována.
     */
    public function has(int $nTreeId, string $sPath): bool {
        try { return $this->oAppData->getFolder(self::key($nTreeId, $sPath))->fileExists('content'); }
        catch (NotFoundException) { return false; }
    }

    /** @brief Vrátí původní přílohu z AppData, nebo před převodem z Files vlastníka.
     * @param int $nTreeId ID rodokmenu, nikoli ID uživatele.
     * @param string $sOwnerUid Vlastník potřebný výhradně pro historické soubory.
     * @param string $sPath Původní relativní cesta.
     * @return string Bajty souboru.
     */
    public function read(int $nTreeId, string $sOwnerUid, string $sPath): string {
        $sPath = self::safe($sPath);
        try {
            $oFolder = $this->oAppData->getFolder(self::key($nTreeId, $sPath));
            if ($oFolder->fileExists('content')) return (string)$oFolder->getFile('content')->getContent();
        } catch (NotFoundException) { /* Historický soubor dosud není v AppData. */ }
        $oFile = $this->oRoot->getUserFolder($sOwnerUid)->get($sPath);
        if (!$oFile instanceof File || $oFile->getSize() > self::MAX_FILE) throw new \RuntimeException('Missing or oversized family tree attachment.');
        return (string)$oFile->getContent();
    }

    /** @brief Vrátí i soubory zachované při předchozích předáních pro další úplný export.
     * @param int $nTreeId ID rodokmenu.
     * @return array Seznam bezpečných původních relativních cest.
     */
    public function cachedPaths(int $nTreeId): array {
        try {
            $oFolder = $this->oAppData->getFolder('tree-transfer-manifest-' . $nTreeId);
            if (!$oFolder->fileExists('paths.json')) return [];
            $aPaths = json_decode((string)$oFolder->getFile('paths.json')->getContent(), true);
            if (!is_array($aPaths) || count($aPaths) > self::MAX_FILES) throw new \RuntimeException('Invalid transfer manifest.');
            return array_values(array_unique(array_map(static fn($sPath) => self::safe((string)$sPath), $aPaths)));
        } catch (NotFoundException) { return []; }
    }

    /** @brief Uloží seznam všech již uchovaných souborů bez databázových změn.
     * @param int $nTreeId ID rodokmenu.
     * @param array $aPaths Soubory, které lze načíst z AppData.
     * @return void
     */
    private function saveManifest(int $nTreeId, array $aPaths): void {
        $aAll = array_values(array_unique(array_merge($this->cachedPaths($nTreeId), $aPaths)));
        if (count($aAll) > self::MAX_FILES) throw new \RuntimeException('Too many transfer attachments.');
        $sJson = json_encode($aAll, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        try { $oFolder = $this->oAppData->getFolder('tree-transfer-manifest-' . $nTreeId); }
        catch (NotFoundException) { $oFolder = $this->oAppData->newFolder('tree-transfer-manifest-' . $nTreeId); }
        if ($oFolder->fileExists('paths.json')) $oFolder->getFile('paths.json')->putContent($sJson);
        else $oFolder->newFile('paths.json', $sJson);
    }

    /** @brief Sestaví seznam příloh stromu včetně původních importovaných zdrojů.
     * @param int $nTreeId ID rodokmenu.
     * @param array $aRows Tabulky databáze omezené na daný strom.
     * @param string $sOwnerUid Původní vlastník.
     * @return array Bezpečné cesty bez duplicit.
     */
    public function listPaths(int $nTreeId, array $aRows, string $sOwnerUid): array {
        $aPaths = array_fill_keys($this->cachedPaths($nTreeId), true);
        foreach ($aRows['documents'] ?? [] as $aDocument) {
            $sPath = (string)($aDocument['file_path'] ?? '');
            if ($sPath !== '' && !filter_var($sPath, FILTER_VALIDATE_URL)) $aPaths[self::safe($sPath)] = true;
            if (($aDocument['document_type'] ?? '') === 'person_photo') {
                $sPortrait = (string)($aDocument['source'] ?? '');
                if (str_starts_with($sPortrait, 'Rodokmen/Fotografie/') || str_starts_with($sPortrait, 'Rodokmen/Obnova/')) {
                    $aPaths[self::safe($sPortrait)] = true;
                }
            }
        }
        foreach ($aRows['research'] ?? [] as $aResearch) {
            $sPath = (string)($aResearch['media_path'] ?? '');
            if ($sPath !== '') $aPaths[self::safe($sPath)] = true;
        }
        foreach ($aRows['people'] ?? [] as $aPerson) {
            $sPath = (string)($aPerson['photo_url'] ?? '');
            if (str_starts_with($sPath, 'Rodokmen/') || str_starts_with($sPath, '/Rodokmen/')) {
                $aPaths[self::safe($sPath)] = true;
            }
        }
        // Zachovat rovněž importní GEDCOM/GEDZIP originály, které jsou součástí úplné zálohy.
        $sBase = 'Rodokmen/Import/' . $nTreeId;
        try {
            $oFolder = $this->oRoot->getUserFolder($sOwnerUid)->get($sBase);
            if ($oFolder instanceof Folder) $this->walk($oFolder, $sBase, $aPaths);
        } catch (NotFoundException) { /* Bez historických importních souborů. */ }
        if (count($aPaths) > self::MAX_FILES) throw new \RuntimeException('Too many tree attachments for safe ownership transfer.');
        return array_keys($aPaths);
    }

    /** @brief Projde vnořenou složku importu pouze v rámci daného rodokmenu.
     * @param Folder $oFolder Složka původního importu.
     * @param string $sParent Relativní cesta.
     * @param array $aPaths Výstupní seznam cest.
     * @return void
     */
    private function walk(Folder $oFolder, string $sParent, array &$aPaths): void {
        if (count($aPaths) > self::MAX_FILES) throw new \RuntimeException('Too many transfer attachments.');
        foreach ($oFolder->getDirectoryListing() as $oNode) {
            $sName = $oNode->getName();
            $sPath = self::safe($sParent . '/' . $sName);
            if ($oNode instanceof Folder) $this->walk($oNode, $sPath, $aPaths);
            elseif ($oNode instanceof File) $aPaths[$sPath] = true;
            else throw new \RuntimeException('Unsupported source attachment node.');
        }
    }

    /** @brief Před změnou vlastníka nedestruktivně přenese potřebné soubory do AppData.
     * @param int $nTreeId ID rodokmenu.
     * @param string $sOwnerUid Původní vlastník.
     * @param array $aPaths Ověřené cesty příloh.
     * @param PhotoBinaryStorage $oPhotos Úložiště spravovaných fotografií.
     * @return int Počet zajištěných souborů.
     */
    public function preserve(int $nTreeId, string $sOwnerUid, array $aPaths, PhotoBinaryStorage $oPhotos): int {
        if (count($aPaths) > self::MAX_FILES) throw new \RuntimeException('Too many transfer attachments.');
        $nTotal = 0;
        $nSaved = 0;
        foreach ($aPaths as $sPath) {
            $sPath = self::safe((string)$sPath);
            $aPhoto = PhotoBinaryStorage::parts($sPath);
            if ($aPhoto && $aPhoto['tree'] === $nTreeId) {
                // Existující AppData fotografie je již bezpečná; historický soubor neporušit.
                if ($oPhotos->exists($sPath)) continue;
                $sBytes = $oPhotos->read($sOwnerUid, $sPath);
                $nTotal += strlen($sBytes);
                if (strlen($sBytes) > self::MAX_FILE || $nTotal > self::MAX_TOTAL) throw new \RuntimeException('Transfer attachment size limit exceeded.');
                $oPhotos->create($sPath, $sBytes);
                $nSaved++;
                continue;
            }
            if ($this->has($nTreeId, $sPath)) continue;
            $sBytes = $this->read($nTreeId, $sOwnerUid, $sPath);
            $nTotal += strlen($sBytes);
            if (strlen($sBytes) > self::MAX_FILE || $nTotal > self::MAX_TOTAL) throw new \RuntimeException('Transfer attachment size limit exceeded.');
            try { $oFolder = $this->oAppData->getFolder(self::key($nTreeId, $sPath)); }
            catch (NotFoundException) { $oFolder = $this->oAppData->newFolder(self::key($nTreeId, $sPath)); }
            if (!$oFolder->fileExists('content')) $oFolder->newFile('content', $sBytes);
            $nSaved++;
        }
        // CZ: neztratit historické importy při dalším předání nebo nativním exportu.
        $this->saveManifest($nTreeId, array_values($aPaths));
        return $nSaved;
    }
}

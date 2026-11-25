<?php
declare(strict_types=1);
/**
 * @file Jednotné soukromé úložiště fotografií FamilyTree pro sdílené rodokmeny.
 * Nové snímky jsou v AppData aplikace; staré obrázky v souborech vlastníka zůstávají čitelné.
 * Maďarská notace: s = string, n = int, a = array, o = objekt, b = bool.
 */
namespace OCA\Lignees\Service;

use OCP\Files\File;
use OCP\Files\IAppData;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\SimpleFS\ISimpleFolder;

final class PhotoBinaryStorage {
    /**
     * @brief Inicializuje úložiště bez přepínání aktuálního uživatele či zapisování do Files vlastníka.
     * @param IAppData $oAppData Privátní adresář aplikace ve Files SimpleFS.
     * @param IRootFolder $oRoot Kompatibilní čtení historických souborů vlastníka.
     */
    public function __construct(private IAppData $oAppData, private IRootFolder $oRoot, private TreeMediaStorage $oTreeMedia) {}

    /**
     * @brief Ověří přesnou relativní cestu galerie; neumožní libovolnou AppData cestu.
     * @param string $sPath Relativní cesta v metadata databáze.
     * @return ?array Čtyři díly cesty, nebo null pro ostatní soubory.
     */
    public static function parts(string $sPath): ?array {
        if (preg_match('~^Rodokmen/Fotografie/([1-9][0-9]*)/([a-f0-9]{32})/([a-f0-9]{32})/(original\.(?:jpg|png|webp)|portrait\.jpg)$~D', $sPath, $aMatch) !== 1) {
            return null;
        }
        return ['tree' => (int)$aMatch[1], 'person' => $aMatch[2],
            'photo' => $aMatch[3], 'file' => $aMatch[4]];
    }

    /**
     * @brief Vypočte bezpečné ploché jméno složky, protože SimpleFS nepodporuje podsložky.
     * @param array $aParts Validované díly cesty.
     * @return string Jméno složky AppData.
     */
    private static function folderName(array $aParts): string {
        return 'photo-' . $aParts['tree'] . '-' . $aParts['person'] . '-' . $aParts['photo'];
    }

    /**
     * @brief Vrátí privátní složku, pokud existuje, jinak null.
     * @param array $aParts Validovaná fotografie.
     * @return ?ISimpleFolder Složka bez uživatelských oprávnění k cizím Files.
     */
    private function folder(array $aParts): ?ISimpleFolder {
        try { return $this->oAppData->getFolder(self::folderName($aParts)); }
        catch (NotFoundException) { return null; }
    }

    /**
     * @brief Zapíše nový soubor spravované galerie, nikdy nepřepíše existující soubor.
     * @param string $sPath Validovaná cesta originálu nebo portrétu.
     * @param string $sBytes Bajty fotografie.
     * @return void
     */
    public function create(string $sPath, string $sBytes): void {
        $aParts = self::parts($sPath);
        if (!$aParts) throw new \InvalidArgumentException('Invalid managed photo path.');
        $oFolder = $this->folder($aParts) ?? $this->oAppData->newFolder(self::folderName($aParts));
        if ($oFolder->fileExists($aParts['file'])) throw new \RuntimeException('Managed photograph already exists.');
        $oFolder->newFile($aParts['file'], $sBytes);
    }

    /** @brief Ověří, zda je původní či portrétní fotografie již v AppData.
     * @param string $sPath Spravovaná cesta fotografie.
     * @return bool True, pokud soubor nezávisí na vlastníkovi Files.
     */
    public function exists(string $sPath): bool {
        $aParts = self::parts($sPath);
        if (!$aParts) return false;
        $oFolder = $this->folder($aParts);
        return $oFolder !== null && $oFolder->fileExists($aParts['file']);
    }

    /**
     * @brief Čte fotografii z AppData, případně ze staršího původního umístění.
     * @param string $sOwnerUid Vlastník rodokmenu, pouze pro čtení legacy dat.
     * @param string $sPath Bezpečná relativní cesta.
     * @return string Bajty obrázku.
     */
    public function read(string $sOwnerUid, string $sPath): string {
        if (!NativeArchiveFormat::safePath($sPath)) throw new \InvalidArgumentException('Invalid photo path.');
        $aParts = self::parts($sPath);
        if ($aParts) {
            $oFolder = $this->folder($aParts);
            if ($oFolder && $oFolder->fileExists($aParts['file'])) {
                return $oFolder->getFile($aParts['file'])->getContent();
            }
        }
        // CZ: po předání může původní složka patřit někomu jinému;
        // přednost má bezpečná nedestruktivní kopie pořízená při převodu.
        if (preg_match('~^Rodokmen/(?:Fotografie|Obnova)/([1-9][0-9]*)/~D', $sPath, $aMatch)
            && $this->oTreeMedia->has((int)$aMatch[1], $sPath)) {
            return $this->oTreeMedia->read((int)$aMatch[1], $sOwnerUid, $sPath);
        }
        $oFile = $this->oRoot->getUserFolder($sOwnerUid)->get($sPath);
        if (!$oFile instanceof File) throw new \RuntimeException('Photo path is not a file.');
        return (string)$oFile->getContent();
    }

    /**
     * @brief Vymění výřez v AppData; legacy fotografii před úpravou bezeztrátově zkopíruje.
     * @param string $sOwnerUid Vlastník starých souborů (read only).
     * @param string $sOriginalPath Cesta původního originálu.
     * @param string $sPortraitPath Cesta nového náhledu.
     * @param string $sBytes Nový portrét JPEG.
     * @return void
     */
    public function replacePortrait(string $sOwnerUid, string $sOriginalPath, string $sPortraitPath, string $sBytes): void {
        $aOriginal = self::parts($sOriginalPath);
        $aPortrait = self::parts($sPortraitPath);
        if (!$aOriginal || !$aPortrait || $aPortrait['file'] !== 'portrait.jpg'
            || $aOriginal['file'] === 'portrait.jpg'
            || self::folderName($aOriginal) !== self::folderName($aPortrait)) {
            throw new \InvalidArgumentException('Invalid photo original/portrait pair.');
        }
        $oFolder = $this->folder($aPortrait);
        // Important: if this is a legacy image, copying the original before touching
        // the preview ensures a crash cannot destroy the only high-resolution source.
        if (!$oFolder || !$oFolder->fileExists($aOriginal['file'])) {
            $sOriginalBytes = $this->read($sOwnerUid, $sOriginalPath);
            if (strlen($sOriginalBytes) > NativeArchiveFormat::MAX_FILE_BYTES) throw new \InvalidArgumentException('Original photo too large.');
            $oFolder ??= $this->oAppData->newFolder(self::folderName($aPortrait));
            if (!$oFolder->fileExists($aOriginal['file'])) $oFolder->newFile($aOriginal['file'], $sOriginalBytes);
        }
        if ($oFolder->fileExists('portrait.jpg')) $oFolder->getFile('portrait.jpg')->putContent($sBytes);
        else $oFolder->newFile('portrait.jpg', $sBytes);
    }

    /**
     * @brief Odstraní aplikační kopii fotografie jako celek, bez přístupu k cizím souborům.
     * @param string $sPath Cesta ověřená proti metadatům dané osoby.
     * @return void
     */
    public function deleteFolder(string $sPath): void {
        $aParts = self::parts($sPath);
        if (!$aParts) return;
        $this->folder($aParts)?->delete();
    }

    /**
     * @brief Smaže případný jednotlivý soubor vytvořený neúspěšnou obnovou.
     * @param string $sPath Cesta nového souboru fotografie.
     * @return void
     */
    public function deleteFile(string $sPath): void {
        $aParts = self::parts($sPath);
        if (!$aParts) return;
        $oFolder = $this->folder($aParts);
        if (!$oFolder) return;
        if ($oFolder->fileExists($aParts['file'])) $oFolder->getFile($aParts['file'])->delete();
        if ($oFolder->getDirectoryListing() === []) $oFolder->delete();
    }
}

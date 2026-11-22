<?php
declare(strict_types=1);
/**
 * @file Soukromá galerie fotografií FamilyTree. Nové fotografie ukládá do AppData,
 * historické fotografie čte také z Files vlastníka (bez migrace databáze).
 * Maďarská notace: s = string, n = int, b = bool, a = array, o = objekt/mixed.
 */
namespace OCA\HcFamilyTree\Service;

use OCP\AppFramework\Http\DataDisplayResponse;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\AppFramework\Http\Response;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IDBConnection;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IUserManager;
use OCP\IUserSession;

final class PersonPhotoService {
    private const PHOTO_TYPE = 'person_photo';
    private const MAX_ORIGINAL = 12 * 1024 * 1024;
    private const MAX_PORTRAIT = 4 * 1024 * 1024;
    private string $sUid;

    /**
     * @brief Inicializuje bezpečné úložiště fotografií se sdílenými přístupy rodokmenu.
     * @param IRequest $oRequest Aktuální HTTP požadavek včetně uploadů.
     * @param IDBConnection $oDb Databáze Nextcloudu.
     * @param IRootFolder $oRoot Kořen souborů Nextcloudu.
     * @param IUserSession $oSession Přihlášený uživatel.
     * @param IUserManager $oUsers Správa uživatelů.
     * @param IGroupManager $oGroups Správa skupin.
     * @param ResearchJournalService $oJournal Historie změn.
     * @return void
     */
    public function __construct(
        private IRequest $oRequest,
        private IDBConnection $oDb,
        private IRootFolder $oRoot,
        IUserSession $oSession,
        private IUserManager $oUsers,
        private IGroupManager $oGroups,
        private ResearchJournalService $oJournal,
        private PhotoBinaryStorage $oStorage,
    ) { $this->sUid = $oSession->getUser()?->getUID() ?? ''; }

    /**
     * @brief Vrátí jediný záznam podle SQL ID.
     * @param string $sTable Název tabulky.
     * @param int $nId Identifikátor řádku.
     * @return ?array Záznam nebo null.
     */
    private function row(string $sTable, int $nId): ?array {
        $oQ = $this->oDb->getQueryBuilder()->select('*')->from($sTable);
        $oQ->where($oQ->expr()->eq('id', $oQ->createNamedParameter($nId)));
        return $oQ->executeQuery()->fetchAssociative() ?: null;
    }

    /**
     * @brief Vrátí pouze fotografie patřící dané osobě.
     * @param int $nPersonId Číselné ID osoby.
     * @return array Záznamy fotografie.
     */
    private function photos(int $nPersonId): array {
        $oQ = $this->oDb->getQueryBuilder()->select('*')->from('hc_familytree_documents');
        $oQ->where($oQ->expr()->eq('person_id', $oQ->createNamedParameter($nPersonId)))
            ->andWhere($oQ->expr()->eq('document_type', $oQ->createNamedParameter(self::PHOTO_TYPE)))
            ->orderBy('created_at', 'ASC')->addOrderBy('id', 'ASC');
        return array_values(array_filter($oQ->executeQuery()->fetchAllAssociative(),
            static fn(array $aPhoto): bool => self::managedPhoto($aPhoto)));
    }

    /**
     * @brief Zkontroluje přístup k rodokmenu včetně oprávnění editovat sdílený strom.
     * @param array $aTree Záznam rodokmenu.
     * @param bool $bEdit Zda je vyžadováno právo zápisu.
     * @return bool Výsledek kontroly.
     */
    private function can(array $aTree, bool $bEdit): bool {
        if ($this->sUid === '') return false;
        if ((string)$aTree['owner_uid'] === $this->sUid) return true;
        $oUser = $this->oUsers->get($this->sUid);
        $oQ = $this->oDb->getQueryBuilder()->select('*')->from('hc_familytree_shares');
        $oQ->where($oQ->expr()->eq('tree_id', $oQ->createNamedParameter((int)$aTree['id'])));
        foreach ($oQ->executeQuery()->fetchAllAssociative() as $aShare) {
            $bMatch = ($aShare['share_type'] === 'user' && $aShare['share_with'] === $this->sUid);
            if ($aShare['share_type'] === 'group' && $oUser) {
                $oGroup = $this->oGroups->get((string)$aShare['share_with']);
                $bMatch = $oGroup?->inGroup($oUser) ?? false;
            }
            if ($bMatch && (!$bEdit || $aShare['permission'] === 'edit')) return true;
        }
        return false;
    }

    /**
     * @brief Povolí akci jen pro existující osobu a příslušný rodokmen.
     * @param int $nPersonId ID osoby.
     * @param bool $bEdit Příznak zápisu.
     * @return ?array Dvojice osoba/rodokmen, nebo null.
     */
    private function context(int $nPersonId, bool $bEdit): ?array {
        $aPerson = $this->row('hc_familytree_people', $nPersonId);
        if (!$aPerson) return null;
        $aTree = $this->row('hc_familytree_trees', (int)$aPerson['tree_id']);
        if (!$aTree || !$this->can($aTree, $bEdit)) return null;
        return ['person' => $aPerson, 'tree' => $aTree];
    }

    /**
     * @brief Rozpozná spravovanou místní fotografii od historického dokumentu stejného typu.
     * @param array $aPhoto Metadatový dokument.
     * @return bool True pro skutečnou fotografii z místního soukromého úložiště.
     */
    private static function managedPhoto(array $aPhoto): bool {
        $sOriginal = (string)($aPhoto['file_path'] ?? '');
        $sPortrait = (string)($aPhoto['source'] ?? '');
        return ($aPhoto['document_type'] ?? '') === self::PHOTO_TYPE
            && (str_starts_with($sOriginal, 'Rodokmen/Fotografie/') || str_starts_with($sOriginal, 'Rodokmen/Obnova/'))
            && (str_starts_with($sPortrait, 'Rodokmen/Fotografie/') || str_starts_with($sPortrait, 'Rodokmen/Obnova/'));
    }

    /**
     * @brief Vrátí fotografii jen pokud je svázána se správnou osobou i stromem.
     * @param int $nPersonId ID osoby.
     * @param int $nPhotoId ID dokumentu.
     * @return ?array Fotografie nebo null.
     */
    private function matchingPhoto(int $nPersonId, int $nPhotoId): ?array {
        $aPhoto = $this->row('hc_familytree_documents', $nPhotoId);
        $aPerson = $this->row('hc_familytree_people', $nPersonId);
        if (!$aPerson || !$aPhoto || (int)$aPhoto['person_id'] !== $nPersonId
            || (int)$aPhoto['tree_id'] !== (int)$aPerson['tree_id']
            || !self::managedPhoto($aPhoto)) return null;
        return $aPhoto;
    }

    /**
     * @brief Kontroluje upload podle skutečného obrazového formátu, rozměrů a délky.
     * @param mixed $oUpload Struktura uploadu z Nextcloudu.
     * @param bool $bPortrait Zda jde o čtvercový výřez.
     * @return array Údaje o ověřeném souboru.
     */
    private function uploadedImage(mixed $oUpload, bool $bPortrait): array {
        if (!is_array($oUpload) || ($oUpload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new \InvalidArgumentException('No valid photo was uploaded.');
        }
        $sTmp = (string)($oUpload['tmp_name'] ?? '');
        $nSize = (int)($oUpload['size'] ?? 0);
        if (!is_file($sTmp) || $nSize < 1 || $nSize > ($bPortrait ? self::MAX_PORTRAIT : self::MAX_ORIGINAL)) {
            throw new \InvalidArgumentException('Photo file is missing or exceeds its size limit.');
        }
        $aImage = @getimagesize($sTmp);
        $sMime = (string)($aImage['mime'] ?? '');
        $aFormats = $bPortrait ? ['image/jpeg'=>'jpg'] : ['image/jpeg'=>'jpg', 'image/png'=>'png', 'image/webp'=>'webp'];
        $nWidth = (int)($aImage[0] ?? 0); $nHeight = (int)($aImage[1] ?? 0);
        if (!isset($aFormats[$sMime]) || $nWidth < 1 || $nHeight < 1
            || $nWidth > 12000 || $nHeight > 12000 || $nWidth * $nHeight > 36000000
            || ($bPortrait && ($nWidth !== $nHeight || $nWidth < 128 || $nWidth > 2048))) {
            throw new \InvalidArgumentException('Unsupported photo format or dimensions.');
        }
        $sBytes = file_get_contents($sTmp);
        if (!is_string($sBytes) || strlen($sBytes) !== $nSize) {
            throw new \InvalidArgumentException('The uploaded image is incomplete.');
        }
        return ['bytes'=>$sBytes, 'ext'=>$aFormats[$sMime], 'mime'=>$sMime];
    }

    /**
     * @brief Založí bezpečně vlastní složku pro danou fotografii.
     * @param Folder $oOwner Soukromé úložiště vlastníka rodokmenu.
     * @param string $sRelative Relativní cesta bez traversal.
     * @return Folder Cílová složka.
     */
    private function makeFolder(Folder $oOwner, string $sRelative): Folder {
        $oFolder = $oOwner;
        foreach (explode('/', $sRelative) as $sPart) {
            if ($sPart === '' || $sPart === '.' || $sPart === '..') throw new \InvalidArgumentException('Unsafe photo path.');
            $oFolder = $oFolder->nodeExists($sPart) ? $oFolder->get($sPart) : $oFolder->newFolder($sPart);
            if (!$oFolder instanceof Folder) throw new \RuntimeException('Photo storage path is not a folder.');
        }
        return $oFolder;
    }

    /**
     * @brief Vloží samostatnou fotografii a její nedestruktivní upravený portrét.
     * @param int $nPersonId ID osoby.
     * @return Response JSON s vloženým záznamem.
     */
    public function upload(int $nPersonId): Response {
        $aContext = $this->context($nPersonId, true);
        if (!$aContext) return new JSONResponse(['error'=>'Access denied.'],403);
        try {
            $aOriginal = $this->uploadedImage($this->oRequest->getUploadedFile('photo'), false);
            $aPortrait = $this->uploadedImage($this->oRequest->getUploadedFile('portrait'), true);
            $aPerson = $aContext['person']; $aTree = $aContext['tree'];
            $sFolder = 'Rodokmen/Fotografie/'.(int)$aTree['id'].'/'.(string)$aPerson['stable_id'].'/'.bin2hex(random_bytes(16));
            $sOriginal = $sFolder.'/original.'.$aOriginal['ext'];
            $sPortrait = $sFolder.'/portrait.jpg';
            $nDocumentId = null; $bCommitted = false;
            try {
                $this->oStorage->create($sOriginal, $aOriginal['bytes']);
                $this->oStorage->create($sPortrait, $aPortrait['bytes']);
                $sTitle = trim((string)($this->oRequest->getUploadedFile('photo')['name'] ?? 'Photo'));
                $sTitle = substr(basename(str_replace('\\','/', $sTitle)), 0, 250);
                if ($sTitle === '') $sTitle = 'Photo';
                $nTime = time(); $sStableId = ResearchJournalService::uid();
                $this->oDb->beginTransaction();
                try {
                    $oQ = $this->oDb->getQueryBuilder()->insert('hc_familytree_documents');
                    $aData = ['tree_id'=>(int)$aTree['id'], 'person_id'=>$nPersonId,
                        'stable_id'=>$sStableId,'title'=>$sTitle,'document_type'=>self::PHOTO_TYPE,
                        'mime_type'=>$aOriginal['mime'],'file_path'=>$sOriginal,'source'=>$sPortrait,
                        'created_at'=>$nTime,'updated_at'=>$nTime];
                    foreach ($aData as $sKey=>$oValue) $oQ->setValue($sKey,$oQ->createNamedParameter($oValue));
                    $oQ->executeStatement(); $nDocumentId = (int)$this->oDb->lastInsertId('hc_familytree_documents');
                    $bSetPrimary = (string)$this->oRequest->getParam('set_primary','0') === '1'
                        || trim((string)$aPerson['photo_url']) === '';
                    if ($bSetPrimary) $this->updatePrimary($aPerson, $sPortrait);
                    $this->oJournal->audit((int)$aTree['id'],'hc_familytree_documents',$sStableId,
                        'create',$this->sUid,null,$aData,'Photo uploaded');
                    $this->oDb->commit(); $bCommitted = true;
                } catch (\Throwable $oError) {
                    $this->oDb->rollBack(); throw $oError;
                }
                return new DataResponse(['ok'=>true,'photoId'=>$nDocumentId,'primary'=>$bSetPrimary]);
            } catch (\Throwable $oError) {
                if (!$bCommitted) { try { $this->oStorage->deleteFolder($sOriginal); } catch (\Throwable) {} }
                throw $oError;
            }
        } catch (\InvalidArgumentException $oError) {
            return new JSONResponse(['error'=>$oError->getMessage()],400);
        } catch (\Throwable) {
            return new JSONResponse(['error'=>'Photo could not be stored.'],500);
        }
    }

    /**
     * @brief Upraví výřez stávající fotografie, originál ponechá beze změny.
     * @param int $nPersonId Číselné ID osoby.
     * @param int $nPhotoId Identifikátor dokumentu fotografie.
     * @return Response Potvrzení aktualizace náhledu.
     */
    public function replacePortrait(int $nPersonId,int $nPhotoId): Response {
        $aContext = $this->context($nPersonId,true);
        $aPhoto = $this->matchingPhoto($nPersonId,$nPhotoId);
        if (!$aContext || !$aPhoto) return new JSONResponse(['error'=>'Photo not found or access denied.'],404);
        $bTransaction = false;
        $sCreatedPath = '';
        try {
            $aPortrait = $this->uploadedImage($this->oRequest->getUploadedFile('portrait'),true);
            $sPath = (string)$aPhoto['source'];
            if (!NativeArchiveFormat::safePath($sPath)) throw new \InvalidArgumentException('Invalid portrait path.');
            $sOriginalPath = (string)$aPhoto['file_path'];
            $sOwnerUid = (string)$aContext['tree']['owner_uid'];
            $nNow = time();
            $this->oDb->beginTransaction(); $bTransaction = true;
            $aUpdated = $aPhoto;
            if (PhotoBinaryStorage::parts($sPath) !== null
                && PhotoBinaryStorage::parts($sOriginalPath) !== null) {
                // CZ: Úprava AppData; pro starší soubory se před přepsáním náhledu
                // zkopíruje nedotčený originál z úložiště vlastníka.
                $this->oStorage->replacePortrait($sOwnerUid, $sOriginalPath, $sPath, $aPortrait['bytes']);
            } else {
                // CZ: Legacy Obnova nemá kanonickou cestu. První úprava vytvoří
                // novou soukromou AppData kopii; žádné historické soubory nemaže.
                $sBytes = $this->oStorage->read($sOwnerUid, $sOriginalPath);
                $sFolder = 'Rodokmen/Fotografie/'.(int)$aContext['tree']['id'].'/'
                    .(string)$aContext['person']['stable_id'].'/'.bin2hex(random_bytes(16));
                $sExtension = match ((string)$aPhoto['mime_type']) {
                    'image/png'=>'png', 'image/webp'=>'webp', default=>'jpg'
                };
                $sNewOriginal = $sFolder.'/original.'.$sExtension;
                $sNewPortrait = $sFolder.'/portrait.jpg';
                $sCreatedPath = $sNewOriginal;
                $this->oStorage->create($sNewOriginal, $sBytes);
                $this->oStorage->create($sNewPortrait, $aPortrait['bytes']);
                $oQ = $this->oDb->getQueryBuilder()->update('hc_familytree_documents');
                $oQ->set('file_path', $oQ->createNamedParameter($sNewOriginal))
                    ->set('source', $oQ->createNamedParameter($sNewPortrait))
                    ->where($oQ->expr()->eq('id', $oQ->createNamedParameter($nPhotoId)))
                    ->executeStatement();
                $aUpdated['file_path'] = $sNewOriginal;
                $aUpdated['source'] = $sNewPortrait;
                if ((string)$aContext['person']['photo_url'] === $sPath) {
                    $this->updatePrimary($aContext['person'], $sNewPortrait);
                }
            }
            $oQ = $this->oDb->getQueryBuilder()->update('hc_familytree_documents');
            $oQ->set('updated_at',$oQ->createNamedParameter($nNow))
                ->where($oQ->expr()->eq('id',$oQ->createNamedParameter($nPhotoId)))->executeStatement();
            $aUpdated['updated_at'] = $nNow;
            $this->oJournal->audit((int)$aContext['tree']['id'],'hc_familytree_documents',
                (string)$aPhoto['stable_id'],'update',$this->sUid,$aPhoto,
                $aUpdated,'Portrait crop/rotation changed');
            $this->oDb->commit(); $bTransaction = false;
            return new DataResponse(['ok'=>true]);
        } catch (\InvalidArgumentException $oError) {
            if ($bTransaction) $this->oDb->rollBack();
            if ($sCreatedPath !== '') {
                try { $this->oStorage->deleteFolder($sCreatedPath); } catch (\Throwable) {}
            }
            return new JSONResponse(['error'=>$oError->getMessage()],400);
        } catch (\Throwable) {
            if ($bTransaction) $this->oDb->rollBack();
            if ($sCreatedPath !== '') {
                try { $this->oStorage->deleteFolder($sCreatedPath); } catch (\Throwable) {}
            }
            return new JSONResponse(['error'=>'Portrait could not be updated.'],500);
        }
    }

    /**
     * @brief Nastaví lokální náhled jako hlavní portrét osoby a zapíše historii.
     * @param array $aPerson Záznam osoby.
     * @param string $sPath Cesta k chráněnému portrétu.
     * @return void
     */
    private function updatePrimary(array $aPerson, string $sPath): void {
        $oQ = $this->oDb->getQueryBuilder()->update('hc_familytree_people');
        $oQ->set('photo_url',$oQ->createNamedParameter($sPath))
            ->set('updated_at',$oQ->createNamedParameter(time()))
            ->where($oQ->expr()->eq('id',$oQ->createNamedParameter((int)$aPerson['id'])))->executeStatement();
        $this->oJournal->audit((int)$aPerson['tree_id'],'hc_familytree_people',
            (string)$aPerson['stable_id'],'update',$this->sUid,$aPerson,
            array_merge($aPerson,['photo_url'=>$sPath]),'Main portrait changed');
    }

    /**
     * @brief Vybere již existující fotografii jako hlavní.
     * @param int $nPersonId ID osoby.
     * @param int $nPhotoId ID fotografie.
     * @return Response Stav změny.
     */
    public function setPrimary(int $nPersonId, int $nPhotoId): Response {
        $aContext = $this->context($nPersonId, true);
        $aPhoto = $this->matchingPhoto($nPersonId,$nPhotoId);
        if (!$aContext || !$aPhoto) return new JSONResponse(['error'=>'Photo not found or access denied.'],404);
        $this->updatePrimary($aContext['person'], (string)$aPhoto['source']);
        return new DataResponse(['ok'=>true]);
    }

    /**
     * @brief Vrátí lokální obrázek pouze pro oprávněného čtenáře konkrétní osoby.
     * @param int $nPersonId ID osoby.
     * @param ?int $nPhotoId Volitelně konkrétní fotografie.
     * @param string $sVariant original nebo portrait.
     * @return Response Obrázek s omezeným ukládáním do cache.
     */
    public function image(int $nPersonId, ?int $nPhotoId, string $sVariant='portrait'): Response {
        $aContext = $this->context($nPersonId, false);
        if (!$aContext || !in_array($sVariant,['portrait','original'],true)) return new JSONResponse(['error'=>'Not found.'],404);
        $aPhoto = $nPhotoId ? $this->matchingPhoto($nPersonId,$nPhotoId) : null;
        if ($nPhotoId === null) {
            $aPhotos = $this->photos($nPersonId);
            foreach ($aPhotos as $aCandidate) {
                if ((string)$aCandidate['source'] === (string)$aContext['person']['photo_url']) { $aPhoto = $aCandidate; break; }
            }
            // CZ: Starší záznam může ztratit hlavní photo_url; nevydávat 404,
            // pokud galerie stále obsahuje oprávněně připojenou fotografii.
            if (!$aPhoto && $aPhotos !== []) $aPhoto = $aPhotos[0];
        }
        if (!$aPhoto) return new JSONResponse(['error'=>'Photo not found.'],404);
        $sPath = (string)($sVariant === 'original' ? $aPhoto['file_path'] : $aPhoto['source']);
        if (!NativeArchiveFormat::safePath($sPath)) return new JSONResponse(['error'=>'Invalid photo path.'],404);
        try {
            $sContents = $this->oStorage->read((string)$aContext['tree']['owner_uid'], $sPath);
            if (strlen($sContents) > self::MAX_ORIGINAL) throw new \RuntimeException();
            $sMime = $sVariant === 'portrait' ? 'image/jpeg' : (string)$aPhoto['mime_type'];
            if (!in_array($sMime,['image/jpeg','image/png','image/webp'],true)) throw new \RuntimeException();
            return new DataDisplayResponse($sContents,200,[
                'Content-Type'=>$sMime,'Content-Disposition'=>'inline',
                'X-Content-Type-Options'=>'nosniff','Cache-Control'=>'private, no-store',
                'Content-Security-Policy'=>"default-src 'none'; sandbox",
            ]);
        } catch (\Throwable) {
            return new JSONResponse(['error'=>'Photo file not found.'],404);
        }
    }

    /**
     * @brief Odstraní vlastní fotografii a případně vybere další hlavní portrét.
     * @param int $nPersonId ID osoby.
     * @param int $nPhotoId ID fotografie.
     * @return Response Stav odstranění.
     */
    public function delete(int $nPersonId, int $nPhotoId): Response {
        $aContext = $this->context($nPersonId,true);
        $aPhoto = $this->matchingPhoto($nPersonId,$nPhotoId);
        if (!$aContext || !$aPhoto) return new JSONResponse(['error'=>'Photo not found or access denied.'],404);
        $aPerson = $aContext['person'];
        $aOther = array_values(array_filter($this->photos($nPersonId),static fn(array $aRow):bool => (int)$aRow['id'] !== $nPhotoId));
        $this->oDb->beginTransaction();
        try {
            if ((string)$aPerson['photo_url'] === (string)$aPhoto['source']) {
                $this->updatePrimary($aPerson, $aOther ? (string)$aOther[0]['source'] : '');
            }
            $oQ = $this->oDb->getQueryBuilder()->delete('hc_familytree_doc_links');
            $oQ->where($oQ->expr()->eq('document_id',$oQ->createNamedParameter($nPhotoId)))->executeStatement();
            $oQ = $this->oDb->getQueryBuilder()->delete('hc_familytree_documents');
            $oQ->where($oQ->expr()->eq('id',$oQ->createNamedParameter($nPhotoId)))->executeStatement();
            $this->oJournal->audit((int)$aPerson['tree_id'],'hc_familytree_documents',
                (string)$aPhoto['stable_id'],'delete',$this->sUid,$aPhoto,null,'Photo removed');
            $this->oDb->commit();
        } catch (\Throwable $oError) {
            $this->oDb->rollBack(); return new JSONResponse(['error'=>'Photo could not be removed.'],500);
        }
        $this->removeFiles($aContext['tree'],$aPhoto);
        return new DataResponse(['ok'=>true]);
    }

    /**
     * @brief Zlikviduje pouze přesně uvedené přílohy fotografie v soukromých souborech.
     * @param array $aTree Záznam vlastníka.
     * @param array $aPhoto Metadatový záznam fotografie.
     * @return void
     */
    private function removeFiles(array $aTree,array $aPhoto): void {
        $sPath = (string)($aPhoto['file_path'] ?? '');
        if (PhotoBinaryStorage::parts($sPath) !== null) {
            try { $this->oStorage->deleteFolder($sPath); } catch (\Throwable) {}
            // Historické soubory v Files vlastníka mohou zůstat jako bezpečná
            // kopie, nejsou již odkazované metadaty; nerozbíjej Files Versions.
            return;
        }
        try {
            $oOwner = $this->oRoot->getUserFolder((string)$aTree['owner_uid']);
            foreach (['file_path','source'] as $sKey) {
                $sPath = (string)($aPhoto[$sKey]??'');
                if (!NativeArchiveFormat::safePath($sPath)) continue;
                // Neodstraňovat starší odkazy, které nedrží služba fotografií.
                if (!str_starts_with($sPath,'Rodokmen/Fotografie/') && !str_starts_with($sPath,'Rodokmen/Obnova/')) continue;
                if ($oOwner->nodeExists($sPath)) $oOwner->get($sPath)->delete();
            }
        } catch (\Throwable) { /* CZ: Osamocenou přílohu lze odstranit správou souborů; DB už je konzistentní. */ }
    }

    /**
     * @brief Odstraní metadatové fotografie před smazáním osoby, aby nevznikly sirotčí odkazy.
     * @param array $aPerson Ověřená osoba před odstraněním.
     * @return void
     */
    public function removeForPerson(array $aPerson): void {
        $aTree = $this->row('hc_familytree_trees',(int)$aPerson['tree_id']);
        foreach ($this->photos((int)$aPerson['id']) as $aPhoto) {
            $oQ = $this->oDb->getQueryBuilder()->delete('hc_familytree_doc_links');
            $oQ->where($oQ->expr()->eq('document_id',$oQ->createNamedParameter((int)$aPhoto['id'])))->executeStatement();
            $oQ = $this->oDb->getQueryBuilder()->delete('hc_familytree_documents');
            $oQ->where($oQ->expr()->eq('id',$oQ->createNamedParameter((int)$aPhoto['id'])))->executeStatement();
            if ($aTree) $this->removeFiles($aTree,$aPhoto);
        }
    }
}

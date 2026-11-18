<?php
declare(strict_types=1);
/**
 * @file HTTP API pro soukromé fotografie osoby v FamilyTree.
 * Maďarská notace: s = string, n = int, b = bool, a = array, o = objekt.
 */
namespace OCA\HcFamilyTree\Controller;

use OCA\HcFamilyTree\AppInfo\Application;
use OCA\HcFamilyTree\Service\PersonPhotoService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\Response;
use OCP\IRequest;

final class PhotoController extends Controller {
    /**
     * @brief Připojí HTTP rozhraní k fotografické službě.
     * @param IRequest $oRequest HTTP požadavek.
     * @param PersonPhotoService $oPhotos Bezpečné úložiště.
     * @return void
     */
    public function __construct(IRequest $oRequest,private PersonPhotoService $oPhotos) {
        parent::__construct(Application::APP_ID,$oRequest);
    }
    /**
     * @brief Nahraje originál a oříznutý portrét k osobě.
     * @param int $personId Číselné ID osoby v cestě API.
     * @return Response Výsledek nahrání.
     */
    #[NoAdminRequired]
    public function upload(int $personId): Response { return $this->oPhotos->upload($personId); }
    /**
     * @brief Vrátí aktuální hlavní portrét jen oprávněnému čtenáři.
     * @param int $personId Číselné ID osoby v cestě API.
     * @return Response Obrázek nebo bezpečná chyba.
     */
    #[NoAdminRequired] #[NoCSRFRequired]
    public function portrait(int $personId): Response { return $this->oPhotos->image($personId,null); }
    /**
     * @brief Vrátí originál nebo upravenou podobu konkrétní fotografie.
     * @param int $personId Číselné ID osoby v cestě API.
     * @param int $photoId Číselné ID dokumentu fotografie.
     * @param string $variant Variantní formát fotografie.
     * @return Response Obrázek nebo bezpečná chyba.
     */
    #[NoAdminRequired] #[NoCSRFRequired]
    public function image(int $personId,int $photoId,string $variant): Response {
        return $this->oPhotos->image($personId,$photoId,$variant);
    }
    /**
     * @brief Přepočítá portrétní výřez bez změny originálu fotografie.
     * @param int $personId Číselné ID osoby.
     * @param int $photoId Číselné ID fotografie.
     * @return Response Výsledek aktualizace.
     */
    #[NoAdminRequired]
    public function replacePortrait(int $personId,int $photoId): Response {
        return $this->oPhotos->replacePortrait($personId,$photoId);
    }
    /**
     * @brief Označí vybranou fotografii za hlavní portrét.
     * @param int $personId Číselné ID osoby v cestě API.
     * @param int $photoId Číselné ID dokumentu fotografie.
     * @return Response Výsledek změny.
     */
    #[NoAdminRequired]
    public function primary(int $personId,int $photoId): Response {
        return $this->oPhotos->setPrimary($personId,$photoId);
    }
    /**
     * @brief Odstraní obrázek z galerie při zachování ostatních fotografií.
     * @param int $personId Číselné ID osoby v cestě API.
     * @param int $photoId Číselné ID dokumentu fotografie.
     * @return Response Výsledek odstranění.
     */
    #[NoAdminRequired]
    public function delete(int $personId,int $photoId): Response {
        return $this->oPhotos->delete($personId,$photoId);
    }
}

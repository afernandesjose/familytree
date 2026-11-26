<?php

declare(strict_types=1);

namespace OCA\Lignees\Controller;

use OCA\Lignees\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IUserSession;

/** Réglages d'affichage personnels (signe astrologique, arbres masqués), communs à tous les appareils de l'utilisateur. */
final class AffichageController extends Controller {
    private const DEFAUTS = ['signe' => true, 'arbres_masques' => []];
    private string $sUid;

    public function __construct(IRequest $oRequest, private IConfig $oConfig, IUserSession $oSession) {
        parent::__construct(Application::APP_ID, $oRequest);
        $this->sUid = $oSession->getUser()?->getUID() ?? '';
    }

    #[NoAdminRequired]
    public function lire(): DataResponse {
        if ($this->sUid === '') return new JSONResponse(['error' => 'Connexion requise.'], 401);
        return new DataResponse($this->valeurs());
    }

    #[NoAdminRequired]
    public function enregistrer(): DataResponse {
        if ($this->sUid === '') return new JSONResponse(['error' => 'Connexion requise.'], 401);
        $aV = $this->valeurs();
        $aB = $this->request->getParams();
        if (array_key_exists('signe', $aB)) $aV['signe'] = in_array($aB['signe'], [true, 1, '1', 'true'], true);
        if (array_key_exists('arbres_masques', $aB)) {
            $aV['arbres_masques'] = array_values(array_unique(array_map('intval', array_filter((array)$aB['arbres_masques'], fn($v) => ctype_digit((string)$v)))));
        }
        $this->oConfig->setUserValue($this->sUid, 'lignees', 'affichage', json_encode($aV, JSON_THROW_ON_ERROR));
        return new DataResponse($aV);
    }

    private function valeurs(): array {
        $aLus = json_decode($this->oConfig->getUserValue($this->sUid, 'lignees', 'affichage', '{}'), true);
        $aV = array_merge(self::DEFAUTS, array_intersect_key(is_array($aLus) ? $aLus : [], self::DEFAUTS));
        $aV['signe'] = (bool)$aV['signe'];
        $aV['arbres_masques'] = array_values(array_map('intval', (array)$aV['arbres_masques']));
        return $aV;
    }
}

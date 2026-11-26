<?php

declare(strict_types=1);

namespace OCA\Lignees\Controller;

use OCA\Lignees\AppInfo\Application;
use OCA\Lignees\Service\AnniversairesService;
use OCA\Lignees\Service\GenealogyService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;

/** Paramètres partagés d'un arbre (lignée automatique des conjoints) et relance des agendas après une modification. */
final class ParametresController extends Controller {
    public function __construct(IRequest $oRequest, private GenealogyService $oArbres, private AnniversairesService $oAnniversaires) {
        parent::__construct(Application::APP_ID, $oRequest);
    }

    #[NoAdminRequired]
    public function lire(int $treeId): DataResponse {
        if (!$this->oArbres->peut($treeId)) return new JSONResponse(['error' => 'Accès refusé.'], 403);
        return new DataResponse($this->oAnniversaires->parametres($treeId) + ['peut_modifier' => $this->oArbres->peut($treeId, true)]);
    }

    #[NoAdminRequired]
    public function enregistrer(int $treeId): DataResponse {
        if (!$this->oArbres->peut($treeId, true)) return new JSONResponse(['error' => 'Accès refusé.'], 403);
        $aB = $this->request->getParams();
        $aNouveaux = [];
        if (array_key_exists('lignee_conjoint', $aB)) $aNouveaux['lignee_conjoint'] = in_array($aB['lignee_conjoint'], [true, 1, '1', 'true'], true);
        return new DataResponse($this->oAnniversaires->enregistrer($treeId, $aNouveaux) + ['peut_modifier' => true]);
    }

    /** Après une modification de l'arbre : les agendas de tous ceux qui suivent des anniversaires sont remis à jour. */
    #[NoAdminRequired]
    public function synchroniser(int $treeId): DataResponse {
        if (!$this->oArbres->peut($treeId)) return new JSONResponse(['error' => 'Accès refusé.'], 403);
        $this->oAnniversaires->synchroniserTout();
        return new DataResponse(['ok' => true]);
    }
}

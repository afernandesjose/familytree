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
use OCP\IUserManager;
use OCP\IUserSession;

/** Paramètres d'un arbre (anniversaires dans un agenda, lignée automatique des conjoints). */
final class ParametresController extends Controller {
    private string $sUid;

    public function __construct(IRequest $oRequest, private GenealogyService $oArbres, private AnniversairesService $oAnniversaires,
        private IUserManager $oUsers, IUserSession $oSession) {
        parent::__construct(Application::APP_ID, $oRequest);
        $this->sUid = $oSession->getUser()?->getUID() ?? '';
    }

    #[NoAdminRequired]
    public function lire(int $treeId): DataResponse {
        if (!$this->oArbres->peut($treeId)) return new JSONResponse(['error' => 'Accès refusé.'], 403);
        $aP = $this->oAnniversaires->parametres($treeId);
        $aP['agenda_proprietaire'] = $aP['agenda_uid'] !== '' ? ($this->oUsers->getDisplayName($aP['agenda_uid']) ?? $aP['agenda_uid']) : '';
        $aP['agenda_est_le_mien'] = $aP['agenda_uid'] === $this->sUid;
        $aP['mes_agendas'] = $this->sUid !== '' ? $this->oAnniversaires->agendas($this->sUid) : [];
        $aP['peut_modifier'] = $this->oArbres->peut($treeId, true);
        return new DataResponse($aP);
    }

    #[NoAdminRequired]
    public function enregistrer(int $treeId): DataResponse {
        if (!$this->oArbres->peut($treeId, true)) return new JSONResponse(['error' => 'Accès refusé.'], 403);
        $aB = $this->request->getParams();
        $aNouveaux = array_intersect_key($aB, array_flip(['anniversaires', 'deces', 'rappel', 'lignee_conjoint']));
        foreach ($aNouveaux as $sCle => $oValeur) $aNouveaux[$sCle] = in_array($oValeur, [true, 1, '1', 'true'], true);
        // L'agenda choisi appartient toujours à la personne qui le choisit ; « nouveau » en crée un.
        if (array_key_exists('agenda_uri', $aB) && (string)$aB['agenda_uri'] !== '') {
            $sUri = (string)$aB['agenda_uri'];
            if ($sUri === 'nouveau') {
                $sNom = trim((string)($aB['agenda_nom'] ?? '')) ?: 'Anniversaires';
                $sUri = $this->oAnniversaires->creerAgenda($this->sUid, mb_substr($sNom, 0, 80));
            } elseif (!in_array($sUri, array_column($this->oAnniversaires->agendas($this->sUid), 'uri'), true)) {
                return new JSONResponse(['error' => 'Agenda introuvable parmi les vôtres.'], 400);
            }
            $aNouveaux['agenda_uid'] = $this->sUid;
            $aNouveaux['agenda_uri'] = $sUri;
        }
        $this->oAnniversaires->enregistrer($treeId, $aNouveaux);
        $aBilan = $this->oAnniversaires->synchroniser($treeId);
        return new DataResponse(['parametres' => $this->lire($treeId)->getData(), 'synchronisation' => $aBilan]);
    }

    #[NoAdminRequired]
    public function synchroniser(int $treeId): DataResponse {
        if (!$this->oArbres->peut($treeId)) return new JSONResponse(['error' => 'Accès refusé.'], 403);
        return new DataResponse($this->oAnniversaires->synchroniser($treeId));
    }
}

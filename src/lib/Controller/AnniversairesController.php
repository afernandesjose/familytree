<?php

declare(strict_types=1);

namespace OCA\Lignees\Controller;

use OCA\Lignees\AppInfo\Application;
use OCA\Lignees\Service\AnniversairesService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;

/** « Mes anniversaires » : réglages personnels de l'utilisateur connecté. */
final class AnniversairesController extends Controller {
    private string $sUid;

    public function __construct(IRequest $oRequest, private AnniversairesService $oAnniversaires, IUserSession $oSession) {
        parent::__construct(Application::APP_ID, $oRequest);
        $this->sUid = $oSession->getUser()?->getUID() ?? '';
    }

    #[NoAdminRequired]
    public function lire(): DataResponse {
        if ($this->sUid === '') return new JSONResponse(['error' => 'Connexion requise.'], 401);
        return new DataResponse($this->oAnniversaires->vue($this->sUid));
    }

    #[NoAdminRequired]
    public function enregistrer(): DataResponse {
        if ($this->sUid === '') return new JSONResponse(['error' => 'Connexion requise.'], 401);
        $aB = $this->request->getParams();
        $aNouveaux = array_intersect_key($aB, array_flip(['actif', 'deces', 'rappel', 'moi', 'lignees', 'exclus', 'agendas']));
        foreach (['actif', 'deces', 'rappel'] as $sCle) {
            if (array_key_exists($sCle, $aNouveaux)) $aNouveaux[$sCle] = in_array($aNouveaux[$sCle], [true, 1, '1', 'true'], true);
        }
        if (isset($aNouveaux['lignees']) && is_array($aNouveaux['lignees'])) {
            $aNouveaux['lignees'] = array_map(fn($v) => in_array($v, [true, 1, '1', 'true'], true), $aNouveaux['lignees']);
        }
        // « nouveau » dans la liste des agendas : un agenda est créé à ce nom.
        if (isset($aNouveaux['agendas']) && in_array('nouveau', (array)$aNouveaux['agendas'], true)) {
            $sNom = trim((string)($aB['agenda_nom'] ?? '')) ?: 'Anniversaires';
            $aNouveaux['agendas'] = array_values(array_diff((array)$aNouveaux['agendas'], ['nouveau']));
            $aNouveaux['agendas'][] = $this->oAnniversaires->creerAgenda($this->sUid, mb_substr($sNom, 0, 80));
        }
        $this->oAnniversaires->enregistrerPreferences($this->sUid, $aNouveaux);
        return new DataResponse(['vue' => $this->oAnniversaires->vue($this->sUid), 'synchronisation' => $this->oAnniversaires->synchroniserUtilisateur($this->sUid)]);
    }

    /** Retirer ou remettre une personne dans son agenda. */
    #[NoAdminRequired]
    public function exclure(): DataResponse {
        if ($this->sUid === '') return new JSONResponse(['error' => 'Connexion requise.'], 401);
        $sPersonne = (string)$this->request->getParam('personne', '');
        if (!ctype_digit($sPersonne)) return new JSONResponse(['error' => 'Personne invalide.'], 400);
        $aP = $this->oAnniversaires->exclure($this->sUid, $sPersonne, in_array($this->request->getParam('exclu'), [true, 1, '1', 'true'], true));
        return new DataResponse(['exclus' => $aP['exclus'], 'synchronisation' => $this->oAnniversaires->synchroniserUtilisateur($this->sUid)]);
    }
}

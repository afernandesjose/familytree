<?php

declare(strict_types=1);

namespace OCA\Lignees\BackgroundJob;

use OCA\Lignees\Service\AnniversairesService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;

/** Toutes les heures : remet les anniversaires de chaque arbre à jour dans l'agenda choisi. */
final class SynchroAnniversaires extends TimedJob {
    public function __construct(ITimeFactory $oTemps, private AnniversairesService $oAnniversaires) {
        parent::__construct($oTemps);
        $this->setInterval(3600);
    }

    protected function run($aArgument): void {
        $this->oAnniversaires->synchroniserTout();
    }
}

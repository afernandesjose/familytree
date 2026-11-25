<?php

declare(strict_types=1);

namespace OCA\Lignees\Controller;

use OCA\Lignees\AppInfo\Application;
use OCP\App\IAppManager;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;

/**
 * Page principale de Lignées : l'interface est entièrement chargée par js/lignees.js,
 * qui dialogue avec l'API existante (GenealogyController).
 */
final class PageController extends Controller {
    public function __construct(IRequest $oRequest, private IAppManager $oAppManager) {
        parent::__construct(Application::APP_ID, $oRequest);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function index(): TemplateResponse {
        return new TemplateResponse(Application::APP_ID, 'main', [
            'appVersion' => $this->oAppManager->getAppVersion(Application::APP_ID),
        ]);
    }
}

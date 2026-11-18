<?php
declare(strict_types=1);
/**
 * Testovací stránka bez přístupu k datům nebo zápisů do databáze.
 * Maďarská notace: o = objekt.
 */
namespace OCA\HcFamilyTree\Controller;
use OCA\HcFamilyTree\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
final class PageController extends Controller {
    /** Přijme požadavek a nastaví identifikátor aplikace. */
    public function __construct(IRequest $oRequest) { parent::__construct(Application::APP_ID, $oRequest); }
    /** Vrátí čistě informativní HTML stránku bez přístupu k rodokmenům. */
    #[NoAdminRequired]
    public function index(): TemplateResponse { return new TemplateResponse(Application::APP_ID, 'main'); }
}

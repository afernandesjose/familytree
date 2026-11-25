<?php
declare(strict_types=1);
/**
 * @file Registrace dashboardového widgetu FamilyTree pro Nextcloud 35.
 * Maďarská notace: s = string, n = int, b = bool, a = array, o = objekt/mixed.
 */
namespace OCA\Lignees\Dashboard;

use OCA\Lignees\AppInfo\Application;
use OCP\Dashboard\IIconWidget;
use OCP\Dashboard\IWidget;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Util;

final class FamilyTreeWidget implements IWidget, IIconWidget {
    /**
     * @brief Získá služby pro generování interních odkazů a překladů.
     * @param IURLGenerator $oUrl Generátor URL Nextcloudu.
     * @param IL10N $oL10n Překladové katalogy aplikace.
     * @return void
     */
    public function __construct(
        private IURLGenerator $oUrl,
        private IL10N $oL10n,
    ) {}

    /** @brief Vrátí registrovaný identifikátor widgetu. @return string */
    public function getId(): string { return Application::APP_ID; }

    /** @brief Vrátí lokalizovaný název widgetu. @return string */
    public function getTitle(): string { return $this->oL10n->t('FamilyTree'); }

    /** @brief Nastaví výchozí pozici widgetu v Dashboardu. @return int */
    public function getOrder(): int { return 20; }

    /** @brief Vrátí CSS třídu schválené ikony widgetu. @return string */
    public function getIconClass(): string { return 'icon-hc-familytree'; }

    /**
     * @brief Poskytne přímo URL originální ikony také klientům Dashboard API.
     * @return string Absolutní URL schválené ikony img/app.svg.
     */
    public function getIconUrl(): string {
        return $this->oUrl->getAbsoluteURL(
            $this->oUrl->imagePath(Application::APP_ID, 'app.svg')
        );
    }

    /** @brief Vrátí odkaz na hlavní stránku aplikace. @return ?string */
    public function getUrl(): ?string {
        return $this->oUrl->linkToRoute('lignees.page.index');
    }

    /**
     * @brief Načte potřebné soubory widgetu, ale ne hlavní JavaScript aplikace.
     * @return void
     */
    public function load(): void {
        Util::addStyle(Application::APP_ID, 'dashboard-1.3.2-20261121');
        Util::addScript(Application::APP_ID, 'dashboard-1.3.2-20261121');
    }
}

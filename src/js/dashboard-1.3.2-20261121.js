/**
 * @file Dashboardový widget FamilyTree: živé počty, poslední osoby/události a rychlý vstup.
 * Maďarská notace: s=string, n=number, b=boolean, a=array, o=object, fn=callback, h=HTML element.
 */
(() => {
    'use strict';
    const sApp = 'hc_familytree';
    if (!window.OCA?.Dashboard?.register || !window.OC?.generateUrl) return;

    const sLocale = String(OC.getLanguage?.() || document.documentElement.lang || 'en');
    const fnTr = (sKey) => typeof window.t === 'function' ? window.t(sApp, sKey) : sKey;
    const fnEscape = (sValue) => String(sValue ?? '').replace(/[&<>"']/g, (sChar) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[sChar]);
    const sAppUrl = OC.generateUrl('/apps/hc_familytree/');
    // CZ: Používáme originální schválenou ikonu, ne systémový placeholder.
    const sIconUrl = typeof OC.filePath === 'function'
        ? OC.filePath(sApp, 'img', 'app.svg')
        : OC.generateUrl('/apps/hc_familytree/img/app.svg');

    /**
     * @brief Sestaví interní odkaz na povolený strom a případně osobu.
     * @param {number} nTreeId ID rodokmenu.
     * @param {number} nPersonId Volitelná osoba, kterou aplikace otevře.
     * @returns {string} Bezpečná interní URL.
     */
    const fnTreeUrl = (nTreeId, nPersonId = 0) => {
        const nTree = Number(nTreeId);
        const nPerson = Number(nPersonId);
        if (!Number.isSafeInteger(nTree) || nTree <= 0) return sAppUrl;
        const oQuery = new URLSearchParams({ treeId: String(nTree) });
        if (Number.isSafeInteger(nPerson) && nPerson > 0) oQuery.set('personId', String(nPerson));
        return sAppUrl + '?' + oQuery.toString();
    };
    /**
     * @brief Převádí UNIX timestamp na lokální datum bez neplatných údajů.
     * @param {number} nTimestamp Sekundy od epochy.
     * @returns {string} Popisek data.
     */
    const fnDate = (nTimestamp) => {
        const nTime = Number(nTimestamp);
        return Number.isFinite(nTime) && nTime > 0
            ? new Date(nTime * 1000).toLocaleDateString(sLocale, {day: 'numeric', month: 'short', year: 'numeric'})
            : '';
    };
    /**
     * @brief Vykreslí odkaz na poslední změněnou osobu.
     * @param {object} oPerson Bezpečně filtrovaný záznam serveru.
     * @returns {string} HTML widgetu.
     */
    const fnPerson = (oPerson) => `<a class="hc-ft-widget-item" href="${fnEscape(fnTreeUrl(oPerson.treeId, oPerson.id))}">
        <span class="hc-ft-widget-item-symbol" aria-hidden="true">👤</span>
        <span class="hc-ft-widget-item-text"><strong>${fnEscape(oPerson.name || fnTr('Person'))}</strong>
        <small>${fnEscape(oPerson.treeName)}${oPerson.timestamp ? ' · ' + fnEscape(fnDate(oPerson.timestamp)) : ''}${oPerson.actor ? ' · ' + fnEscape(fnTr('Updated by')) + ' ' + fnEscape(oPerson.actor) : ''}</small></span>
    </a>`;
    /**
     * @brief Vykreslí poslední vytvořenou genealogickou událost.
     * @param {object} oEvent Událost ověřená vůči přístupovým právům.
     * @returns {string} HTML widgetu.
     */
    const fnEvent = (oEvent) => `<a class="hc-ft-widget-item" href="${fnEscape(fnTreeUrl(oEvent.treeId, oEvent.personId))}">
        <span class="hc-ft-widget-item-symbol" aria-hidden="true">📅</span>
        <span class="hc-ft-widget-item-text"><strong>${fnEscape(oEvent.title || fnTr('Event'))}</strong>
        <small>${fnEscape(oEvent.personName)} · ${fnEscape(oEvent.treeName)}${oEvent.timestamp ? ' · ' + fnEscape(fnDate(oEvent.timestamp)) : ''}${oEvent.actor ? ' · ' + fnEscape(fnTr('Added by')) + ' ' + fnEscape(oEvent.actor) : ''}</small></span>
    </a>`;
    /**
     * @brief Vykreslí čerstvá data widgetu včetně původní ikony a oblíbeného rodokmenu.
     * @param {HTMLElement} hElement Kořen widgetu.
     * @param {object} oData Odpověď zabezpečeného API.
     * @returns {void} Vykreslený widget.
     */
    const fnRender = (hElement, oData) => {
        const aRecent = Array.isArray(oData.recent) ? oData.recent : [];
        const aEvents = Array.isArray(oData.recentEvents) ? oData.recentEvents : [];
        const oFavorite = oData.favorite && Number(oData.favorite.id) > 0 ? oData.favorite : null;
        hElement.innerHTML = `<div class="hc-ft-dashboard-widget">
            <a class="hc-ft-widget-favorite" href="${fnEscape(oFavorite ? fnTreeUrl(oFavorite.id) : sAppUrl)}">
                <img src="${fnEscape(sIconUrl)}" class="hc-ft-widget-icon" alt="" aria-hidden="true">
                <span class="hc-ft-widget-favorite-text"><span>${fnEscape(fnTr(oFavorite ? 'Open favorite family tree' : 'Open Family Tree'))}</span>
                ${oFavorite ? `<strong>${fnEscape(oFavorite.name)}</strong>` : ''}</span>
                <span aria-hidden="true">›</span>
            </a>
            <div class="hc-ft-widget-stats">
                <span><b>${fnEscape(Number(oData.trees) || 0)}</b><small>${fnEscape(fnTr('family trees'))}</small></span>
                <span><b>${fnEscape(Number(oData.people) || 0)}</b><small>${fnEscape(fnTr('people'))}</small></span>
            </div>
            <section class="hc-ft-widget-section"><h3>${fnEscape(fnTr('Recently updated people'))}</h3>
                ${aRecent.length ? aRecent.slice(0, 3).map(fnPerson).join('') : `<p>${fnEscape(fnTr('No recent updates.'))}</p>`}
            </section>
            <section class="hc-ft-widget-section"><h3>${fnEscape(fnTr('Recently added events'))}</h3>
                ${aEvents.length ? aEvents.slice(0, 3).map(fnEvent).join('') : `<p>${fnEscape(fnTr('No recently added events.'))}</p>`}
            </section>
        </div>`;
    };
    /**
     * @brief Načte aktuální data bez HTTP cache a bezpečně ošetří chybu síťového požadavku.
     * @param {HTMLElement} hElement Kořen widgetu.
     * @returns {Promise<void>} Aktualizace widgetu.
     */
    const fnRefresh = async (hElement) => {
        try {
            const oResponse = await fetch(OC.generateUrl('/apps/hc_familytree/api/dashboard'), {
                cache: 'no-store', credentials: 'same-origin',
                headers: { 'Accept': 'application/json', 'requesttoken': OC.requestToken || '' },
            });
            if (!oResponse.ok) throw new Error('HTTP ' + oResponse.status);
            const oData = await oResponse.json();
            fnRender(hElement, oData);
        } catch (oError) {
            hElement.textContent = fnTr('Family Tree could not be loaded.');
        }
    };

    OCA.Dashboard.register(sApp, (hElement) => {
        hElement.textContent = fnTr('Loading family tree…');
        void fnRefresh(hElement);
        // CZ: Po návratu na otevřený dashboard automaticky obnovíme data,
        // 20s interval se sám ukončí při odstranění widgetu ze stránky.
        const nTimer = window.setInterval(() => {
            if (!hElement.isConnected) { window.clearInterval(nTimer); return; }
            if (document.visibilityState === 'visible') void fnRefresh(hElement);
        }, 20000);
        // Po návratu na panel okamžitě načti poslední úpravy sdílených rodokmenů.
        document.addEventListener?.('visibilitychange', () => {
            if (hElement.isConnected && document.visibilityState === 'visible') void fnRefresh(hElement);
        });
    });
})();

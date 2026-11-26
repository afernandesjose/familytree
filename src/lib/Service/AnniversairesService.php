<?php

declare(strict_types=1);

namespace OCA\Lignees\Service;

use OCA\DAV\CalDAV\CalDavBackend;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\IGroupManager;
use OCP\IUserManager;

/**
 * Anniversaires dans les agendas, réglés par chaque utilisateur, et paramètres partagés d'un arbre.
 *
 * Par défaut, un utilisateur reçoit les anniversaires de sa lignée et de celle de son ou sa conjointe (y compris
 * dans un autre arbre relié par un pont) ; il choisit les autres lignées, peut retirer des personnes et envoyer les
 * anniversaires dans un ou plusieurs de ses agendas. Une personne présente dans deux arbres n'apparaît qu'une fois.
 *
 * Lignées ne crée, ne modifie et ne supprime que ses propres événements (fichiers « lignees-p<personne>.ics ») ;
 * les autres événements des agendas ne sont jamais touchés.
 */
final class AnniversairesService {
    /** Paramètres partagés d'un arbre. */
    public const DEFAUTS_ARBRE = ['lignee_conjoint' => false];
    /** Réglages personnels des anniversaires. */
    public const DEFAUTS_UTILISATEUR = [
        'actif' => false, 'agendas' => [], 'deces' => false, 'rappel' => true,
        'moi' => '', 'lignees' => [], 'exclus' => [],
    ];
    private const PREFIXE = 'lignees-p';
    private const MOIS_GEDCOM = ['JAN' => 1, 'FEB' => 2, 'MAR' => 3, 'APR' => 4, 'MAY' => 5, 'JUN' => 6,
        'JUL' => 7, 'AUG' => 8, 'SEP' => 9, 'OCT' => 10, 'NOV' => 11, 'DEC' => 12];

    public function __construct(private IConfig $oConfig, private IDBConnection $oDb, private CalDavBackend $oCalDav,
        private IUserManager $oUsers, private IGroupManager $oGroups) {
    }

    // ---- Paramètres partagés d'un arbre

    public function parametres(int $nTreeId): array {
        $aLus = json_decode($this->oConfig->getAppValue('lignees', 'parametres_' . $nTreeId, '{}'), true);
        return array_merge(self::DEFAUTS_ARBRE, array_intersect_key(is_array($aLus) ? $aLus : [], self::DEFAUTS_ARBRE));
    }

    public function enregistrer(int $nTreeId, array $aNouveaux): array {
        $aP = $this->parametres($nTreeId);
        foreach (array_keys(self::DEFAUTS_ARBRE) as $sCle) if (array_key_exists($sCle, $aNouveaux)) $aP[$sCle] = (bool)$aNouveaux[$sCle];
        $this->oConfig->setAppValue('lignees', 'parametres_' . $nTreeId, json_encode($aP, JSON_THROW_ON_ERROR));
        return $aP;
    }

    public function supprimer(int $nTreeId): void {
        $this->oConfig->deleteAppValue('lignees', 'parametres_' . $nTreeId);
        $this->synchroniserTout(); // les personnes de l'arbre disparu quittent les agendas
    }

    // ---- Réglages personnels

    public function preferences(string $sUid): array {
        $aLus = json_decode($this->oConfig->getUserValue($sUid, 'lignees', 'anniversaires', '{}'), true);
        $aP = array_merge(self::DEFAUTS_UTILISATEUR, array_intersect_key(is_array($aLus) ? $aLus : [], self::DEFAUTS_UTILISATEUR));
        $aP['agendas'] = array_values(array_map('strval', (array)$aP['agendas']));
        $aP['exclus'] = array_values(array_map('strval', (array)$aP['exclus']));
        $aP['lignees'] = array_map('boolval', (array)$aP['lignees']);
        return $aP;
    }

    /** Enregistre les réglages ; les agendas abandonnés (ou tous, si on désactive) sont vidés de nos événements. */
    public function enregistrerPreferences(string $sUid, array $aNouveaux): array {
        $aAvant = $this->preferences($sUid);
        $aP = $aAvant;
        foreach (['actif', 'deces', 'rappel'] as $sCle) if (array_key_exists($sCle, $aNouveaux)) $aP[$sCle] = (bool)$aNouveaux[$sCle];
        if (array_key_exists('moi', $aNouveaux)) $aP['moi'] = (string)$aNouveaux['moi'];
        if (array_key_exists('agendas', $aNouveaux)) {
            $aMiens = array_column($this->agendas($sUid), 'uri');
            $aP['agendas'] = array_values(array_intersect(array_map('strval', (array)$aNouveaux['agendas']), $aMiens));
        }
        if (array_key_exists('lignees', $aNouveaux)) {
            $aP['lignees'] = [];
            foreach ((array)$aNouveaux['lignees'] as $sCle => $bOui) {
                if (preg_match('/^\d+:[0-9+]{1,400}$/D', (string)$sCle)) $aP['lignees'][(string)$sCle] = (bool)$bOui;
            }
        }
        if (array_key_exists('exclus', $aNouveaux)) $aP['exclus'] = array_values(array_unique(array_filter(array_map('strval', (array)$aNouveaux['exclus']), 'ctype_digit')));
        $aGardes = $aP['actif'] ? $aP['agendas'] : [];
        foreach (array_diff($aAvant['agendas'], $aGardes) as $sUri) $this->viderAgenda($sUid, $sUri);
        $this->oConfig->setUserValue($sUid, 'lignees', 'anniversaires', json_encode($aP, JSON_THROW_ON_ERROR));
        $this->retenirUtilisateur($sUid, $aP['actif']);
        return $aP;
    }

    /** Retire ou remet une personne dans l'agenda de l'utilisateur. */
    public function exclure(string $sUid, string $sPersonne, bool $bExclu): array {
        $aP = $this->preferences($sUid);
        $aExclus = array_values(array_diff($aP['exclus'], [$sPersonne]));
        if ($bExclu) $aExclus[] = $sPersonne;
        return $this->enregistrerPreferences($sUid, ['exclus' => $aExclus]);
    }

    /** Tout ce qu'il faut au dialogue « Mes anniversaires » : réglages, agendas, lignées visibles, personne « moi ». */
    public function vue(string $sUid): array {
        $aP = $this->preferences($sUid);
        $aMonde = $this->monde($sUid);
        $sMoi = (string)($aP['moi'] !== '' && isset($aMonde['personnes'][$aP['moi']]) ? $aP['moi'] : $this->deviner($sUid, $aMonde));
        $aDefaut = $this->ligneesParDefaut($sMoi, $aMonde);
        $aLignees = [];
        foreach ($aMonde['lignees'] as $sCle => $aL) {
            $aLignees[] = ['cle' => $sCle, 'arbre' => $aL['arbre_nom'], 'nom' => $aL['nom'], 'membres' => count($aL['membres']),
                'par_defaut' => in_array($sCle, $aDefaut, true), 'inclus' => $aP['lignees'][$sCle] ?? in_array($sCle, $aDefaut, true)];
        }
        $aExclus = [];
        foreach ($aP['exclus'] as $sId) if (isset($aMonde['personnes'][$sId])) $aExclus[] = ['id' => (string)$sId] + $this->identite($aMonde['personnes'][$sId], $aMonde);
        $aPersonnes = [];
        foreach ($aMonde['personnes'] as $sId => $p) $aPersonnes[] = ['id' => (string)$sId] + $this->identite($p, $aMonde);
        usort($aPersonnes, fn($a, $b) => strcmp($a['libelle'], $b['libelle']));
        return ['preferences' => array_merge($aP, ['moi' => $sMoi]), 'mes_agendas' => $this->agendas($sUid),
            'lignees' => $aLignees, 'exclus' => $aExclus, 'personnes' => $aPersonnes];
    }

    // ---- Synchronisation

    public function synchroniserTout(): void {
        foreach ($this->utilisateurs() as $sUid) {
            try { $this->synchroniserUtilisateur($sUid); } catch (\Throwable) { /* un utilisateur en erreur n'arrête pas les autres */ }
        }
    }

    /** @return array{ajoutes:int, modifies:int, supprimes:int, actif:bool, personnes:int} */
    public function synchroniserUtilisateur(string $sUid): array {
        $aP = $this->preferences($sUid);
        $aBilan = ['ajoutes' => 0, 'modifies' => 0, 'supprimes' => 0, 'actif' => false, 'personnes' => 0];
        if (!$aP['actif'] || !$aP['agendas'] || !$this->oUsers->userExists($sUid)) return $aBilan;
        $aBilan['actif'] = true;

        $aMonde = $this->monde($sUid);
        $sMoi = $aP['moi'] !== '' && isset($aMonde['personnes'][$aP['moi']]) ? $aP['moi'] : $this->deviner($sUid, $aMonde);
        $aDefaut = $this->ligneesParDefaut($sMoi, $aMonde);
        $aVoulus = [];
        foreach ($aMonde['lignees'] as $sCle => $aL) {
            if (!($aP['lignees'][$sCle] ?? in_array($sCle, $aDefaut, true))) continue;
            foreach ($aL['membres'] as $sId) {
                $sId = (string)$sId; $sCanon = (string)$aMonde['canon'][$sId];
                // Exclure une personne l'exclut sous tous ses arbres (elle et ses copies reliées par un pont).
                if (in_array($sId, $aP['exclus'], true) || array_intersect($aMonde['copies'][$sCanon], $aP['exclus'])) continue;
                $p = $aMonde['personnes'][$sId];
                $aNaissance = self::date((string)$p['birth_date']);
                if ($aNaissance === null) continue;
                $aDeces = self::date((string)$p['death_date']);
                $bDecede = $aDeces !== null || trim((string)$p['death_date']) !== '' || in_array($p['is_living'], [false, 0, '0', 'f'], true);
                if ($bDecede && !$aP['deces']) continue;
                $aVoulus[self::PREFIXE . $sCanon . '.ics'] ??= $this->evenement($sCanon, $p, $aNaissance, $bDecede ? $aDeces : null, $bDecede, $aP['rappel']);
            }
        }
        $aBilan['personnes'] = count($aVoulus);
        foreach ($aP['agendas'] as $sUri) {
            $nAgenda = $this->idAgenda($sUid, $sUri);
            if ($nAgenda === null) continue;
            $aExistants = [];
            foreach ($this->oCalDav->getCalendarObjects($nAgenda) as $aObjet) {
                if (str_starts_with((string)$aObjet['uri'], self::PREFIXE)) $aExistants[(string)$aObjet['uri']] = true;
            }
            foreach ($aVoulus as $sFichier => $sIcs) {
                if (!isset($aExistants[$sFichier])) { $this->oCalDav->createCalendarObject($nAgenda, $sFichier, $sIcs); $aBilan['ajoutes']++; continue; }
                if (($this->oCalDav->getCalendarObject($nAgenda, $sFichier)['calendardata'] ?? '') !== $sIcs) {
                    $this->oCalDav->updateCalendarObject($nAgenda, $sFichier, $sIcs); $aBilan['modifies']++;
                }
            }
            foreach (array_keys($aExistants) as $sFichier) {
                if (!isset($aVoulus[$sFichier])) { $this->oCalDav->deleteCalendarObject($nAgenda, $sFichier, CalDavBackend::CALENDAR_TYPE_CALENDAR, true); $aBilan['supprimes']++; }
            }
        }
        return $aBilan;
    }

    // ---- Agendas

    /** Agendas appartenant à l'utilisateur et acceptant des événements (jamais un agenda partagé par quelqu'un d'autre). */
    public function agendas(string $sUid): array {
        $aResultat = [];
        foreach ($this->oCalDav->getCalendarsForUser('principals/users/' . $sUid) as $aAgenda) {
            if (($aAgenda['principaluri'] ?? '') !== 'principals/users/' . $sUid) continue;
            if (str_starts_with((string)$aAgenda['uri'], 'contact_birthdays')) continue;
            $oComposants = $aAgenda['{urn:ietf:params:xml:ns:caldav}supported-calendar-component-set'] ?? null;
            if ($oComposants instanceof \Sabre\CalDAV\Xml\Property\SupportedCalendarComponentSet && !in_array('VEVENT', $oComposants->getValue(), true)) continue;
            $aResultat[] = ['uri' => (string)$aAgenda['uri'], 'nom' => (string)($aAgenda['{DAV:}displayname'] ?? $aAgenda['uri'])];
        }
        return $aResultat;
    }

    public function creerAgenda(string $sUid, string $sNom): string {
        $sBase = 'lignees-' . substr(trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($sNom)) ?: 'anniversaires', '-'), 0, 40);
        $sUri = $sBase;
        $aExistants = array_column($this->agendas($sUid), 'uri');
        for ($n = 2; in_array($sUri, $aExistants, true); $n++) $sUri = $sBase . '-' . $n;
        $this->oCalDav->createCalendar('principals/users/' . $sUid, $sUri, [
            '{DAV:}displayname' => $sNom,
            '{http://apple.com/ns/ical/}calendar-color' => '#B68934',
            '{urn:ietf:params:xml:ns:caldav}supported-calendar-component-set' => new \Sabre\CalDAV\Xml\Property\SupportedCalendarComponentSet(['VEVENT']),
        ]);
        return $sUri;
    }

    private function viderAgenda(string $sUid, string $sUri): void {
        $nAgenda = $this->idAgenda($sUid, $sUri);
        if ($nAgenda === null) return;
        foreach ($this->oCalDav->getCalendarObjects($nAgenda) as $aObjet) {
            if (str_starts_with((string)$aObjet['uri'], self::PREFIXE)) {
                $this->oCalDav->deleteCalendarObject($nAgenda, (string)$aObjet['uri'], CalDavBackend::CALENDAR_TYPE_CALENDAR, true);
            }
        }
    }

    private function idAgenda(string $sUid, string $sUri): ?int {
        foreach ($this->oCalDav->getCalendarsForUser('principals/users/' . $sUid) as $aAgenda) {
            if ($aAgenda['uri'] === $sUri && ($aAgenda['principaluri'] ?? '') === 'principals/users/' . $sUid) return (int)$aAgenda['id'];
        }
        return null;
    }

    // ---- Le « monde » d'un utilisateur : ses arbres visibles, leurs lignées et les ponts entre eux

    private function monde(string $sUid): array {
        $aPersonnes = []; $aLignees = []; $aCleDe = []; $aArbreDe = [];
        foreach ($this->arbresVisibles($sUid) as $aArbre) {
            $nId = (int)$aArbre['id'];
            $aGens = $this->lignes('hc_familytree_people', $nId);
            $aCalcul = LigneesCalcul::calculer($aGens, $this->lignes('hc_familytree_relations', $nId));
            foreach ($aGens as $p) { $aPersonnes[(string)$p['id']] = $p; $aArbreDe[(string)$p['id']] = $nId; }
            foreach ($aCalcul['lignees'] as $sCle => $aL) $aLignees[$nId . ':' . $sCle] = $aL + ['arbre_nom' => (string)$aArbre['name']];
            foreach ($aCalcul['cleDe'] as $sP => $sCle) $aCleDe[$sP] = $nId . ':' . $sCle;
        }
        // Ponts : une même personne dans plusieurs arbres → un représentant (le plus petit identifiant).
        $aRep = [];
        $fnTrouver = function (string $x) use (&$aRep, &$fnTrouver): string { return !isset($aRep[$x]) || $aRep[$x] === $x ? $x : ($aRep[$x] = $fnTrouver($aRep[$x])); };
        $aPontsDe = [];
        foreach ($this->oDb->getQueryBuilder()->select('*')->from('lignees_passerelles')->executeQuery()->fetchAllAssociative() as $aPont) {
            $a = (string)$aPont['person_id']; $b = (string)$aPont['cible_id'];
            if (!isset($aPersonnes[$a], $aPersonnes[$b])) continue;
            $aPontsDe[$a][] = $b; $aPontsDe[$b][] = $a;
            $ra = $fnTrouver($a); $rb = $fnTrouver($b);
            if ($ra !== $rb) { if ((int)$ra < (int)$rb) $aRep[$rb] = $ra; else $aRep[$ra] = $rb; }
        }
        $aCanon = []; $aCopies = [];
        foreach (array_keys($aPersonnes) as $sId) { $c = $fnTrouver((string)$sId); $aCanon[(string)$sId] = $c; $aCopies[$c][] = (string)$sId; }
        $aConjoints = [];
        foreach ($this->oDb->getQueryBuilder()->select('*')->from('hc_familytree_relations')->executeQuery()->fetchAllAssociative() as $l) {
            if ($l['type'] !== 'partner') continue;
            $a = (string)$l['person1_id']; $b = (string)$l['person2_id'];
            if (isset($aPersonnes[$a], $aPersonnes[$b])) { $aConjoints[$a][] = $b; $aConjoints[$b][] = $a; }
        }
        return ['personnes' => $aPersonnes, 'lignees' => $aLignees, 'cleDe' => $aCleDe, 'arbreDe' => $aArbreDe,
            'canon' => $aCanon, 'copies' => $aCopies, 'ponts' => $aPontsDe, 'conjoints' => $aConjoints];
    }

    /** Lignées par défaut : celles qui contiennent « moi », ses conjoints, ou leurs copies dans d'autres arbres. */
    private function ligneesParDefaut(string $sMoi, array $aMonde): array {
        if ($sMoi === '') return [];
        $aGens = [$sMoi];
        foreach ($aMonde['copies'][$aMonde['canon'][$sMoi]] ?? [] as $sCopie) {
            $aGens[] = $sCopie;
            foreach ($aMonde['conjoints'][$sCopie] ?? [] as $sConjoint) {
                $aGens[] = $sConjoint;
                foreach ($aMonde['copies'][$aMonde['canon'][$sConjoint]] ?? [] as $s) $aGens[] = $s;
            }
        }
        return array_values(array_unique(array_filter(array_map(fn($s) => $aMonde['cleDe'][$s] ?? null, $aGens))));
    }

    /** Personne du compte : même prénom que le nom affiché de l'utilisateur, si une seule correspond. */
    private function deviner(string $sUid, array $aMonde): string {
        $sPrenom = mb_strtolower(explode(' ', trim((string)$this->oUsers->getDisplayName($sUid)))[0] ?? '');
        if ($sPrenom === '') return '';
        $aTrouves = [];
        foreach ($aMonde['personnes'] as $sId => $p) {
            if (mb_strtolower(explode(' ', trim((string)$p['given_name']))[0] ?? '') === $sPrenom) $aTrouves['c' . $aMonde['canon'][(string)$sId]][] = (string)$sId;
        }
        return count($aTrouves) === 1 ? (string)reset($aTrouves)[0] : '';
    }

    private function identite(array $p, array $aMonde): array {
        $an = self::date((string)$p['birth_date'])[0] ?? '';
        $sArbre = $aMonde['lignees'][$aMonde['cleDe'][(string)$p['id']] ?? '']['arbre_nom'] ?? '';
        return ['libelle' => trim($p['given_name'] . ' ' . $p['surname']) . ($an ? " ($an)" : ''), 'arbre' => $sArbre];
    }

    private function arbresVisibles(string $sUid): array {
        $oUser = $this->oUsers->get($sUid);
        if (!$oUser) return [];
        $aVisibles = [];
        foreach ($this->oDb->getQueryBuilder()->select('*')->from('hc_familytree_trees')->executeQuery()->fetchAllAssociative() as $aArbre) {
            $bVoit = $aArbre['owner_uid'] === $sUid;
            if (!$bVoit) {
                foreach ($this->lignes('hc_familytree_shares', (int)$aArbre['id']) as $s) {
                    if (($s['share_type'] === 'user' && $s['share_with'] === $sUid) || ($s['share_type'] === 'group' && $this->oGroups->isInGroup($sUid, $s['share_with']))) { $bVoit = true; break; }
                }
            }
            if ($bVoit) $aVisibles[] = $aArbre;
        }
        return $aVisibles;
    }

    private function lignes(string $sTable, int $nTreeId): array {
        $oQ = $this->oDb->getQueryBuilder();
        return $oQ->select('*')->from($sTable)->where($oQ->expr()->eq('tree_id', $oQ->createNamedParameter($nTreeId)))->executeQuery()->fetchAllAssociative();
    }

    private function utilisateurs(): array {
        $a = json_decode($this->oConfig->getAppValue('lignees', 'anniversaires_utilisateurs', '[]'), true);
        return is_array($a) ? $a : [];
    }

    private function retenirUtilisateur(string $sUid, bool $bActif): void {
        $a = array_values(array_diff($this->utilisateurs(), [$sUid]));
        if ($bActif) $a[] = $sUid;
        $this->oConfig->setAppValue('lignees', 'anniversaires_utilisateurs', json_encode($a, JSON_THROW_ON_ERROR));
    }

    // ---- Événements iCalendar

    /** Lit une date complète : AAAA-MM-JJ, JJ/MM/AAAA, JJ.MM.AAAA ou « JJ MON AAAA » (GEDCOM). */
    public static function date(string $sValeur): ?array {
        $sValeur = trim($sValeur);
        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $sValeur, $aM)) [$nA, $nM, $nJ] = [(int)$aM[1], (int)$aM[2], (int)$aM[3]];
        elseif (preg_match('/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/', $sValeur, $aM)) [$nA, $nM, $nJ] = [(int)$aM[3], (int)$aM[2], (int)$aM[1]];
        elseif (preg_match('/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/', $sValeur, $aM) && isset(self::MOIS_GEDCOM[strtoupper($aM[2])])) [$nA, $nM, $nJ] = [(int)$aM[3], self::MOIS_GEDCOM[strtoupper($aM[2])], (int)$aM[1]];
        else return null;
        return checkdate($nM, $nJ, $nA) ? [$nA, $nM, $nJ] : null;
    }

    private function evenement(string $sCanon, array $aPersonne, array $aNaissance, ?array $aDeces, bool $bDecede, bool $bRappel): string {
        [$nA, $nM, $nJ] = $aNaissance;
        $sPrenom = trim((string)$aPersonne['given_name']) ?: trim((string)$aPersonne['surname']);
        $sTitre = $bDecede
            ? '🕯 Naissance de ' . $sPrenom . ' (' . $nA . ($aDeces ? ' – ' . $aDeces[0] : '') . ')'
            : '🎂 Anniversaire de ' . $sPrenom . ' (' . $nA . ')';
        $oDebut = new \DateTimeImmutable(sprintf('%04d-%02d-%02d', $nA, $nM, $nJ));
        $sRegle = ($nM === 2 && $nJ === 29) ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'FREQ=YEARLY';
        $aLignes = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lignées//Anniversaires//FR', 'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT',
            'UID:' . self::PREFIXE . $sCanon . '@lignees',
            'DTSTAMP:' . gmdate('Ymd\THis\Z', (int)($aPersonne['updated_at'] ?? 0) ?: 1764547200),
            'DTSTART;VALUE=DATE:' . $oDebut->format('Ymd'),
            'DTEND;VALUE=DATE:' . $oDebut->modify('+1 day')->format('Ymd'),
            'RRULE:' . $sRegle,
            'SUMMARY:' . self::texte($sTitre),
            'TRANSP:TRANSPARENT',
            'CATEGORIES:' . ($bDecede ? 'Mémoire' : 'Anniversaire'),
        ];
        if ($bRappel && !$bDecede) {
            array_push($aLignes, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' . self::texte('Demain : anniversaire de ' . $sPrenom), 'TRIGGER:-PT15H', 'END:VALARM');
        }
        array_push($aLignes, 'END:VEVENT', 'END:VCALENDAR');
        return implode("\r\n", array_map([self::class, 'plier'], $aLignes)) . "\r\n";
    }

    /** Échappement d'un texte iCalendar (RFC 5545, 3.3.11). */
    private static function texte(string $s): string {
        return str_replace(['\\', ';', ',', "\r\n", "\n"], ['\\\\', '\;', '\,', '\n', '\n'], $s);
    }

    /** Pliage des lignes à 75 octets sans couper un caractère UTF-8. */
    private static function plier(string $sLigne): string {
        if (strlen($sLigne) <= 75) return $sLigne;
        $aMorceaux = []; $sCourant = '';
        foreach (preg_split('//u', $sLigne, -1, PREG_SPLIT_NO_EMPTY) as $sCar) {
            if (strlen($sCourant) + strlen($sCar) > ($aMorceaux ? 74 : 75)) { $aMorceaux[] = $sCourant; $sCourant = ''; }
            $sCourant .= $sCar;
        }
        $aMorceaux[] = $sCourant;
        return implode("\r\n ", $aMorceaux);
    }
}

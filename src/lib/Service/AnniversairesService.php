<?php

declare(strict_types=1);

namespace OCA\Lignees\Service;

use OCA\DAV\CalDAV\CalDavBackend;
use OCP\IConfig;
use OCP\IDBConnection;

/**
 * Paramètres d'un arbre et synchronisation de ses anniversaires vers un agenda Nextcloud.
 *
 * Les paramètres sont rangés dans la configuration de l'application (clé « parametres_<arbre> »).
 * Lignées ne crée, ne modifie et ne supprime que ses propres événements, reconnus à leur nom de fichier
 * « lignees-<arbre>-<personne>.ics » : les autres événements de l'agenda ne sont jamais touchés.
 */
final class AnniversairesService {
    public const DEFAUTS = [
        'anniversaires' => false,   // synchroniser les anniversaires vers un agenda
        'agenda_uid' => '',         // propriétaire de l'agenda
        'agenda_uri' => '',         // agenda choisi
        'deces' => false,           // inclure les personnes décédées
        'rappel' => true,           // rappel la veille à 9 h
        'lignee_conjoint' => false, // créer un arbre pour la famille de chaque conjoint ajouté
    ];
    private const MOIS_GEDCOM = ['JAN' => 1, 'FEB' => 2, 'MAR' => 3, 'APR' => 4, 'MAY' => 5, 'JUN' => 6,
        'JUL' => 7, 'AUG' => 8, 'SEP' => 9, 'OCT' => 10, 'NOV' => 11, 'DEC' => 12];

    public function __construct(private IConfig $oConfig, private IDBConnection $oDb, private CalDavBackend $oCalDav) {
    }

    public function parametres(int $nTreeId): array {
        $aLus = json_decode($this->oConfig->getAppValue('lignees', 'parametres_' . $nTreeId, '{}'), true);
        return array_merge(self::DEFAUTS, array_intersect_key(is_array($aLus) ? $aLus : [], self::DEFAUTS));
    }

    /** Enregistre les paramètres ; si l'agenda change ou si la synchronisation est coupée, retire les anciens événements. */
    public function enregistrer(int $nTreeId, array $aNouveaux): array {
        $aAvant = $this->parametres($nTreeId);
        $aApres = $aAvant;
        foreach (['anniversaires', 'deces', 'rappel', 'lignee_conjoint'] as $sCle) {
            if (array_key_exists($sCle, $aNouveaux)) $aApres[$sCle] = (bool)$aNouveaux[$sCle];
        }
        foreach (['agenda_uid', 'agenda_uri'] as $sCle) {
            if (array_key_exists($sCle, $aNouveaux)) $aApres[$sCle] = (string)$aNouveaux[$sCle];
        }
        $bAgendaChange = $aAvant['agenda_uid'] !== $aApres['agenda_uid'] || $aAvant['agenda_uri'] !== $aApres['agenda_uri'];
        if ($aAvant['anniversaires'] && ($bAgendaChange || !$aApres['anniversaires'])) {
            $this->retirer($nTreeId, $aAvant);
        }
        $this->oConfig->setAppValue('lignees', 'parametres_' . $nTreeId, json_encode($aApres, JSON_THROW_ON_ERROR));
        return $aApres;
    }

    /** Suppression d'un arbre : ses événements et ses paramètres disparaissent. */
    public function supprimer(int $nTreeId): void {
        $this->retirer($nTreeId, $this->parametres($nTreeId));
        $this->oConfig->deleteAppValue('lignees', 'parametres_' . $nTreeId);
    }

    /** Agendas appartenant à l'utilisateur (on n'écrit jamais dans un agenda partagé par quelqu'un d'autre). */
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
        $sBase = 'lignees-' . substr(preg_replace('/[^a-z0-9]+/', '-', strtolower($sNom)) ?: 'anniversaires', 0, 40);
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

    /** Synchronise tous les arbres dont la synchronisation est activée (tâche de fond). */
    public function synchroniserTout(): void {
        foreach ($this->oConfig->getAppKeys('lignees') as $sCle) {
            if (preg_match('/^parametres_(\d+)$/', $sCle, $aM)) {
                try { $this->synchroniser((int)$aM[1]); } catch (\Throwable) { /* un arbre en erreur n'arrête pas les autres */ }
            }
        }
    }

    /** @return array{ajoutes:int, modifies:int, supprimes:int, actif:bool} */
    public function synchroniser(int $nTreeId): array {
        $aP = $this->parametres($nTreeId);
        $aBilan = ['ajoutes' => 0, 'modifies' => 0, 'supprimes' => 0, 'actif' => false];
        if (!$aP['anniversaires'] || $aP['agenda_uid'] === '' || $aP['agenda_uri'] === '') return $aBilan;
        $nAgenda = $this->idAgenda($aP['agenda_uid'], $aP['agenda_uri']);
        if ($nAgenda === null) return $aBilan;
        $aBilan['actif'] = true;

        $aVoulus = [];
        $oQ = $this->oDb->getQueryBuilder();
        $oQ->select('*')->from('hc_familytree_people')->where($oQ->expr()->eq('tree_id', $oQ->createNamedParameter($nTreeId)));
        foreach ($oQ->executeQuery()->fetchAllAssociative() as $aPersonne) {
            $aNaissance = self::date((string)$aPersonne['birth_date']);
            if ($aNaissance === null) continue;
            $aDeces = self::date((string)$aPersonne['death_date']);
            $bDecede = $aDeces !== null || trim((string)$aPersonne['death_date']) !== ''
                || in_array($aPersonne['is_living'], [false, 0, '0', 'f'], true);
            if ($bDecede && !$aP['deces']) continue;
            $sFichier = 'lignees-' . $nTreeId . '-' . (int)$aPersonne['id'] . '.ics';
            $aVoulus[$sFichier] = $this->evenement($nTreeId, $aPersonne, $aNaissance, $bDecede ? $aDeces : null, $bDecede, $aP['rappel']);
        }

        $sPrefixe = 'lignees-' . $nTreeId . '-';
        $aExistants = [];
        foreach ($this->oCalDav->getCalendarObjects($nAgenda) as $aObjet) {
            if (str_starts_with((string)$aObjet['uri'], $sPrefixe)) $aExistants[(string)$aObjet['uri']] = true;
        }
        foreach ($aVoulus as $sFichier => $sIcs) {
            if (!isset($aExistants[$sFichier])) {
                $this->oCalDav->createCalendarObject($nAgenda, $sFichier, $sIcs);
                $aBilan['ajoutes']++;
                continue;
            }
            $aActuel = $this->oCalDav->getCalendarObject($nAgenda, $sFichier);
            if (($aActuel['calendardata'] ?? '') !== $sIcs) {
                $this->oCalDav->updateCalendarObject($nAgenda, $sFichier, $sIcs);
                $aBilan['modifies']++;
            }
        }
        foreach (array_keys($aExistants) as $sFichier) {
            if (!isset($aVoulus[$sFichier])) {
                $this->oCalDav->deleteCalendarObject($nAgenda, $sFichier, CalDavBackend::CALENDAR_TYPE_CALENDAR, true);
                $aBilan['supprimes']++;
            }
        }
        return $aBilan;
    }

    private function retirer(int $nTreeId, array $aP): void {
        if ($aP['agenda_uid'] === '' || $aP['agenda_uri'] === '') return;
        $nAgenda = $this->idAgenda($aP['agenda_uid'], $aP['agenda_uri']);
        if ($nAgenda === null) return;
        foreach ($this->oCalDav->getCalendarObjects($nAgenda) as $aObjet) {
            if (str_starts_with((string)$aObjet['uri'], 'lignees-' . $nTreeId . '-')) {
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

    /** Lit une date complète : AAAA-MM-JJ, JJ/MM/AAAA, JJ.MM.AAAA ou « JJ MON AAAA » (GEDCOM). */
    public static function date(string $sValeur): ?array {
        $sValeur = trim($sValeur);
        if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $sValeur, $aM)) [$nA, $nM, $nJ] = [(int)$aM[1], (int)$aM[2], (int)$aM[3]];
        elseif (preg_match('/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/', $sValeur, $aM)) [$nA, $nM, $nJ] = [(int)$aM[3], (int)$aM[2], (int)$aM[1]];
        elseif (preg_match('/^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/', $sValeur, $aM) && isset(self::MOIS_GEDCOM[strtoupper($aM[2])])) [$nA, $nM, $nJ] = [(int)$aM[3], self::MOIS_GEDCOM[strtoupper($aM[2])], (int)$aM[1]];
        else return null;
        return checkdate($nM, $nJ, $nA) ? [$nA, $nM, $nJ] : null;
    }

    private function evenement(int $nTreeId, array $aPersonne, array $aNaissance, ?array $aDeces, bool $bDecede, bool $bRappel): string {
        [$nA, $nM, $nJ] = $aNaissance;
        $sPrenom = trim((string)$aPersonne['given_name']) ?: trim((string)$aPersonne['surname']);
        $sTitre = $bDecede
            ? '🕯 Naissance de ' . $sPrenom . ' (' . $nA . ($aDeces ? ' – ' . $aDeces[0] : '') . ')'
            : '🎂 Anniversaire de ' . $sPrenom . ' (' . $nA . ')';
        $oDebut = new \DateTimeImmutable(sprintf('%04d-%02d-%02d', $nA, $nM, $nJ));
        $sRegle = ($nM === 2 && $nJ === 29) ? 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'FREQ=YEARLY';
        $sStamp = gmdate('Ymd\THis\Z', (int)($aPersonne['updated_at'] ?? 0) ?: 1764547200);
        $aLignes = [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lignées//Anniversaires//FR', 'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT',
            'UID:lignees-' . $nTreeId . '-' . (int)$aPersonne['id'] . '@lignees',
            'DTSTAMP:' . $sStamp,
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

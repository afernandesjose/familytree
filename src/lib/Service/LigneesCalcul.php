<?php

declare(strict_types=1);

namespace OCA\Lignees\Service;

/**
 * Découpage d'un arbre en lignées, côté serveur (pour l'agenda des anniversaires).
 *
 * Reprend exactement les étapes 2 à 4 de js/vue-complete.js (rattachement des conjoints, groupes, racines,
 * lignées), pour que les clés de lignée soient les mêmes dans le navigateur et sur le serveur.
 */
final class LigneesCalcul {
    /**
     * @param array $aPersonnes lignes de hc_familytree_people (id, given_name, surname, birth_date…)
     * @param array $aLiens lignes de hc_familytree_relations (type, person1_id, person2_id)
     * @return array{lignees: array<string, array{cle: string, racine: string[], membres: string[], nom: string}>, cleDe: array<string, string>}
     */
    public static function calculer(array $aPersonnes, array $aLiens): array {
        usort($aPersonnes, fn($a, $b) => (int)$a['id'] <=> (int)$b['id']);
        $aIds = array_map(fn($p) => (string)$p['id'], $aPersonnes);
        $aRang = array_flip($aIds);
        $aNaissance = []; $aNom = [];
        foreach ($aPersonnes as $p) {
            $aD = AnniversairesService::date((string)$p['birth_date']);
            $aNaissance[(string)$p['id']] = $aD ? sprintf('%04d-%02d-%02d', ...$aD) : ((string)$p['birth_date'] !== '' ? (string)$p['birth_date'] : '9999');
            $aNom[(string)$p['id']] = ['prenom' => (string)$p['given_name'], 'nom' => (string)$p['surname']];
        }
        $aParents = array_fill_keys($aIds, []); $aConjoints = array_fill_keys($aIds, []);
        foreach ($aLiens as $l) {
            $a = (string)$l['person1_id']; $b = (string)$l['person2_id'];
            if (!isset($aRang[$a], $aRang[$b]) || $a === $b) continue;
            if ($l['type'] === 'parent' && !in_array($a, $aParents[$b], true)) $aParents[$b][] = $a;
            if ($l['type'] === 'partner' && !in_array($b, $aConjoints[$a], true)) { $aConjoints[$a][] = $b; $aConjoints[$b][] = $a; }
        }
        $fnAge = fn(string $x, string $y): int => strcmp($aNaissance[$x], $aNaissance[$y]) ?: $aRang[$x] - $aRang[$y];
        $fnPremier = function (array $aListe) use ($fnAge): string { usort($aListe, $fnAge); return $aListe[0]; };

        // Rattachement : un conjoint sans parents se place à côté d'un conjoint qui en a.
        $aRattache = [];
        foreach ($aIds as $i) {
            if ($aParents[$i]) continue;
            $aAvec = array_values(array_filter($aConjoints[$i], fn($c) => (bool)$aParents[$c]));
            if ($aAvec) $aRattache[$i] = $fnPremier($aAvec);
        }
        // Groupes (une personne et ses conjoints rattachés) ; racines = groupes sans parents.
        $aGroupes = []; $aGroupeDe = []; $aRacines = [];
        $fnCreer = function (array $aMembres) use (&$aGroupes, &$aGroupeDe): int {
            $n = count($aGroupes); $aGroupes[$n] = ['membres' => $aMembres, 'enfants' => []];
            foreach ($aMembres as $m) $aGroupeDe[$m] = $n;
            return $n;
        };
        $aTries = $aIds; usort($aTries, $fnAge);
        foreach ($aTries as $i) {
            if (isset($aGroupeDe[$i]) || $aParents[$i] || isset($aRattache[$i])) continue;
            $aMembres = [$i];
            foreach ($aConjoints[$i] as $c) if (!$aParents[$c] && !isset($aRattache[$c]) && !isset($aGroupeDe[$c])) $aMembres[] = $c;
            $aRacines[] = $fnCreer($aMembres);
        }
        foreach ($aIds as $i) {
            if (isset($aGroupeDe[$i]) || !$aParents[$i]) continue;
            $aMembres = [$i];
            foreach ($aConjoints[$i] as $c) if (($aRattache[$c] ?? null) === $i) $aMembres[] = $c;
            $fnCreer($aMembres);
        }
        foreach ($aIds as $i) if (!isset($aGroupeDe[$i])) $aRacines[] = $fnCreer([$i]);
        // Arbre des groupes : un groupe dépend du groupe du plus âgé des parents de sa tête.
        $aParentDe = [];
        foreach ($aGroupes as $n => $g) {
            $sTete = $g['membres'][0];
            if (!$aParents[$sTete]) continue;
            $nP = $aGroupeDe[$fnPremier($aParents[$sTete])] ?? null;
            if ($nP !== null && $nP !== $n) { $aGroupes[$nP]['enfants'][] = $n; $aParentDe[$n] = $nP; }
        }
        foreach (array_keys($aGroupes) as $n) if (!isset($aParentDe[$n]) && !in_array($n, $aRacines, true)) $aRacines[] = $n;
        // Lignées : une par racine.
        $aLigneeDeGroupe = [];
        $fnMarquer = function (int $n, int $nL) use (&$fnMarquer, &$aGroupes, &$aLigneeDeGroupe): void {
            $aLigneeDeGroupe[$n] = $nL;
            foreach ($aGroupes[$n]['enfants'] as $e) $fnMarquer($e, $nL);
        };
        foreach ($aRacines as $k => $n) $fnMarquer($n, $k);

        $aLignees = []; $aCleDe = [];
        foreach ($aRacines as $k => $n) {
            $aRacine = $aGroupes[$n]['membres'];
            $aCle = $aRacine; sort($aCle, SORT_STRING);
            $sCle = implode('+', $aCle);
            $aMembres = array_values(array_filter($aIds, fn($i) => $aLigneeDeGroupe[$aGroupeDe[$i]] === $k));
            foreach ($aMembres as $i) $aCleDe[$i] = $sCle;
            // Nom : le nom de famille le plus porté par ceux qui ont leurs parents dans la lignée.
            $aCompte = [];
            foreach ($aMembres as $i) {
                if (!$aParents[$i]) continue;
                $s = mb_strtoupper(trim($aNom[$i]['nom']));
                if ($s !== '') $aCompte[$s] = ($aCompte[$s] ?? 0) + 1;
            }
            arsort($aCompte);
            $sBrut = array_key_first($aCompte) ?? ($aNom[$aRacine[0]]['nom'] ?: $aNom[$aRacine[0]]['prenom']);
            $aLignees[$sCle] = ['cle' => $sCle, 'racine' => $aRacine, 'membres' => $aMembres,
                'nom' => mb_convert_case(mb_strtolower($sBrut), MB_CASE_TITLE)];
        }
        return ['lignees' => $aLignees, 'cleDe' => $aCleDe];
    }
}

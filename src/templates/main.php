<?php

declare(strict_types=1);

use OCP\Util;

// $l et $_ sont fournis par le moteur de gabarits de Nextcloud.
Util::addStyle('lignees', 'family-chart');
Util::addStyle('lignees', 'lignees');
Util::addScript('lignees', 'vendor/d3.min');
Util::addScript('lignees', 'vendor/family-chart.min');
Util::addScript('lignees', 'vue-complete');
Util::addScript('lignees', 'lignees');
?>
<div id="lignees" data-version="<?php p($_['appVersion']); ?>">
  <div id="lg-arbre" class="f3"></div>

  <header class="lg-entete">
    <div class="lg-titre lg-panneau">
      <div class="lg-logo"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M12 8c-3.5 0-6-2-6-4.5M12 12c3.5 0 6-2 6-4.5M12 16c-3 0-5-1.5-5-3.5M8 21h8"/></svg></div>
      <div class="lg-titre-texte">
        <select id="lg-choix-arbre" class="lg-serif" title="Changer d'arbre"></select>
        <div class="lg-stats" id="lg-stats">Chargement…</div>
        <select id="lg-choix-lignee" class="lg-choix-lignee" title="Changer de lignée" hidden></select>
      </div>
    </div>
    <div class="lg-outils">
      <div class="lg-recherche">
        <label class="lg-panneau"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5" stroke-linecap="round"/></svg>
          <input id="lg-recherche" type="search" placeholder="Rechercher un membre…" autocomplete="off"></label>
        <div class="lg-resultats lg-panneau" id="lg-resultats"></div>
      </div>
      <button class="lg-bouton lg-panneau" id="lg-maison" title="Revenir à moi">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg></button>
      <button class="lg-bouton lg-panneau" id="lg-vue" title="Changer de vue">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="8.5" y="16" width="7" height="5" rx="1"/><path d="M6.5 8v4h11V8M12 12v4"/></svg>
        <span class="lg-texte">Vue centrée</span></button>
      <button class="lg-bouton lg-panneau" id="lg-focus" title="Mettre en valeur la lignée directe de la personne au centre">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/></svg>
        <span class="lg-texte">Focus lignée</span></button>
      <button class="lg-bouton lg-plein" id="lg-nouveau"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span class="lg-texte">Nouveau membre</span></button>
      <div class="lg-menu-conteneur">
        <button class="lg-bouton lg-panneau" id="lg-outils" title="Options">⋮</button>
        <div class="lg-menu lg-panneau" id="lg-menu">
          <button id="lg-theme"><span>Changer de thème</span><span class="lg-pastille-theme" id="lg-nom-theme">Parchemin</span></button>
          <button id="lg-nouvel-arbre-btn"><span>Nouvel arbre…</span></button>
          <button id="lg-partage-btn"><span>Partager cet arbre…</span></button>
          <button id="lg-import-ged"><span>Importer un fichier GEDCOM</span></button>
          <button id="lg-export-ged"><span>Exporter en GEDCOM</span></button>
          <button id="lg-moi"><span>Revenir à moi</span></button>
        </div>
      </div>
    </div>
  </header>

  <div class="lg-zoom lg-panneau">
    <button id="lg-zoom-plus" title="Zoomer">+</button><span class="lg-niveau" id="lg-niveau">100 %</span><button id="lg-zoom-moins" title="Dézoomer">−</button>
    <span class="lg-sep"></span><button class="lg-large" id="lg-recentrer">⤢ Recentrer</button>
  </div>

  <aside class="lg-panneau lg-fiche" id="lg-fiche">
    <div class="lg-fiche-entete">
      <div class="lg-medaillon" id="lg-fiche-medaillon"></div>
      <div class="lg-fiche-nom"><span class="lg-badge" id="lg-fiche-generation"></span><h2 class="lg-serif" id="lg-fiche-nom"></h2>
        <button class="lg-voir-lignee" id="lg-voir-lignee" hidden></button></div>
      <button class="lg-fermer" id="lg-fermer" title="Fermer">✕</button>
    </div>
    <div class="lg-onglets">
      <button data-onglet="identite" class="lg-actif">Identité</button><button data-onglet="liens">Liens</button><button data-onglet="actions">Actions</button>
    </div>
    <div class="lg-contenu">
      <form class="lg-champs" id="lg-onglet-identite">
        <div class="lg-ligne2"><div><label>Prénom</label><input name="given_name" required></div><div><label>Nom de famille</label><input name="surname"></div></div>
        <div class="lg-ligne2"><div><label>Genre</label><select name="gender"><option value="male">Homme</option><option value="female">Femme</option><option value="">Non précisé</option></select></div>
          <div><label>Nom de naissance</label><input name="birth_surname" placeholder="si différent"></div></div>
        <div class="lg-ligne2"><div><label>Naissance</label><input name="birth_date" type="date"></div><div><label>Lieu de naissance</label><input name="birth_place"></div></div>
        <div class="lg-ligne2"><div><label>Décès</label><input name="death_date" type="date"></div><div><label>Lieu de décès</label><input name="death_place"></div></div>
        <div><label>Profession</label><input name="occupation"></div>
        <div><label>Notes biographiques</label><textarea name="notes"></textarea></div>
        <button class="lg-enregistrer" type="submit">Enregistrer les modifications</button>
      </form>
      <div class="lg-groupe-liens" id="lg-onglet-liens" hidden></div>
      <div class="lg-actions" id="lg-onglet-actions" hidden>
        <button data-action="centrer">Placer au centre de l'arbre</button>
        <button data-action="parent">Ajouter un parent</button>
        <button data-action="conjoint">Ajouter un conjoint</button>
        <button data-action="enfant">Ajouter un enfant</button>
        <button data-action="relier">Relier à une personne existante</button>
        <button data-action="pont">Relier à la même personne dans un autre arbre</button>
        <label class="lg-bouton-fichier">Changer la photo<input type="file" accept="image/*" id="lg-photo" hidden></label>
        <button data-action="supprimer" class="lg-danger">Supprimer cette personne</button>
      </div>
    </div>
  </aside>

  <dialog id="lg-dialogue" class="lg-panneau">
    <form method="dialog" class="lg-champs" id="lg-form-nouveau">
      <h3 class="lg-serif" id="lg-dialogue-titre">Nouveau membre</h3>
      <div class="lg-ligne2"><div><label>Prénom</label><input name="given_name" required></div><div><label>Nom de famille</label><input name="surname"></div></div>
      <div class="lg-ligne2"><div><label>Genre</label><select name="gender"><option value="male">Homme</option><option value="female">Femme</option><option value="">Non précisé</option></select></div>
        <div><label>Naissance</label><input name="birth_date" type="date"></div></div>
      <div class="lg-dialogue-boutons"><button value="annuler" formnovalidate>Annuler</button><button value="ok" class="lg-enregistrer">Ajouter</button></div>
    </form>
  </dialog>
  <dialog id="lg-relier" class="lg-panneau">
    <form method="dialog" class="lg-champs" id="lg-form-relier">
      <h3 class="lg-serif" id="lg-relier-titre">Relier à une personne existante</h3>
      <div><label>Type de lien</label>
        <select name="type"><option value="parent">… est son parent</option><option value="enfant">… est son enfant</option><option value="conjoint">… est son conjoint</option></select></div>
      <div><label>Personne</label><select name="personne" required></select></div>
      <p class="lg-aide" id="lg-relier-aide"></p>
      <div class="lg-dialogue-boutons"><button value="annuler" formnovalidate>Annuler</button><button value="ok" class="lg-enregistrer">Relier</button></div>
    </form>
  </dialog>
  <dialog id="lg-nouvel-arbre" class="lg-panneau">
    <form method="dialog" class="lg-champs" id="lg-form-nouvel-arbre">
      <h3 class="lg-serif">Nouvel arbre</h3>
      <div><label>Nom de l'arbre</label><input name="nom" required placeholder="ex. Famille Angerly"></div>
      <div><label>Partager en modification avec</label><div class="lg-cases" id="lg-nouvel-arbre-groupes"></div></div>
      <p class="lg-aide">Pour relier ensuite une personne de cet arbre à la même personne d'un autre arbre : sa fiche → Actions → « Relier à la même personne dans un autre arbre ».</p>
      <div class="lg-dialogue-boutons"><button value="annuler" formnovalidate>Annuler</button><button value="ok" class="lg-enregistrer">Créer l'arbre</button></div>
    </form>
  </dialog>
  <dialog id="lg-partage" class="lg-panneau">
    <form method="dialog" class="lg-champs" id="lg-form-partage">
      <h3 class="lg-serif" id="lg-partage-titre">Partager cet arbre</h3>
      <div class="lg-liste-partages" id="lg-partages"></div>
      <div class="lg-ligne2"><div><label>Groupe</label><select name="groupe"></select></div>
        <div><label>Droits</label><select name="droit"><option value="edit">Modifier</option><option value="view">Voir seulement</option></select></div></div>
      <div class="lg-dialogue-boutons"><button value="annuler" formnovalidate>Fermer</button><button type="button" class="lg-enregistrer" id="lg-partage-ajouter">Partager</button></div>
    </form>
  </dialog>
  <dialog id="lg-pont" class="lg-panneau">
    <form method="dialog" class="lg-champs" id="lg-form-pont">
      <h3 class="lg-serif" id="lg-pont-titre">Relier à un autre arbre</h3>
      <div><label>Autre arbre</label><select name="arbre" required></select></div>
      <div><label>La même personne dans cet arbre</label><select name="personne" required></select></div>
      <p class="lg-aide">Les deux fiches restent séparées ; le pont permet de passer d'un arbre à l'autre (« Voir sa lignée »).</p>
      <div class="lg-dialogue-boutons"><button value="annuler" formnovalidate>Annuler</button><button value="ok" class="lg-enregistrer">Relier</button></div>
    </form>
  </dialog>
  <dialog id="lg-import" class="lg-panneau">
    <form method="dialog" class="lg-champs" id="lg-form-import">
      <h3 class="lg-serif">Importer un fichier GEDCOM</h3>
      <div><label>Fichier (.ged, .gedcom ou .gdz)</label><input type="file" name="fichier" accept=".ged,.gedcom,.gdz,.zip" required></div>
      <div><label>Destination</label>
        <select name="mode"><option value="new">Créer un nouvel arbre</option><option value="update">Mettre à jour l'arbre affiché</option></select></div>
      <div id="lg-import-nom"><label>Nom du nouvel arbre</label><input name="nom" placeholder="ex. Famille Fernandes José"></div>
      <p class="lg-aide" id="lg-import-aide">Un nouvel arbre est créé à partir du fichier ; l'arbre actuel n'est pas modifié.</p>
      <div class="lg-apercu" id="lg-import-apercu" hidden></div>
      <div class="lg-dialogue-boutons"><button value="annuler" formnovalidate>Annuler</button><button type="button" class="lg-enregistrer" id="lg-import-action">Voir l'aperçu</button></div>
    </form>
  </dialog>
  <div class="lg-toast lg-panneau" id="lg-toast"></div>
</div>

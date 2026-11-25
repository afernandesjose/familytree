<?php

declare(strict_types=1);

use OCP\Util;

// $l et $_ sont fournis par le moteur de gabarits de Nextcloud.
Util::addStyle('lignees', 'family-chart');
Util::addStyle('lignees', 'lignees');
Util::addScript('lignees', 'vendor/d3.min');
Util::addScript('lignees', 'vendor/family-chart.min');
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
      </div>
    </div>
    <div class="lg-outils">
      <div class="lg-recherche">
        <label class="lg-panneau"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5" stroke-linecap="round"/></svg>
          <input id="lg-recherche" type="search" placeholder="Rechercher un membre…" autocomplete="off"></label>
        <div class="lg-resultats lg-panneau" id="lg-resultats"></div>
      </div>
      <button class="lg-bouton lg-panneau" id="lg-focus" title="Mettre en valeur la lignée directe de la personne au centre">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/></svg>
        <span class="lg-texte">Focus lignée</span></button>
      <button class="lg-bouton lg-plein" id="lg-nouveau"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span class="lg-texte">Nouveau membre</span></button>
      <div class="lg-menu-conteneur">
        <button class="lg-bouton lg-panneau" id="lg-outils" title="Options">⋮</button>
        <div class="lg-menu lg-panneau" id="lg-menu">
          <button id="lg-theme"><span>Changer de thème</span><span class="lg-pastille-theme" id="lg-nom-theme">Parchemin</span></button>
          <button id="lg-export-ged"><span>Exporter en GEDCOM</span></button>
          <button id="lg-moi"><span>Revenir à la personne de départ</span></button>
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
      <div class="lg-fiche-nom"><span class="lg-badge" id="lg-fiche-generation"></span><h2 class="lg-serif" id="lg-fiche-nom"></h2></div>
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
  <div class="lg-toast lg-panneau" id="lg-toast"></div>
</div>

/**
 * Lignées — placement « toute la famille ».
 *
 * Règles :
 *  - chaque personne apparaît une seule fois ;
 *  - une personne ayant des parents est placée sous eux ; un conjoint sans parents dans l'arbre est placé à côté d'elle ;
 *  - les enfants sont centrés sous leur couple, triés par date de naissance ;
 *  - chaque lignée sans ascendant connu forme un bloc ; les blocs reliés par un mariage sont posés côte à côte,
 *    et les personnes mariées d'un bloc à l'autre sont rangées du côté où se trouve leur conjoint ;
 *  - la hauteur dépend de la génération (conjoints alignés), donc deux lignées alliées restent de niveau.
 *
 * Entrée : personnes [{id, naissance}] et liens [{type: 'parent'|'partner', de, vers}] (parent : de = parent, vers = enfant).
 * Sortie : { cartes: Map(id → {x, y, gen}), couples: [{a, b}], familles: [{parents: [...], enfants: [...]}], largeur, hauteur }.
 */
(function () {
  'use strict';

  function calculer(personnes, liens, options = {}) {
    const L = options.largeurCarte ?? 210, H = options.hauteurCarte ?? 112;
    const ECART_FRERES = options.ecartFreres ?? 36, ECART_CONJOINTS = options.ecartConjoints ?? 56;
    const ECART_LIGNEES = options.ecartLignees ?? 96, HAUTEUR_RANG = options.hauteurRang ?? H + 96;

    const ids = personnes.map(p => String(p.id));
    const existe = new Set(ids);
    const naissance = new Map(personnes.map(p => [String(p.id), p.naissance || '9999']));
    const genre = new Map(personnes.map(p => [String(p.id), p.genre || '']));
    const parents = new Map(ids.map(i => [i, []])), enfants = new Map(ids.map(i => [i, []])), conjoints = new Map(ids.map(i => [i, []]));
    for (const l of liens) {
      const a = String(l.de), b = String(l.vers);
      if (!existe.has(a) || !existe.has(b) || a === b) continue;
      if (l.type === 'parent') { if (!parents.get(b).includes(a)) { parents.get(b).push(a); enfants.get(a).push(b); } }
      else if (l.type === 'partner') { if (!conjoints.get(a).includes(b)) { conjoints.get(a).push(b); conjoints.get(b).push(a); } }
    }
    const parAge = (x, y) => naissance.get(x).localeCompare(naissance.get(y)) || ids.indexOf(x) - ids.indexOf(y);


    // 2. Rattachement : un conjoint sans parents se place à côté d'un conjoint qui en a.
    const rattache = new Map(); // conjoint sans parents → personne de référence
    for (const i of ids) {
      if (parents.get(i).length) continue;
      const avecParents = conjoints.get(i).filter(c => parents.get(c).length);
      if (avecParents.length) rattache.set(i, avecParents.sort(parAge)[0]);
    }
    // Groupe affiché sur une ligne : une personne et ses conjoints rattachés.
    const groupeDe = new Map();
    const groupes = [];
    function creerGroupe(membres) {
      const g = { membres, enfants: [], lignee: null };
      for (const m of membres) groupeDe.set(m, g);
      groupes.push(g);
      return g;
    }
    // Racines : personnes sans parents ni rattachement ; un couple de racines forme un seul groupe.
    const racines = [];
    for (const i of [...ids].sort(parAge)) {
      if (groupeDe.has(i) || parents.get(i).length || rattache.has(i)) continue;
      const membres = [i, ...conjoints.get(i).filter(c => !parents.get(c).length && !rattache.has(c) && !groupeDe.has(c))];
      membres.sort((a, b) => (genre.get(a) === 'F') - (genre.get(b) === 'F'));
      racines.push(creerGroupe(membres));
    }
    for (const i of ids) {
      if (groupeDe.has(i) || !parents.get(i).length) continue;
      creerGroupe([i, ...conjoints.get(i).filter(c => rattache.get(c) === i)]);
    }
    for (const i of ids) if (!groupeDe.has(i)) racines.push(creerGroupe([i])); // cas restants (rattachements circulaires)

    // 3. Arbre des groupes : un enfant dépend du groupe de son premier parent (le plus âgé).
    const parentDeGroupe = new Map();
    for (const g of groupes) {
      const tete = g.membres[0];
      if (!parents.get(tete).length) continue;
      const pg = groupeDe.get([...parents.get(tete)].sort(parAge)[0]);
      if (pg && pg !== g) { pg.enfants.push(g); parentDeGroupe.set(g, pg); }
    }
    // Groupes sans parent de groupe et non racine : rattrapés comme racines.
    for (const g of groupes) if (!parentDeGroupe.has(g) && !racines.includes(g)) racines.push(g);

    // 4. Lignées (une par racine) et mariages entre lignées.
    function marquer(g, lignee) { g.lignee = lignee; g.enfants.forEach(e => marquer(e, lignee)); }
    racines.forEach((r, n) => marquer(r, n));
    const ligneeDe = i => groupeDe.get(i).lignee;
    const alliances = new Map(); // lignée → Set(lignées alliées)
    for (const i of ids) for (const c of conjoints.get(i)) {
      const a = ligneeDe(i), b = ligneeDe(c);
      if (a === b) continue;
      if (!alliances.has(a)) alliances.set(a, new Set());
      alliances.get(a).add(b);
    }
    // Ordre des lignées : en chaîne à partir de la lignée de la personne de référence (ou de la plus grande).
    const taille = new Map(racines.map((r, n) => [n, 0]));
    for (const g of groupes) taille.set(g.lignee, taille.get(g.lignee) + g.membres.length);
    const reference = options.reference && existe.has(String(options.reference)) ? ligneeDe(String(options.reference)) : null;
    const ordre = [], vues = new Set();
    const restantes = () => racines.map((r, n) => n).filter(n => !vues.has(n));
    while (restantes().length) {
      let n = ordre.length === 0 && reference !== null ? reference : restantes().sort((a, b) => taille.get(b) - taille.get(a))[0];
      // Parcours en chaîne : on ajoute à droite les lignées alliées non encore placées.
      const pile = [n];
      while (pile.length) {
        const x = pile.shift();
        if (vues.has(x)) continue;
        vues.add(x); ordre.push(x);
        const suivantes = [...(alliances.get(x) || [])].filter(y => !vues.has(y)).sort((a, b) => taille.get(b) - taille.get(a));
        pile.unshift(...suivantes);
      }
    }
    const rangLignee = new Map(ordre.map((n, k) => [n, k]));

    // Générations : calculées dans chaque lignée (parents + 1, conjoints de la même lignée alignés),
    // puis chaque lignée alliée est décalée pour que les conjoints d'une lignée à l'autre soient au même rang.
    const gen = new Map(ids.map(i => [i, 0]));
    for (let tour = 0, change = true; change && tour < 80; tour++) {
      change = false;
      for (const i of ids) {
        let v = gen.get(i);
        for (const p of parents.get(i)) if (ligneeDe(p) === ligneeDe(i)) v = Math.max(v, gen.get(p) + 1);
        for (const c of conjoints.get(i)) if (ligneeDe(c) === ligneeDe(i)) v = Math.max(v, gen.get(c));
        if (v !== gen.get(i)) { gen.set(i, v); change = true; }
      }
    }
    const decalage = new Map([[ordre[0], 0]]);
    for (let tour = 0; tour < ordre.length; tour++) for (const i of ids) for (const c of conjoints.get(i)) {
      const a = ligneeDe(i), b = ligneeDe(c);
      if (a !== b && decalage.has(a) && !decalage.has(b)) decalage.set(b, gen.get(i) + decalage.get(a) - gen.get(c));
    }
    for (const n of ordre) if (!decalage.has(n)) decalage.set(n, 0);
    for (const i of ids) gen.set(i, gen.get(i) + decalage.get(ligneeDe(i)));
    const plusHaut = Math.min(...gen.values());
    for (const i of ids) gen.set(i, gen.get(i) - plusHaut);

    // 5. Côté préféré d'un bloc : vers la lignée alliée (−1 gauche, +1 droite, 0 aucun).
    const cote = new Map();
    function coteBloc(g) {
      if (cote.has(g)) return cote.get(g);
      let s = 0;
      for (const m of g.membres) for (const c of conjoints.get(m)) {
        const l = ligneeDe(c);
        if (l !== g.lignee) s += Math.sign(rangLignee.get(l) - rangLignee.get(g.lignee));
      }
      for (const e of g.enfants) s += coteBloc(e);
      const v = Math.sign(s); cote.set(g, v); return v;
    }
    const coteExterieur = m => Math.sign(conjoints.get(m).reduce((s, c) => ligneeDe(c) === ligneeDe(m) ? s : s + Math.sign(rangLignee.get(ligneeDe(c)) - rangLignee.get(ligneeDe(m))), 0));
    for (const g of groupes) {
      // Ordre dans la ligne : avec plusieurs conjoints, la personne est au milieu ;
      // sinon l'homme à gauche, sauf si un mariage avec une autre lignée impose le côté.
      if (g.membres.length > 2 && !racines.includes(g)) {
        const [tete, ...autres] = g.membres;
        const moitie = Math.ceil(autres.length / 2);
        g.membres = [...autres.slice(0, moitie), tete, ...autres.slice(moitie)];
      } else if (g.membres.length === 2) {
        const [x, y] = g.membres, cx = coteExterieur(x), cy = coteExterieur(y);
        if (cx > 0 || cy < 0) g.membres = [y, x];
        else if (!cx && !cy && genre.get(x) === 'F' && genre.get(y) !== 'F') g.membres = [y, x];
      }
      // Enfants regroupés par couple (de gauche à droite), puis côté de l'alliance, puis âge.
      const rangCouple = e => {
        const ps = parents.get(e.membres.find(m => parents.get(m).length) ?? e.membres[0]);
        const pos = ps.map(p => g.membres.indexOf(p)).filter(k => k >= 0);
        return pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : 0;
      };
      g.enfants.sort((a, b) => rangCouple(a) - rangCouple(b) || coteBloc(a) - coteBloc(b) || parAge(a.membres[0], b.membres[0]));
    }

    // 6. Largeurs puis positions (bloc = ligne du groupe + blocs des enfants dessous).
    const largeurLigne = g => g.membres.length * L + (g.membres.length - 1) * ECART_CONJOINTS;
    const largeur = new Map();
    function mesurer(g) {
      const enfantsL = g.enfants.reduce((s, e) => s + mesurer(e), 0) + Math.max(0, g.enfants.length - 1) * ECART_FRERES;
      const v = Math.max(largeurLigne(g), enfantsL); largeur.set(g, v); return v;
    }
    const cartes = new Map();
    function placer(g, x0) {
      const W = largeur.get(g), lw = largeurLigne(g);
      const enfantsL = g.enfants.reduce((s, e) => s + largeur.get(e), 0) + Math.max(0, g.enfants.length - 1) * ECART_FRERES;
      let x = x0 + (W - enfantsL) / 2;
      const centres = [];
      for (const e of g.enfants) { placer(e, x); centres.push(cartes.get(e.membres.find(m => groupeDe.get(m) === e && parents.get(m).length) ?? e.membres[0]).x); x += largeur.get(e) + ECART_FRERES; }
      // La ligne est centrée au-dessus des enfants, sans sortir de son bloc.
      let centre = centres.length ? (Math.min(...centres) + Math.max(...centres)) / 2 : x0 + W / 2;
      centre = Math.min(Math.max(centre, x0 + lw / 2), x0 + W - lw / 2);
      g.membres.forEach((m, k) => {
        cartes.set(m, { x: centre - lw / 2 + L / 2 + k * (L + ECART_CONJOINTS), y: gen.get(m) * HAUTEUR_RANG + H / 2, gen: gen.get(m) + 1 });
      });
    }
    let x = 0;
    for (const n of ordre) { const r = racines[n]; mesurer(r); placer(r, x); x += largeur.get(r) + ECART_LIGNEES; }

    // 7. Couples et familles (pour le tracé).
    const couples = [], vusCouples = new Set();
    for (const i of ids) for (const c of conjoints.get(i)) {
      const k = [i, c].sort().join('+'); if (vusCouples.has(k)) continue; vusCouples.add(k);
      couples.push({ a: cartes.get(i).x <= cartes.get(c).x ? i : c, b: cartes.get(i).x <= cartes.get(c).x ? c : i });
    }
    const familles = new Map();
    for (const i of ids) {
      if (!parents.get(i).length) continue;
      const k = [...parents.get(i)].sort().join('+');
      if (!familles.has(k)) familles.set(k, { parents: [...parents.get(i)].sort((a, b) => cartes.get(a).x - cartes.get(b).x), enfants: [] });
      familles.get(k).enfants.push(i);
    }
    const toutes = [...cartes.values()];
    return {
      cartes, couples, familles: [...familles.values()],
      largeur: Math.max(...toutes.map(c => c.x)) + L / 2, hauteur: Math.max(...toutes.map(c => c.y)) + H / 2,
      generations: Math.max(...toutes.map(c => c.gen)),
    };
  }

  window.LigneesVueComplete = { calculer };
})();

/**
 * Lignées — interface de l'arbre généalogique.
 * Placement : bibliothèque family-chart (couples côte à côte, enfants sous leurs parents).
 * Données : API existante de l'application (/apps/lignees/api/...).
 */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const racine = () => document.getElementById('lignees');
  const echapper = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ROMAINS = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  const romain = n => ROMAINS.reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const STOCKAGE = 'lignees:preferences';

  // ---- Dates : l'API contient des dates ISO (AAAA-MM-JJ) et parfois saisies à la main (JJ/MM/AAAA)
  function versIso(valeur) {
    const v = String(valeur || '').trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) return v;
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return '';
  }
  const annee = v => (/(\d{4})/.exec(versIso(v) || v || '') || [])[1] || '';
  function dateLongue(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(versIso(v));
    return m ? `${+m[3]} ${MOIS[m[2] - 1]} ${m[1]}` : annee(v);
  }

  // ---- Préférences locales (thème, dernière personne affichée) : simple confort, jamais indispensable
  function preferences() { try { return JSON.parse(localStorage.getItem(STOCKAGE)) || {}; } catch (e) { return {}; } }
  function retenir(cle, valeur) { try { const p = preferences(); p[cle] = valeur; localStorage.setItem(STOCKAGE, JSON.stringify(p)); } catch (e) { /* stockage indisponible */ } }

  // ---- API
  async function api(methode, chemin, corps) {
    const options = { method: methode, headers: { requesttoken: OC.requestToken, Accept: 'application/json' } };
    if (corps instanceof FormData) options.body = corps;
    else if (corps !== undefined) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(corps); }
    const reponse = await fetch(OC.generateUrl('/apps/lignees/api' + chemin), options);
    const json = await reponse.json().catch(() => ({}));
    if (!reponse.ok) throw new Error(json.error || json.message || `Erreur ${reponse.status}`);
    return json;
  }

  // ---- État
  let arbres = [], arbre = null, personnes = [], liens = [], donnees = [], graphique = null;
  let peutModifier = false, focus = false, choisi = null, personneDepart = null;
  // Deux vues : « famille » (tout l'arbre, placement maison) et « centree » (family-chart autour d'une personne).
  let mode = preferences().vue === 'centree' ? 'centree' : 'famille';
  let disposition = null, famille = null; // famille = { conteneur, monde, zoom, selection }
  const parId = id => donnees.find(d => d.id === String(id));
  const personne = id => personnes.find(p => String(p.id) === String(id));

  function toast(message) {
    const t = $('#lg-toast'); t.textContent = message; t.classList.add('lg-visible');
    clearTimeout(toast.minuteur); toast.minuteur = setTimeout(() => t.classList.remove('lg-visible'), 2600);
  }
  function erreur(e) { console.error(e); toast('Erreur : ' + (e.message || e)); }

  // ---- Conversion API → family-chart
  function construireDonnees() {
    const map = new Map(personnes.map(p => [String(p.id), {
      id: String(p.id),
      data: {
        gender: p.gender === 'female' ? 'F' : 'M',
        'first name': p.given_name || '', 'last name': p.surname || '',
        birthday: versIso(p.birth_date) || p.birth_date || '', death: versIso(p.death_date) || p.death_date || '',
        place: p.birth_place || '', occupation: (p.occupation || '').trim(),
        avatar: p.photo_url ? OC.generateUrl(`/apps/lignees/api/people/${p.id}/portrait`) + `?v=${p.updated_at || ''}` : '',
        vivant: p.is_living !== false && p.is_living !== 0 && p.is_living !== '0',
      },
      rels: { parents: [], spouses: [], children: [] },
    }]));
    for (const l of liens) {
      const a = map.get(String(l.person1_id)), b = map.get(String(l.person2_id));
      if (!a || !b) continue;
      if (l.type === 'parent') {
        if (!b.rels.parents.includes(a.id)) b.rels.parents.push(a.id);
        if (!a.rels.children.includes(b.id)) a.rels.children.push(b.id);
      } else if (l.type === 'partner') {
        if (!a.rels.spouses.includes(b.id)) a.rels.spouses.push(b.id);
        if (!b.rels.spouses.includes(a.id)) b.rels.spouses.push(a.id);
      }
    }
    donnees = [...map.values()];
    calculerDisposition();
  }

  // Placement « toute la famille » (js/vue-complete.js) ; il fournit aussi les générations des deux vues.
  function calculerDisposition() {
    disposition = donnees.length ? LigneesVueComplete.calculer(
      donnees.map(d => ({ id: d.id, naissance: d.data.birthday, genre: d.data.gender })),
      liens.map(l => ({ type: l.type, de: l.person1_id, vers: l.person2_id })),
      { reference: personneMoi() }) : null;
    donnees.forEach(d => { d.data._generation = disposition?.cartes.get(d.id)?.gen || 1; });
  }
  // Personne au centre (vue centrée) ou sélectionnée (vue famille).
  function idCentre() { return mode === 'centree' ? graphique?.store.getMainId() : famille?.selection; }

  function lignee(id) {
    const vus = new Set([id]);
    const monter = i => parId(i)?.rels.parents.forEach(p => { if (!vus.has(p)) { vus.add(p); monter(p); } });
    const descendre = i => parId(i)?.rels.children.forEach(c => { if (!vus.has(c)) { vus.add(c); descendre(c); } });
    monter(id); descendre(id);
    return vus;
  }
  const initiales = p => (((p['first name'] || '')[0] || '') + ((p['last name'] || '')[0] || '')).toUpperCase();
  const medaillon = p => p.avatar ? `<img src="${echapper(p.avatar)}" alt="">` : echapper(initiales(p));

  function carte(d) {
    const p = d.data.data, ne = annee(p.birthday), mort = annee(p.death);
    const dates = ne && mort ? `${ne} – ${mort}` : ne ? `Né${p.gender === 'F' ? 'e' : ''} en ${ne}` : 'Dates inconnues';
    const estompee = focus && idCentre() && !lignee(idCentre()).has(d.data.id);
    return `<div class="lg-carte lg-${p.gender}${estompee ? ' lg-estompee' : ''}${mort || !p.vivant ? ' lg-decede' : ''}">
      <span class="lg-generation">${romain(p._generation)}</span>
      <div class="lg-haut"><div class="lg-medaillon">${medaillon(p)}</div>
        <div class="lg-identite"><div class="lg-prenom">${echapper(p['first name'])}</div><div class="lg-nom">${echapper(p['last name'])}</div></div></div>
      <div class="lg-bas"><span>${echapper(p.occupation || (p.place || '').split(',')[0])}</span><span>${dates}</span></div>
    </div>`;
  }

  function mettreAJourStats() {
    if (!donnees.length) { $('#lg-stats').textContent = 'Arbre vide'; return; }
    const ans = donnees.map(d => annee(d.data.birthday)).filter(Boolean).sort();
    const gens = Math.max(...donnees.map(d => d.data._generation));
    const centre = parId(idCentre());
    $('#lg-stats').textContent = `${donnees.length} membres • ${gens} générations${ans.length ? ' • Origine ' + ans[0] : ''}${peutModifier ? '' : ' • lecture seule'}`
      + (centre ? ` • ${mode === 'centree' ? 'Centré sur' : 'Sélection :'} ${centre.data['first name']}` : '');
  }
  // Personne qui correspond au compte connecté (même prénom, une seule correspondance), sinon la personne de départ de l'arbre.
  function personneMoi() {
    const prenom = (OC.getCurrentUser?.().displayName || '').trim().split(/\s+/)[0].toLowerCase();
    const trouves = prenom ? donnees.filter(d => (d.data['first name'] || '').trim().split(/\s+/)[0].toLowerCase() === prenom) : [];
    if (trouves.length === 1) return trouves[0].id;
    return parId(personneDepart) ? String(personneDepart) : donnees[0]?.id;
  }
  function mettreAJourZoom() {
    const cible = mode === 'centree' ? graphique?.svg : famille?.conteneur;
    if (cible) $('#lg-niveau').textContent = Math.round(d3.zoomTransform(cible).k * 100) + ' %';
  }
  function estomperLiens() {
    if (mode === 'famille') return estomperFamille();
    if (!graphique) return;
    const ids = lignee(graphique.store.getMainId());
    d3.select(graphique.svg).selectAll('path.link').classed('lg-estompe', function (l) {
      if (!focus || !l) return false;
      const bouts = [l.source, l.target].flat().map(x => x?.data?.id).filter(Boolean);
      return bouts.some(id => !ids.has(id));
    });
  }

  // ---- Vue « toute la famille »
  const LC = 210, HC = 112;
  function dessinerFamille(idCentre, transformation) {
    const conteneur = $('#lg-arbre');
    conteneur.innerHTML = '<div class="lg-monde"><svg class="lg-liens" xmlns="http://www.w3.org/2000/svg"></svg></div>';
    const monde = conteneur.firstChild, svg = monde.firstChild, c = id => disposition.cartes.get(String(id));
    let traces = '';
    const anneaux = (x, y) => `<g class="lg-anneaux"><circle cx="${x - 4}" cy="${y}" r="6"/><circle cx="${x + 4}" cy="${y}" r="6"/></g>`;
    for (const { a, b } of disposition.couples) {
      const A = c(a), B = c(b), ids = `${a} ${b}`;
      if (A.y === B.y) traces += `<g data-ids="${ids}"><path class="lg-lien" d="M${A.x + LC / 2},${A.y} H${B.x - LC / 2}"/>${anneaux((A.x + LC / 2 + B.x - LC / 2) / 2, A.y)}</g>`;
      else traces += `<g data-ids="${ids}"><path class="lg-lien" d="M${A.x + LC / 2},${A.y} H${(A.x + B.x) / 2} V${B.y} H${B.x - LC / 2}"/></g>`;
    }
    for (const f of disposition.familles) {
      const ps = f.parents.map(c), es = f.enfants.map(c);
      const couple = ps.length === 2 && ps[0].y === ps[1].y;
      const ox = couple ? (ps[0].x + LC / 2 + ps[1].x - LC / 2) / 2 : ps[0].x, oy = couple ? ps[0].y + 7 : ps[0].y + HC / 2;
      const yBarre = Math.min(...es.map(e => e.y)) - HC / 2 - 34;
      // Un groupe par enfant pour pouvoir estomper précisément en « focus lignée ».
      traces += `<g data-ids="${f.parents.join(' ')}"><path class="lg-lien" d="M${ox},${oy} V${yBarre}"/></g>`;
      f.enfants.forEach((e, k) => {
        const E = es[k];
        traces += `<g data-ids="${f.parents.join(' ')} ${e}"><path class="lg-lien" d="M${ox},${yBarre} H${E.x} V${E.y - HC / 2}"/></g>`;
      });
    }
    svg.innerHTML = traces;
    for (const d of donnees) {
      const q = c(d.id), el = document.createElement('div');
      el.className = 'lg-place'; el.dataset.id = d.id;
      el.style.left = (q.x - LC / 2) + 'px'; el.style.top = (q.y - HC / 2) + 'px';
      el.innerHTML = carte({ data: d });
      monde.appendChild(el);
    }
    const zoom = d3.zoom().scaleExtent([0.12, 2.5])
      .on('zoom', e => { monde.style.transform = `translate(${e.transform.x}px,${e.transform.y}px) scale(${e.transform.k})`; mettreAJourZoom(); });
    const sel = d3.select(conteneur).call(zoom).on('dblclick.zoom', null);
    famille = { conteneur, monde, zoom, selection: parId(idCentre) ? String(idCentre) : personneMoi() };
    conteneur.onclick = e => { const el = e.target.closest('.lg-place'); if (el) { selectionner(el.dataset.id); ouvrirFiche(el.dataset.id); } };
    marquerSelection();
    if (transformation) sel.call(zoom.transform, transformation);
    else if (window.innerWidth < 760) centrerFamille(famille.selection, 0.8, 0);
    else ajusterFamille(0);
  }
  function ajusterFamille(duree = 600) {
    if (!famille) return;
    const w = famille.conteneur.clientWidth, h = famille.conteneur.clientHeight, marge = 70, haut = 90;
    const k = Math.min((w - 2 * marge) / disposition.largeur, (h - haut - marge) / disposition.hauteur, 1.1);
    const t = d3.zoomIdentity.translate((w - disposition.largeur * k) / 2, haut + (h - haut - disposition.hauteur * k) / 2).scale(k);
    d3.select(famille.conteneur).transition().duration(duree).call(famille.zoom.transform, t);
  }
  function centrerFamille(id, echelle, duree = 600) {
    const q = disposition?.cartes.get(String(id)); if (!q || !famille) return;
    const w = famille.conteneur.clientWidth, h = famille.conteneur.clientHeight;
    const k = echelle ?? Math.max(d3.zoomTransform(famille.conteneur).k, 0.6);
    const t = d3.zoomIdentity.translate(w / 2 - q.x * k, h / 2 - q.y * k).scale(k);
    d3.select(famille.conteneur).transition().duration(duree).call(famille.zoom.transform, t);
  }
  function selectionner(id) { if (!famille) return; famille.selection = String(id); marquerSelection(); mettreAJourStats(); }
  function marquerSelection() {
    famille.monde.querySelectorAll('.lg-place').forEach(el => el.classList.toggle('card-main', el.dataset.id === famille.selection));
    estomperFamille();
  }
  function estomperFamille() {
    if (!famille) return;
    const ids = focus && famille.selection ? lignee(famille.selection) : null;
    famille.monde.querySelectorAll('.lg-place').forEach(el => el.querySelector('.lg-carte').classList.toggle('lg-estompee', !!ids && !ids.has(el.dataset.id)));
    famille.monde.querySelectorAll('svg g[data-ids]').forEach(g => g.classList.toggle('lg-estompe', !!ids && g.dataset.ids.split(' ').some(i => !ids.has(i))));
  }

  // ---- Arbre
  function dessiner(idCentre, transformation) {
    const conteneur = $('#lg-arbre');
    conteneur.innerHTML = '';
    conteneur.classList.toggle('lg-vide', !donnees.length);
    conteneur.classList.toggle('lg-mode-famille', mode === 'famille');
    conteneur.dataset.message = 'Cet arbre est vide : ajoutez un premier membre.';
    d3.select(conteneur).on('.zoom', null); conteneur.onclick = null;
    graphique = null; famille = null;
    if (!donnees.length) { mettreAJourStats(); return; }
    if (mode === 'famille') { dessinerFamille(idCentre, transformation); mettreAJourStats(); return; }
    graphique = f3.createChart('#lg-arbre', donnees)
      .setTransitionTime(650).setCardXSpacing(250).setCardYSpacing(175)
      .setSingleParentEmptyCard(false).setShowSiblingsOfMain(true)
      .setSortChildrenFunction((a, b) => (a.data.birthday || '9999').localeCompare(b.data.birthday || '9999'))
      .setLinkSpouseText(() => '⚭')
      .setAfterUpdate(() => { estomperLiens(); mettreAJourZoom(); mettreAJourStats(); });
    graphique.setCardHtml().setCardDim({ w: 210, h: 112 }).setMiniTree(false)
      .setCardInnerHtmlCreator(carte)
      .setOnCardClick((e, d) => { centrer(d.data.id); ouvrirFiche(d.data.id); });
    const depart = parId(idCentre) ? String(idCentre) : personneMoi();
    // Sur petit écran, on garde le zoom à 100 % centré sur la personne plutôt que d'afficher tout l'arbre en miniature.
    graphique.updateMainId(depart).updateTree(window.innerWidth < 760 ? { initial: false, tree_position: 'main_to_middle', scale: 1, transition_time: 0 } : { initial: true });
    // Le niveau de zoom affiché suit la molette, le pincement à deux doigts et le glisser.
    for (const evt of ['wheel', 'touchend', 'mouseup']) graphique.svg.addEventListener(evt, () => setTimeout(mettreAJourZoom, 80), { passive: true });
    mettreAJourStats();
  }
  function centrer(id) {
    if (mode === 'famille') { selectionner(id); centrerFamille(id); return; }
    if (!graphique) return;
    graphique.updateMainId(String(id)); graphique.updateTree({ tree_position: 'main_to_middle' });
    mettreAJourStats();
  }

  async function chargerArbre(id, idCentre, transformation) {
    const r = await api('GET', `/trees/${id}`);
    arbre = r.tree; personnes = r.people || []; liens = r.relationships || [];
    peutModifier = !!r.canEdit;
    racine().classList.toggle('lg-lecture-seule', !peutModifier);
    personneDepart = r.tree.root_person_id;
    construireDonnees();
    dessiner(idCentre, transformation);
    retenir('arbre', id);
  }
  // Recharge les données après une modification sans perdre la personne au centre.
  async function recharger(idCentre) {
    const centre = idCentre ?? (mode === 'famille' ? famille?.selection : graphique?.store.getMainId());
    // En vue famille, on garde le cadrage actuel pour ne pas faire sauter l'écran après une modification.
    const cadrage = mode === 'famille' && famille ? d3.zoomTransform(famille.conteneur) : undefined;
    await chargerArbre(arbre.id, centre, cadrage);
    if (choisi && personne(choisi)) ouvrirFiche(choisi); else fermerFiche();
  }

  // ---- Fiche latérale
  function ouvrirFiche(id) {
    choisi = String(id);
    const d = parId(id), p = d.data, brut = personne(id);
    const m = $('#lg-fiche-medaillon');
    m.innerHTML = medaillon(p); m.className = 'lg-medaillon lg-' + p.gender;
    $('#lg-fiche-generation').textContent = 'Génération ' + romain(p._generation);
    $('#lg-fiche-nom').textContent = `${p['first name']} ${p['last name'] || ''}`.trim();
    const f = $('#lg-onglet-identite');
    for (const champ of ['given_name', 'surname', 'birth_surname', 'birth_place', 'death_place', 'occupation', 'notes']) f[champ].value = brut[champ] || '';
    f.gender.value = brut.gender === 'female' ? 'female' : brut.gender === 'male' ? 'male' : '';
    f.birth_date.value = versIso(brut.birth_date); f.death_date.value = versIso(brut.death_date);
    [...f.elements].forEach(e => { if (e.name) e.disabled = !peutModifier; });

    const freres = [...new Set(d.rels.parents.flatMap(x => parId(x)?.rels.children || []))].filter(x => x !== d.id);
    const bloc = (titre, ids) => `<h3>${titre}</h3>` + (ids.length ? ids.map(i => {
      const q = parId(i).data;
      return `<button class="lg-lien-personne" data-id="${i}"><div class="lg-medaillon lg-${q.gender}">${medaillon(q)}</div>
        <div><strong>${echapper(q['first name'])} ${echapper(q['last name'])}</strong><small>${dateLongue(q.birthday) || 'Date inconnue'}</small></div></button>`;
    }).join('') : '<p class="lg-vide-liste">Aucun</p>');
    $('#lg-onglet-liens').innerHTML = bloc('Parents', d.rels.parents) + bloc('Conjoints', d.rels.spouses) + bloc('Enfants', d.rels.children) + bloc('Frères et sœurs', freres);
    $('#lg-fiche').classList.add('lg-ouvert');
  }
  function fermerFiche() { $('#lg-fiche').classList.remove('lg-ouvert'); choisi = null; }

  // Corps complet d'une personne : l'API remplace tous les champs, il faut donc renvoyer ceux qu'on ne modifie pas.
  function corpsPersonne(brut, modifs) {
    const champs = ['given_name', 'surname', 'birth_surname', 'gender', 'birth_date', 'death_date', 'birth_place', 'death_place', 'occupation', 'photo_url', 'notes'];
    const corps = {};
    for (const c of champs) corps[c] = brut?.[c] ?? '';
    Object.assign(corps, modifs);
    corps.is_living = !corps.death_date;
    return corps;
  }

  async function enregistrerFiche(e) {
    e.preventDefault();
    if (!peutModifier || !choisi) return;
    const f = e.target, modifs = {};
    for (const champ of ['given_name', 'surname', 'birth_surname', 'gender', 'birth_date', 'death_date', 'birth_place', 'death_place', 'occupation', 'notes']) modifs[champ] = f[champ].value.trim();
    try {
      await api('PUT', `/people/${choisi}`, corpsPersonne(personne(choisi), modifs));
      await recharger(); toast('Modifications enregistrées');
    } catch (err) { erreur(err); }
  }

  // ---- Ajouts
  function demanderPersonne(titre, valeurs = {}) {
    return new Promise(resoudre => {
      const dlg = $('#lg-dialogue'), f = $('#lg-form-nouveau');
      $('#lg-dialogue-titre').textContent = titre;
      f.reset();
      for (const [k, v] of Object.entries(valeurs)) if (f[k]) f[k].value = v;
      dlg.onclose = () => {
        if (dlg.returnValue !== 'ok') return resoudre(null);
        resoudre({ given_name: f.given_name.value.trim(), surname: f.surname.value.trim(), gender: f.gender.value, birth_date: f.birth_date.value });
      };
      dlg.showModal(); f.given_name.focus();
    });
  }
  async function ajouter(type) {
    if (!peutModifier) return;
    const ref = choisi ? personne(choisi) : null, d = choisi ? parId(choisi) : null;
    const titres = { parent: 'Ajouter un parent', conjoint: 'Ajouter un conjoint', enfant: 'Ajouter un enfant', nouveau: 'Nouveau membre' };
    const defaut = type === 'enfant' || type === 'parent' ? { surname: ref?.surname || '' } : {};
    const saisie = await demanderPersonne(titres[type] + (ref ? ` — ${ref.given_name}` : ''), defaut);
    if (!saisie || !saisie.given_name) return;
    try {
      let nouvelle;
      if (type === 'enfant') {
        const autreParent = d.rels.spouses.length === 1 ? Number(d.rels.spouses[0]) : 0;
        nouvelle = await api('POST', `/trees/${arbre.id}/children`, { ...corpsPersonne(null, saisie), parent1_id: Number(choisi), parent2_id: autreParent });
      } else {
        nouvelle = await api('POST', `/trees/${arbre.id}/people`, corpsPersonne(null, saisie));
        if (type === 'parent') await api('POST', `/trees/${arbre.id}/relationships`, { type: 'parent', person1_id: nouvelle.id, person2_id: Number(choisi) });
        if (type === 'conjoint') await api('POST', `/trees/${arbre.id}/relationships`, { type: 'partner', person1_id: Number(choisi), person2_id: nouvelle.id });
      }
      await recharger(choisi || nouvelle.id);
      toast(`${saisie.given_name} a été ajouté${saisie.gender === 'female' ? 'e' : ''} à l'arbre`);
    } catch (err) { erreur(err); }
  }
  async function supprimer() {
    const p = personne(choisi);
    if (!p || !confirm(`Supprimer ${p.given_name} ${p.surname || ''} de l'arbre ? Ses liens de parenté seront aussi supprimés.`)) return;
    try { await api('DELETE', `/people/${choisi}`); choisi = null; fermerFiche(); await recharger(personneDepart); toast('Personne supprimée'); }
    catch (err) { erreur(err); }
  }

  // ---- Photo : l'API attend l'original et un portrait carré JPEG (128 à 2048 px)
  async function envoyerPhoto(fichier) {
    if (!fichier || !choisi) return;
    try {
      const image = await createImageBitmap(fichier);
      const cote = Math.min(image.width, image.height), taille = Math.max(128, Math.min(1024, cote));
      const toile = document.createElement('canvas'); toile.width = toile.height = taille;
      toile.getContext('2d').drawImage(image, (image.width - cote) / 2, (image.height - cote) / 3, cote, cote, 0, 0, taille, taille);
      const portrait = await new Promise(r => toile.toBlob(r, 'image/jpeg', 0.9));
      const fd = new FormData();
      fd.append('photo', fichier); fd.append('portrait', portrait, 'portrait.jpg'); fd.append('set_primary', '1');
      await api('POST', `/people/${choisi}/photos`, fd);
      await recharger(); toast('Photo enregistrée');
    } catch (err) { erreur(err); }
  }

  // ---- Import GEDCOM : aperçu obligatoire, puis import confirmé par l'empreinte du fichier
  let apercuImport = null;
  function reinitialiserImport() {
    apercuImport = null;
    const f = $('#lg-form-import'), nouveau = f.mode.value === 'new';
    $('#lg-import-nom').hidden = !nouveau;
    $('#lg-import-aide').textContent = nouveau
      ? "Un nouvel arbre est créé à partir du fichier ; l'arbre actuel n'est pas modifié."
      : `Les personnes du fichier sont rapprochées de celles de « ${arbre?.name || ''} » par leur identifiant : les nouvelles sont ajoutées, les modifiées mises à jour, aucune n'est supprimée. À utiliser avec un fichier exporté depuis Lignées.`;
    $('#lg-import-apercu').hidden = true;
    $('#lg-import-action').textContent = "Voir l'aperçu";
  }
  function formulaireImport(avecEmpreinte) {
    const f = $('#lg-form-import'), fd = new FormData();
    fd.append('package', f.fichier.files[0]); fd.append('origin', 'genealogie'); fd.append('mode', f.mode.value);
    if (avecEmpreinte) fd.append('preview_sha256', apercuImport.sha256);
    return fd;
  }
  async function actionImport() {
    const f = $('#lg-form-import'), bouton = $('#lg-import-action'), zone = $('#lg-import-apercu');
    if (!f.fichier.files.length) { f.fichier.reportValidity(); return; }
    const nouveau = f.mode.value === 'new';
    if (!nouveau && !arbre) { toast("Aucun arbre affiché à mettre à jour"); return; }
    bouton.disabled = true; zone.classList.remove('lg-erreur');
    try {
      if (!apercuImport) {
        apercuImport = await api('POST', nouveau ? '/import/gedcom/preview' : `/trees/${arbre.id}/research/preview`, formulaireImport(false));
        const c = apercuImport.counts || {}, n = apercuImport.new || {}, m = apercuImport.changed || {};
        zone.innerHTML = nouveau
          ? `<strong>${c.persons || 0}</strong> personnes, <strong>${c.relationships || 0}</strong> liens de parenté et <strong>${c.events || 0}</strong> événements seront importés dans un nouvel arbre.`
          : `<strong>${n.persons || 0}</strong> nouvelles personnes, <strong>${m.persons || 0}</strong> personnes modifiées, <strong>${n.relationships || 0}</strong> nouveaux liens.`;
        if ((apercuImport.warnings || []).length) zone.innerHTML += `<br><small>${apercuImport.warnings.map(echapper).join('<br>')}</small>`;
        zone.hidden = false; bouton.textContent = 'Importer';
        return;
      }
      let idArbre = arbre?.id, cree = null;
      if (nouveau) {
        const nom = f.nom.value.trim() || f.fichier.files[0].name.replace(/\.(ged|gedcom|gdz|zip)$/i, '');
        cree = await api('POST', '/trees', { name: nom }); idArbre = cree.id;
      }
      try {
        await api('POST', `/trees/${idArbre}/research/import`, formulaireImport(true));
      } catch (err) {
        if (cree) await api('DELETE', `/trees/${cree.id}`).catch(() => {});
        throw err;
      }
      $('#lg-import').close();
      arbres = await api('GET', '/trees'); remplirChoix(idArbre);
      fermerFiche(); await chargerArbre(idArbre);
      toast(nouveau ? 'Arbre importé' : 'Arbre mis à jour à partir du fichier');
    } catch (err) {
      zone.hidden = false; zone.classList.add('lg-erreur'); zone.textContent = 'Import impossible : ' + (err.message || err);
      apercuImport = null; bouton.textContent = "Voir l'aperçu";
    } finally { bouton.disabled = false; }
  }
  function remplirChoix(idActif) {
    const choix = $('#lg-choix-arbre');
    choix.innerHTML = arbres.map(a => `<option value="${a.id}">${echapper(a.name)}</option>`).join('');
    choix.value = idActif;
  }

  // ---- Initialisation
  async function demarrer() {
    if (!racine()) return;
    if (preferences().theme === 'emeraude') { racine().classList.add('lg-emeraude'); $('#lg-nom-theme').textContent = 'Émeraude'; }
    try {
      arbres = await api('GET', '/trees');
      if (!arbres.length) { $('#lg-stats').textContent = 'Aucun arbre'; dessiner(); return; }
      let depart = Number(preferences().arbre);
      try { const pr = await api('GET', '/preferences'); if (!arbres.some(a => a.id == depart)) depart = pr.startTreeId; } catch (e) { /* préférences facultatives */ }
      if (!arbres.some(a => a.id == depart)) depart = arbres[0].id;
      remplirChoix(depart);
      await chargerArbre(depart);
    } catch (e) { erreur(e); }
  }

  function brancher() {
    $('#lg-choix-arbre').onchange = e => { fermerFiche(); chargerArbre(Number(e.target.value)).catch(erreur); };
    const zoomer = facteur => {
      if (famille) d3.select(famille.conteneur).transition().duration(250).call(famille.zoom.scaleBy, facteur);
      else if (graphique) { f3.handlers.manualZoom({ amount: facteur, svg: graphique.svg, transition_time: 250 }); setTimeout(mettreAJourZoom, 300); }
    };
    $('#lg-zoom-plus').onclick = () => zoomer(1.2);
    $('#lg-zoom-moins').onclick = () => zoomer(1 / 1.2);
    $('#lg-recentrer').onclick = () => { if (famille) ajusterFamille(); else graphique?.updateTree({ tree_position: 'fit' }); };
    const libelleVue = () => { $('#lg-vue .lg-texte').textContent = mode === 'famille' ? 'Vue centrée' : 'Toute la famille'; };
    libelleVue();
    $('#lg-vue').onclick = () => {
      const centre = idCentre();
      mode = mode === 'famille' ? 'centree' : 'famille'; retenir('vue', mode); libelleVue();
      dessiner(centre);
      toast(mode === 'famille' ? 'Toute la famille' : 'Vue centrée sur une personne');
    };
    $('#lg-focus').onclick = () => {
      focus = !focus; $('#lg-focus').classList.toggle('lg-actif', focus);
      if (famille) estomperFamille(); else graphique?.updateTree({ tree_position: 'inherit' });
      toast(focus ? 'Lignée directe mise en valeur' : "Tout l'arbre est affiché");
    };
    $('#lg-outils').onclick = e => { e.stopPropagation(); const m = $('#lg-menu'); m.style.display = m.style.display === 'block' ? 'none' : 'block'; };
    document.addEventListener('click', () => { $('#lg-menu').style.display = 'none'; });
    $('#lg-theme').onclick = () => {
      const em = racine().classList.toggle('lg-emeraude');
      $('#lg-nom-theme').textContent = em ? 'Émeraude' : 'Parchemin'; retenir('theme', em ? 'emeraude' : 'parchemin');
    };
    $('#lg-export-ged').onclick = () => { if (arbre) window.location.href = OC.generateUrl(`/apps/lignees/api/trees/${arbre.id}/export/gedcom`); };
    $('#lg-moi').onclick = () => { const moi = personneMoi(); if (moi) centrer(moi); };
    $('#lg-maison').onclick = () => { const moi = personneMoi(); if (moi) centrer(moi); };
    $('#lg-import-ged').onclick = () => {
      const f = $('#lg-form-import'); f.reset();
      if (!peutModifier) f.mode.value = 'new';
      f.mode.querySelector('[value="update"]').disabled = !peutModifier || !arbre;
      reinitialiserImport(); $('#lg-import').showModal();
    };
    $('#lg-form-import').onchange = e => { if (e.target.name !== 'nom') reinitialiserImport(); };
    $('#lg-import-action').onclick = actionImport;
    $('#lg-nouveau').onclick = () => { choisi = null; fermerFiche(); ajouter('nouveau'); };

    $('#lg-recherche').oninput = e => {
      const q = e.target.value.trim().toLowerCase(), r = $('#lg-resultats');
      if (!q) { r.style.display = 'none'; return; }
      const trouves = donnees.filter(d => `${d.data['first name']} ${d.data['last name']}`.toLowerCase().includes(q)).slice(0, 8);
      r.innerHTML = trouves.length
        ? trouves.map(d => `<button data-id="${d.id}"><span>${echapper(d.data['first name'])} ${echapper(d.data['last name'])}</span><small>${annee(d.data.birthday)}</small></button>`).join('')
        : '<button disabled>Aucun résultat</button>';
      r.style.display = 'block';
    };
    $('#lg-resultats').onclick = e => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      centrer(b.dataset.id); ouvrirFiche(b.dataset.id);
      $('#lg-resultats').style.display = 'none'; $('#lg-recherche').value = '';
    };

    $('#lg-fermer').onclick = fermerFiche;
    document.querySelectorAll('.lg-onglets button').forEach(b => { b.onclick = () => {
      document.querySelectorAll('.lg-onglets button').forEach(x => x.classList.toggle('lg-actif', x === b));
      for (const o of ['identite', 'liens', 'actions']) $('#lg-onglet-' + o).hidden = o !== b.dataset.onglet;
    }; });
    $('#lg-onglet-liens').onclick = e => { const b = e.target.closest('[data-id]'); if (b) { centrer(b.dataset.id); ouvrirFiche(b.dataset.id); } };
    $('#lg-onglet-actions').onclick = e => {
      const a = e.target.closest('[data-action]')?.dataset.action; if (!a) return;
      if (a === 'centrer') centrer(choisi);
      else if (a === 'supprimer') supprimer();
      else ajouter(a);
    };
    $('#lg-photo').onchange = e => { envoyerPhoto(e.target.files[0]); e.target.value = ''; };
    $('#lg-onglet-identite').onsubmit = enregistrerFiche;
  }

  document.addEventListener('DOMContentLoaded', () => { brancher(); demarrer(); });
})();

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

  // ---- Thèmes royaux (un par lignée, enregistrés sur le serveur)
  const THEMES = {
    or: { nom: 'Or impérial', accent: '#b68934', or: '#c8a254', ligne: '#b9944c', union: '#c79332', fond: '#f6f1e7', grille: 'rgba(164,134,82,.11)', carte: '#fffdf9', survol: '#fff9ee', bord: 'rgba(180,145,78,.28)' },
    pourpre: { nom: 'Pourpre royal', accent: '#6d2e86', or: '#9a63b3', ligne: '#8a5aa6', union: '#b8923c', fond: '#f4eff6', grille: 'rgba(110,70,140,.10)', carte: '#fffcff', survol: '#faf3fd', bord: 'rgba(120,80,150,.28)', sombre: '#c79be0' },
    bleu: { nom: 'Bleu de France', accent: '#1f4f9b', or: '#5d82c4', ligne: '#5677b3', union: '#c39a3d', fond: '#eef2f8', grille: 'rgba(60,90,150,.10)', carte: '#fcfdff', survol: '#f3f7fe', bord: 'rgba(70,100,160,.28)', sombre: '#8fb2ec' },
    rubis: { nom: 'Rubis de Bourgogne', accent: '#8e1f3c', or: '#b9576f', ligne: '#a8566a', union: '#c39a3d', fond: '#f8eff0', grille: 'rgba(140,40,60,.09)', carte: '#fffcfc', survol: '#fdf3f5', bord: 'rgba(150,60,80,.26)', sombre: '#ec8aa2' },
    emeraude: { nom: 'Émeraude impériale', accent: '#1d6b50', or: '#4f9a7c', ligne: '#4d8a71', union: '#c39a3d', fond: '#eef5f1', grille: 'rgba(40,110,80,.10)', carte: '#fcfffd', survol: '#f2faf6', bord: 'rgba(50,120,90,.26)', sombre: '#7fd1ad' },
    saphir: { nom: 'Saphir de minuit', accent: '#d7b45a', or: '#d7b45a', ligne: '#8ea3c9', union: '#e0bd62', fond: '#101a33', grille: 'rgba(150,170,220,.07)', carte: '#18264a', survol: '#1e2f5a', bord: 'rgba(170,190,240,.22)',
      texte: '#eef1fa', texte2: '#b9c3dc', texte3: '#8592b3', surface: 'rgba(20,32,62,.94)', sombre: '#e0bd62' },
    argent: { nom: 'Argent royal', accent: '#5b6472', or: '#8c96a5', ligne: '#8a93a0', union: '#a9b2bf', fond: '#f2f3f5', grille: 'rgba(90,100,115,.10)', carte: '#ffffff', survol: '#f7f8fa', bord: 'rgba(100,110,125,.26)', sombre: '#c3cad4' },
  };
  let themes = {}; // clé de lignée (ou « * ») → nom du thème

  // ---- État
  let arbres = [], arbre = null, personnes = [], liens = [], donnees = [], graphique = null;
  let peutModifier = false, focus = false, choisi = null, personneDepart = null;
  // Deux vues : « famille » (tout l'arbre, placement maison) et « centree » (family-chart autour d'une personne).
  let mode = preferences().vue === 'centree' ? 'centree' : 'famille';
  let disposition = null, famille = null; // famille = { conteneur, monde, zoom, selection }
  // Lignées : la vue famille n'affiche qu'une lignée à la fois (avec les conjoints venus d'ailleurs), ou toutes.
  let complet = null, ligneesNommees = [], ligneeAffichee = null;
  // Ponts vers d'autres arbres : id de personne → [{id, cible: {id, tree_id, tree_name, ...}, canDelete}]
  let ponts = new Map(), partages = [], estProprietaire = false, evenements = [];
  let parametresArbre = {}; // anniversaires, deces, rappel, lignee_conjoint, agenda…
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

  // Placement (js/vue-complete.js). Le calcul sur tout l'arbre fournit les lignées et les générations des deux vues.
  const versModule = d => ({ id: d.id, naissance: d.data.birthday, genre: d.data.gender });
  const lienModule = l => ({ type: l.type, de: l.person1_id, vers: l.person2_id });
  function nomLignee(l) {
    // Nom le plus porté par les descendants de la lignée (ceux qui y ont leurs parents), sinon celui de la racine.
    const compte = new Map();
    for (const id of l.membres) {
      const d = parId(id); if (!d?.rels.parents.length) continue;
      const n = (d.data['last name'] || '').trim(); if (n) compte.set(n.toUpperCase(), (compte.get(n.toUpperCase()) || 0) + 1);
    }
    const brut = [...compte].sort((a, b) => b[1] - a[1])[0]?.[0] || parId(l.racine[0])?.data['last name'] || parId(l.racine[0])?.data['first name'] || '?';
    return brut.toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase());
  }
  function calculerDisposition() {
    if (!donnees.length) { complet = disposition = null; ligneesNommees = []; remplirLignees(); return; }
    complet = LigneesVueComplete.calculer(donnees.map(versModule), liens.map(lienModule), { reference: personneMoi() });
    donnees.forEach(d => { d.data._generation = complet.cartes.get(d.id)?.gen || 1; });
    ligneesNommees = complet.lignees.filter(l => l.membres.length >= 2).map(l => ({ ...l, nom: nomLignee(l) }));
    const existe = cle => ligneesNommees.some(l => l.cle === cle);
    if (ligneeAffichee === null) ligneeAffichee = preferences()['lignee-' + arbre?.id] ?? null;
    if (ligneeAffichee !== 'toutes' && !existe(ligneeAffichee)) ligneeAffichee = complet.cleDe.get(personneMoi());
    if (ligneesNommees.length < 2 || (ligneeAffichee !== 'toutes' && !existe(ligneeAffichee))) ligneeAffichee = 'toutes';
    disposition = dispositionLignee(ligneeAffichee);
    majGenerations();
    remplirLignees();
  }
  // Générations de la vue affichée (la plus ancienne génération visible est la I).
  function majGenerations() {
    donnees.forEach(d => { d.data._generation = disposition?.cartes.get(d.id)?.gen || complet?.cartes.get(d.id)?.gen || 1; });
  }
  // Une lignée : ses membres et leurs conjoints, sans les parents de ces conjoints (qui sont dans leur propre lignée).
  function dispositionLignee(cle) {
    if (cle === 'toutes') return complet;
    const membres = new Set(ligneesNommees.find(l => l.cle === cle).membres), visibles = new Set(membres);
    for (const id of membres) for (const c of parId(id).rels.spouses) visibles.add(c);
    const ls = liens.filter(l => visibles.has(String(l.person1_id)) && visibles.has(String(l.person2_id))
      && !(l.type === 'parent' && !membres.has(String(l.person2_id))));
    return LigneesVueComplete.calculer(donnees.filter(d => visibles.has(d.id)).map(versModule), ls.map(lienModule), { reference: personneMoi() });
  }
  const cleOuToutes = id => { const c = complet?.cleDe.get(String(id)); return ligneesNommees.some(l => l.cle === c) ? c : 'toutes'; };
  function remplirLignees() {
    const s = $('#lg-choix-lignee');
    s.hidden = ligneesNommees.length < 2;
    s.innerHTML = ligneesNommees.map(l => `<option value="${echapper(l.cle)}">Lignée ${echapper(l.nom)}</option>`).join('')
      + '<option value="toutes">Toutes les lignées</option>';
    s.value = ligneeAffichee || 'toutes';
  }
  function changerLignee(cle, idSelection) {
    ligneeAffichee = cle; retenir('lignee-' + arbre.id, cle);
    disposition = dispositionLignee(cle); majGenerations(); remplirLignees();
    if (mode !== 'famille') { mode = 'famille'; retenir('vue', mode); $('#lg-vue .lg-texte').textContent = 'Vue centrée'; }
    dessiner(idSelection);
    if (idSelection) centrerFamille(idSelection, undefined, 0);
    const l = ligneesNommees.find(x => x.cle === cle);
    toast(l ? `Lignée ${l.nom}` : 'Toutes les lignées');
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
    return `<div class="lg-carte lg-${p.gender}${estompee ? ' lg-estompee' : ''}${mort || !p.vivant ? ' lg-decede' : ''}" style="${teinte(d.data.id)}">
      <span class="lg-generation">${romain(p._generation)}</span>${ponts.has(d.data.id) ? `<span class="lg-pont-carte" title="Aussi dans : ${ponts.get(d.data.id).map(x => '« ' + echapper(x.cible.tree_name) + ' »').join(', ')}">🔗</span>` : ''}
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
    const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    $('#lg-stats').textContent = `${pluriel(donnees.length, 'membre')} • ${pluriel(gens, 'génération')}${ans.length ? ' • Origine ' + ans[0] : ''}${peutModifier ? '' : ' • lecture seule'}`
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

  // ---- Thèmes : la lignée affichée colore toute la vue ; avec plusieurs lignées visibles, chaque carte prend sa couleur.
  const themeDe = cle => THEMES[themes[cle]] ? themes[cle] : THEMES[themes['*']] ? themes['*'] : 'or';
  const cleCourante = () => {
    if (mode === 'famille' && ligneeAffichee && ligneeAffichee !== 'toutes') return ligneeAffichee;
    const id = idCentre(); return (id && complet?.cleDe.get(String(id))) || ligneesNommees[0]?.cle || '*';
  };
  const plusieursVisibles = () => ligneesNommees.length > 1 && (mode === 'centree' || ligneeAffichee === 'toutes');
  function teinte(id) {
    if (!plusieursVisibles()) return '';
    const t = THEMES[themeDe(complet?.cleDe.get(String(id)))], sombre = racine().classList.contains('lg-emeraude');
    const a = sombre ? (t.sombre || t.or) : t.accent;
    return `--or:${t.or};--accent:${a};--bord:${t.bord};--ligne-lignee:${t.ligne};--union-lignee:${t.union}`;
  }
  function appliquerTheme() {
    const r = racine(), sombre = r.classList.contains('lg-emeraude');
    const nom = plusieursVisibles() ? themeDe('*') : themeDe(cleCourante()), t = THEMES[nom];
    for (const v of ['--accent', '--or', '--ligne', '--union', '--fond', '--grille', '--carte', '--carte-survol', '--bord', '--texte', '--texte-2', '--texte-3', '--surface']) r.style.removeProperty(v);
    if (sombre) { r.style.setProperty('--accent', t.sombre || t.or); r.style.setProperty('--or', t.sombre || t.or); r.style.setProperty('--union', t.union); }
    else {
      const vars = { '--accent': t.accent, '--or': t.or, '--ligne': t.ligne, '--union': t.union, '--fond': t.fond, '--grille': t.grille,
        '--carte': t.carte, '--carte-survol': t.survol, '--bord': t.bord, '--texte': t.texte, '--texte-2': t.texte2, '--texte-3': t.texte3, '--surface': t.surface };
      for (const [k, v] of Object.entries(vars)) if (v) r.style.setProperty(k, v);
    }
    $('#lg-pastille-theme').style.background = t.accent;
    $('#lg-theme-lignee').hidden = !peutModifier || !donnees.length;
    $('#lg-theme-lignee').title = `Thème royal : ${t.nom}`;
  }
  function ouvrirPalette() {
    const pal = $('#lg-palette');
    if (pal.classList.contains('lg-ouverte')) { pal.classList.remove('lg-ouverte'); return; }
    const cle = cleCourante(), actuel = themeDe(cle), l = ligneesNommees.find(x => x.cle === cle);
    pal.innerHTML = `<h4>Thème de la lignée ${echapper(l ? l.nom : arbre.name)}</h4>` + Object.entries(THEMES).map(([k, t]) =>
      `<button data-theme="${k}" class="${k === actuel ? 'lg-actif' : ''}"><span class="lg-echantillon" style="background:linear-gradient(135deg, ${t.fond} 0 45%, ${t.accent} 45% 75%, ${t.union} 75%)"></span>${t.nom}</button>`).join('');
    pal.classList.add('lg-ouverte');
  }
  async function choisirTheme(nom) {
    const cle = ligneesNommees.length > 1 ? cleCourante() : '*';
    try {
      themes = await api('PUT', `/trees/${arbre.id}/themes`, { cle, theme: nom });
      $('#lg-palette').classList.remove('lg-ouverte');
      const cadrage = mode === 'famille' && famille ? d3.zoomTransform(famille.conteneur) : undefined;
      dessiner(idCentre(), cadrage);
      toast(`Thème ${THEMES[nom].nom} appliqué`);
    } catch (err) { erreur(err); }
  }

  // ---- Vue « toute la famille »
  const LC = 210, HC = 112;
  function dessinerFamille(idCentre, transformation) {
    const conteneur = $('#lg-arbre');
    conteneur.innerHTML = '<div class="lg-monde"><svg class="lg-liens" xmlns="http://www.w3.org/2000/svg"></svg></div>';
    const monde = conteneur.firstChild, svg = monde.firstChild, c = id => disposition.cartes.get(String(id));
    let traces = '';
    const anneaux = (x, y) => `<g class="lg-anneaux"><circle cx="${x - 4}" cy="${y}" r="6"/><circle cx="${x + 4}" cy="${y}" r="6"/></g>`;
    const style = id => { const v = teinte(id); return v ? ` style="${v}"` : ''; };
    for (const { a, b } of disposition.couples) {
      const A = c(a), B = c(b), ids = `${a} ${b}`;
      if (A.y === B.y) traces += `<g data-ids="${ids}"${style(a)}><path class="lg-lien" d="M${A.x + LC / 2},${A.y} H${B.x - LC / 2}"/>${anneaux((A.x + LC / 2 + B.x - LC / 2) / 2, A.y)}</g>`;
      else traces += `<g data-ids="${ids}"${style(a)}><path class="lg-lien" d="M${A.x + LC / 2},${A.y} H${(A.x + B.x) / 2} V${B.y} H${B.x - LC / 2}"/></g>`;
    }
    for (const f of disposition.familles) {
      const ps = f.parents.map(c), es = f.enfants.map(c);
      const couple = ps.length === 2 && ps[0].y === ps[1].y;
      const ox = couple ? (ps[0].x + LC / 2 + ps[1].x - LC / 2) / 2 : ps[0].x, oy = couple ? ps[0].y + 7 : ps[0].y + HC / 2;
      const yBarre = Math.min(...es.map(e => e.y)) - HC / 2 - 34;
      // Un groupe par enfant pour pouvoir estomper précisément en « focus lignée ».
      traces += `<g data-ids="${f.parents.join(' ')}"${style(f.enfants[0])}><path class="lg-lien" d="M${ox},${oy} V${yBarre}"/></g>`;
      f.enfants.forEach((e, k) => {
        const E = es[k];
        traces += `<g data-ids="${f.parents.join(' ')} ${e}"${style(e)}><path class="lg-lien" d="M${ox},${yBarre} H${E.x} V${E.y - HC / 2}"/></g>`;
      });
    }
    svg.innerHTML = traces;
    for (const d of donnees) {
      const q = c(d.id); if (!q) continue; // personne d'une autre lignée
      const el = document.createElement('div');
      el.className = 'lg-place'; el.dataset.id = d.id;
      el.style.left = (q.x - LC / 2) + 'px'; el.style.top = (q.y - HC / 2) + 'px';
      el.innerHTML = carte({ data: d });
      monde.appendChild(el);
    }
    const zoom = d3.zoom().scaleExtent([0.12, 2.5])
      .on('zoom', e => { monde.style.transform = `translate(${e.transform.x}px,${e.transform.y}px) scale(${e.transform.k})`; mettreAJourZoom(); });
    const sel = d3.select(conteneur).call(zoom).on('dblclick.zoom', null);
    const visible = id => id && disposition.cartes.has(String(id));
    const moi = personneMoi();
    famille = { conteneur, monde, zoom, selection: visible(idCentre) ? String(idCentre) : visible(moi) ? moi : [...disposition.cartes.keys()][0] };
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
    appliquerTheme();
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
    if (mode === 'famille' && !disposition?.cartes.has(String(id))) { changerLignee(cleOuToutes(id), String(id)); return; }
    if (mode === 'famille') { selectionner(id); centrerFamille(id); return; }
    if (!graphique) return;
    graphique.updateMainId(String(id)); graphique.updateTree({ tree_position: 'main_to_middle' });
    mettreAJourStats();
  }

  async function chargerArbre(id, idCentre, transformation) {
    const r = await api('GET', `/trees/${id}`);
    if (arbre?.id !== r.tree.id) ligneeAffichee = null;
    arbre = r.tree; personnes = r.people || []; liens = r.relationships || [];
    partages = r.shares || []; estProprietaire = !!r.isOwner; evenements = r.events || [];
    ponts = new Map();
    try {
      for (const pt of await api('GET', `/trees/${id}/passerelles`)) {
        const k = String(pt.person_id); if (!ponts.has(k)) ponts.set(k, []); ponts.get(k).push(pt);
      }
    } catch (e) { /* ponts facultatifs */ }
    try { themes = await api('GET', `/trees/${id}/themes`); } catch (e) { themes = {}; }
    try { parametresArbre = await api('GET', `/trees/${id}/parametres`); } catch (e) { parametresArbre = {}; }
    peutModifier = !!r.canEdit;
    racine().classList.toggle('lg-lecture-seule', !peutModifier);
    personneDepart = r.tree.root_person_id;
    construireDonnees();
    // Arrivée depuis un autre arbre : afficher la lignée où se trouve la personne demandée.
    if (mode === 'famille' && idCentre && complet?.cartes.has(String(idCentre)) && !disposition?.cartes.has(String(idCentre))) {
      ligneeAffichee = cleOuToutes(idCentre); disposition = dispositionLignee(ligneeAffichee); majGenerations(); remplirLignees();
    }
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
    if (parametresArbre.anniversaires) api('POST', `/trees/${arbre.id}/anniversaires`).catch(() => {});
  }

  // ---- Fiche latérale
  function ouvrirFiche(id) {
    choisi = String(id);
    const d = parId(id), p = d.data, brut = personne(id);
    const m = $('#lg-fiche-medaillon');
    m.innerHTML = medaillon(p); m.className = 'lg-medaillon lg-' + p.gender;
    $('#lg-fiche-generation').textContent = 'Génération ' + romain(p._generation);
    $('#lg-fiche-nom').textContent = `${p['first name']} ${p['last name'] || ''}`.trim();
    // Avec plusieurs ponts, le bouton suit le plus récent ; l'onglet Liens les liste tous.
    const pont = (ponts.get(String(id)) || []).reduce((r, x) => (!r || Number(x.id) > Number(r.id) ? x : r), null);
    const autre = !pont && mode === 'famille' && ligneeAffichee !== 'toutes' ? ligneesNommees.find(l => l.cle === complet?.cleDe.get(String(id)) && l.cle !== ligneeAffichee) : null;
    const ligneeRacine = ligneesNommees.length >= 2 ? ligneesNommees.find(l => l.racine.includes(String(id))) : null;
    $('#lg-action-deplacer').hidden = !peutModifier || !ligneeRacine;
    if (ligneeRacine) $('#lg-action-deplacer').textContent = `Déplacer la lignée ${ligneeRacine.nom} dans un nouvel arbre`;
    const bv = $('#lg-voir-lignee');
    bv.hidden = !pont && !autre;
    delete bv.dataset.cle; delete bv.dataset.arbre; delete bv.dataset.personne;
    if (pont) { bv.textContent = `Voir sa lignée : arbre « ${pont.cible.tree_name} »`; bv.dataset.arbre = pont.cible.tree_id; bv.dataset.personne = pont.cible.id; }
    else if (autre) { bv.textContent = `Voir sa lignée : ${autre.nom}`; bv.dataset.cle = autre.cle; }
    const f = $('#lg-onglet-identite');
    for (const champ of ['given_name', 'surname', 'birth_surname', 'birth_place', 'death_place', 'occupation', 'notes']) f[champ].value = brut[champ] || '';
    f.gender.value = brut.gender === 'female' ? 'female' : brut.gender === 'male' ? 'male' : '';
    f.birth_date.value = versIso(brut.birth_date); f.death_date.value = versIso(brut.death_date);
    [...f.elements].forEach(e => { if (e.name) e.disabled = !peutModifier; });

    const freres = [...new Set(d.rels.parents.flatMap(x => parId(x)?.rels.children || []))].filter(x => x !== d.id);
    // Relation enregistrée entre la personne de la fiche et i (pour pouvoir la supprimer) ; aucune pour les frères et sœurs.
    const relation = (i, type) => liens.find(l => l.type === (type === 'conjoint' ? 'partner' : 'parent') && (
      type === 'parent' ? String(l.person1_id) === i && String(l.person2_id) === d.id
        : type === 'enfant' ? String(l.person1_id) === d.id && String(l.person2_id) === i
          : [String(l.person1_id), String(l.person2_id)].sort().join() === [d.id, i].sort().join()));
    const bloc = (titre, ids, type) => `<h3>${titre}</h3>` + (ids.length ? ids.map(i => {
      const q = parId(i).data, r = type && relation(i, type);
      return `<div class="lg-ligne-lien"><button class="lg-lien-personne" data-id="${i}"><div class="lg-medaillon lg-${q.gender}">${medaillon(q)}</div>
        <div><strong>${echapper(q['first name'])} ${echapper(q['last name'])}</strong><small>${dateLongue(q.birthday) || 'Date inconnue'}</small></div></button>
        ${r ? `<button class="lg-delier" data-relation="${r.id}" data-nom="${echapper(q['first name'])}" title="Supprimer ce lien">✕</button>` : ''}</div>`;
    }).join('') : '<p class="lg-vide-liste">Aucun</p>');
    const ailleurs = (ponts.get(d.id) || []).map(pt => `<div class="lg-ligne-lien"><button class="lg-lien-personne" data-arbre="${pt.cible.tree_id}" data-personne="${pt.cible.id}">
        <div class="lg-medaillon lg-${p.gender}">🔗</div><div><strong>${echapper(pt.cible.given_name)} ${echapper(pt.cible.surname)}</strong><small>Arbre « ${echapper(pt.cible.tree_name)} »</small></div></button>
        ${pt.canDelete ? `<button class="lg-delier" data-pont="${pt.id}" data-nom="l'arbre « ${echapper(pt.cible.tree_name)} »" title="Supprimer ce pont">✕</button>` : ''}</div>`).join('');
    $('#lg-onglet-liens').innerHTML = bloc('Parents', d.rels.parents, 'parent') + bloc('Conjoints', d.rels.spouses, 'conjoint') + bloc('Enfants', d.rels.children, 'enfant') + bloc('Frères et sœurs', freres)
      + (ailleurs ? `<h3>Dans d'autres arbres</h3>${ailleurs}` : '');
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
        if (type === 'conjoint') {
          await api('POST', `/trees/${arbre.id}/relationships`, { type: 'partner', person1_id: Number(choisi), person2_id: nouvelle.id });
          if (parametresArbre.lignee_conjoint) await arbrePourConjoint(nouvelle).catch(err => toast("Conjoint ajouté, mais l'arbre de sa famille n'a pas pu être créé : " + err.message));
        }
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

  // ---- Relier deux personnes existantes, ou supprimer un lien
  function preparerRelier() {
    const f = $('#lg-form-relier'), d = parId(choisi), nom = d.data['first name'], type = f.type.value;
    const deja = new Set([d.id, ...(type === 'parent' ? d.rels.parents : type === 'enfant' ? d.rels.children : d.rels.spouses)]);
    const candidats = donnees.filter(x => !deja.has(x.id))
      .sort((a, b) => `${a.data['first name']} ${a.data['last name']}`.localeCompare(`${b.data['first name']} ${b.data['last name']}`, 'fr'));
    const avant = f.personne.value;
    f.personne.innerHTML = candidats.map(x => `<option value="${x.id}">${echapper(x.data['first name'])} ${echapper(x.data['last name'])}${annee(x.data.birthday) ? ' (' + annee(x.data.birthday) + ')' : ''}</option>`).join('');
    if (candidats.some(x => x.id === avant)) f.personne.value = avant;
    const libelles = { parent: 'parent', enfant: 'enfant', conjoint: 'conjoint ou conjointe' };
    $('#lg-relier-titre').textContent = `Relier ${nom} à une personne existante`;
    $('#lg-relier-aide').textContent = candidats.length ? `La personne choisie deviendra ${libelles[type] === 'parent' ? 'un parent' : libelles[type] === 'enfant' ? 'un enfant' : 'le conjoint ou la conjointe'} de ${nom}.` : 'Aucune personne disponible pour ce type de lien.';
  }
  function relier() {
    if (!peutModifier || !choisi) return;
    const dlg = $('#lg-relier'), f = $('#lg-form-relier');
    f.type.value = 'parent'; preparerRelier();
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'ok' || !f.personne.value) return;
      const autre = Number(f.personne.value), moi = Number(choisi), type = f.type.value;
      const corps = type === 'parent' ? { type: 'parent', person1_id: autre, person2_id: moi }
        : type === 'enfant' ? { type: 'parent', person1_id: moi, person2_id: autre }
          : { type: 'partner', person1_id: moi, person2_id: autre };
      try { await api('POST', `/trees/${arbre.id}/relationships`, corps); await recharger(); toast('Lien ajouté'); }
      catch (err) { erreur(err); }
    };
    dlg.showModal();
  }
  async function delier(bouton) {
    const d = parId(choisi);
    if (bouton.dataset.pont) {
      if (!confirm(`Supprimer le pont entre ${d.data['first name']} et ${bouton.dataset.nom} ? Les fiches restent dans les deux arbres.`)) return;
      try { await api('DELETE', `/passerelles/${bouton.dataset.pont}`); await recharger(); toast('Pont supprimé'); } catch (err) { erreur(err); }
      return;
    }
    if (!confirm(`Supprimer le lien entre ${d.data['first name']} et ${bouton.dataset.nom} ? Les deux personnes restent dans l'arbre.`)) return;
    try { await api('DELETE', `/relationships/${bouton.dataset.relation}`); await recharger(); toast('Lien supprimé'); }
    catch (err) { erreur(err); }
  }

  // ---- Plusieurs arbres : aller vers un autre arbre, ponts, création et partage
  async function allerVers(idArbre, idPersonne) {
    if (!arbres.some(a => String(a.id) === String(idArbre))) arbres = await api('GET', '/trees');
    remplirChoix(Number(idArbre)); fermerFiche();
    await chargerArbre(Number(idArbre), String(idPersonne));
    if (idPersonne && parId(idPersonne)) { centrer(String(idPersonne)); ouvrirFiche(String(idPersonne)); }
    toast(`Arbre « ${arbre.name} »`);
  }
  async function pont() {
    if (!peutModifier || !choisi) return;
    const dlg = $('#lg-pont'), f = $('#lg-form-pont'), d = parId(choisi);
    const autres = arbres.filter(a => a.id !== arbre.id);
    if (!autres.length) { toast("Créez d'abord un autre arbre (menu ⋮ → Nouvel arbre)"); return; }
    $('#lg-pont-titre').textContent = `Relier ${d.data['first name']} à un autre arbre`;
    f.arbre.innerHTML = autres.map(a => `<option value="${a.id}">${echapper(a.name)}</option>`).join('');
    const charger = async () => {
      f.personne.innerHTML = '<option value="">Chargement…</option>';
      try {
        const r = await api('GET', `/trees/${f.arbre.value}`), prenom = (d.data['first name'] || '').toLowerCase();
        const gens = (r.people || []).sort((a, b) => ((b.given_name || '').toLowerCase() === prenom) - ((a.given_name || '').toLowerCase() === prenom)
          || `${a.given_name} ${a.surname}`.localeCompare(`${b.given_name} ${b.surname}`, 'fr'));
        f.personne.innerHTML = gens.length ? gens.map(x => `<option value="${x.id}">${echapper(x.given_name)} ${echapper(x.surname)}${annee(x.birth_date) ? ' (' + annee(x.birth_date) + ')' : ''}</option>`).join('')
          : '<option value="">Cet arbre est vide</option>';
      } catch (err) { f.personne.innerHTML = '<option value="">Arbre inaccessible</option>'; }
    };
    f.arbre.onchange = charger; await charger();
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'ok' || !f.personne.value) return;
      try { await api('POST', `/people/${choisi}/passerelles`, { cible_id: Number(f.personne.value) }); await recharger(); toast('Pont créé entre les deux arbres'); }
      catch (err) { erreur(err); }
    };
    dlg.showModal();
  }
  // Groupes Nextcloud de l'utilisateur (pour proposer le partage)
  async function mesGroupes() {
    try {
      const uid = OC.getCurrentUser().uid;
      const r = await fetch(OC.linkToOCS('cloud/users', 2) + encodeURIComponent(uid) + '/groups?format=json', { headers: { 'OCS-APIREQUEST': 'true', requesttoken: OC.requestToken } });
      return (await r.json()).ocs?.data?.groups || [];
    } catch (e) { return []; }
  }
  async function nouvelArbre() {
    const dlg = $('#lg-nouvel-arbre'), f = $('#lg-form-nouvel-arbre');
    f.reset();
    const groupes = await mesGroupes();
    $('#lg-nouvel-arbre-groupes').innerHTML = groupes.length
      ? groupes.map(g => `<label><input type="checkbox" name="groupe" value="${echapper(g)}" ${g === 'famille' ? 'checked' : ''}> ${echapper(g)}</label>`).join('')
      : '<span class="lg-aide">Aucun groupe : l\'arbre restera privé (vous pourrez le partager plus tard).</span>';
    dlg.onclose = async () => {
      if (dlg.returnValue !== 'ok' || !f.nom.value.trim()) return;
      try {
        const cree = await api('POST', '/trees', { name: f.nom.value.trim() });
        for (const c of f.querySelectorAll('input[name="groupe"]:checked'))
          await api('POST', `/trees/${cree.id}/shares`, { share_type: 'group', share_with: c.value, permission: 'edit' });
        arbres = await api('GET', '/trees'); remplirChoix(cree.id); fermerFiche();
        await chargerArbre(cree.id); toast(`Arbre « ${cree.name} » créé`);
      } catch (err) { erreur(err); }
    };
    dlg.showModal(); f.nom.focus();
  }
  async function partager() {
    if (!estProprietaire) { toast("Seul le propriétaire de l'arbre peut le partager"); return; }
    const dlg = $('#lg-partage'), f = $('#lg-form-partage');
    $('#lg-partage-titre').textContent = `Partager « ${arbre.name} »`;
    const afficher = () => {
      $('#lg-partages').innerHTML = partages.length ? partages.map(sh => `<div class="lg-partage"><span>${sh.share_type === 'group' ? 'Groupe' : 'Utilisateur'} <strong>${echapper(sh.share_with)}</strong>
        <small>· ${sh.permission === 'edit' ? 'peut modifier' : 'peut voir'}</small></span><button type="button" class="lg-delier" data-partage="${sh.id}" title="Retirer ce partage">✕</button></div>`).join('')
        : '<p class="lg-aide">Cet arbre n\'est partagé avec personne.</p>';
    };
    afficher();
    const groupes = await mesGroupes();
    f.groupe.innerHTML = groupes.map(g => `<option value="${echapper(g)}">${echapper(g)}</option>`).join('') || '<option value="">Aucun groupe</option>';
    const rafraichir = async () => { const r = await api('GET', `/trees/${arbre.id}`); partages = r.shares || []; afficher(); };
    $('#lg-partage-ajouter').onclick = async () => {
      if (!f.groupe.value) return;
      try { await api('POST', `/trees/${arbre.id}/shares`, { share_type: 'group', share_with: f.groupe.value, permission: f.droit.value }); await rafraichir(); toast('Partage enregistré'); }
      catch (err) { erreur(err); }
    };
    $('#lg-partages').onclick = async e => {
      const b = e.target.closest('[data-partage]'); if (!b || !confirm('Retirer ce partage ?')) return;
      try { await api('DELETE', `/shares/${b.dataset.partage}`); await rafraichir(); toast('Partage retiré'); } catch (err) { erreur(err); }
    };
    dlg.showModal();
  }

  // ---- Déplacer une lignée dans un nouvel arbre (proposé sur la première génération d'une lignée)
  // Les personnes de la lignée liées à quelqu'un qui reste (un conjoint, par exemple) restent aussi dans cet arbre,
  // reliées par un pont à leur copie. Les suppressions viennent en dernier : un échec avant laisse l'arbre intact.
  function planDeplacement(lignee) {
    const membres = new Set(lignee.membres);
    const restent = new Set(donnees.map(d => d.id).filter(i => !membres.has(i)));
    const liesAuReste = new Set();
    for (const l of liens) {
      const a = String(l.person1_id), b = String(l.person2_id);
      if (membres.has(a) && restent.has(b)) liesAuReste.add(a);
      if (membres.has(b) && restent.has(a)) liesAuReste.add(b);
    }
    return { membres: [...membres], ponts: [...liesAuReste], retires: [...membres].filter(i => !liesAuReste.has(i)) };
  }
  async function deplacerLignee() {
    const lignee = ligneesNommees.find(l => l.racine.includes(String(choisi)));
    if (!peutModifier || !lignee) return;
    const plan = planDeplacement(lignee), nom = i => `${parId(i).data['first name']} ${parId(i).data['last name'] || ''}`.trim();
    const dlg = $('#lg-deplacer'), f = $('#lg-form-deplacer'), bouton = $('#lg-deplacer-action'), zone = $('#lg-deplacer-apercu');
    f.reset(); f.nom.value = `Famille ${lignee.nom}`; zone.classList.remove('lg-erreur');
    $('#lg-deplacer-titre').textContent = `Déplacer la lignée ${lignee.nom}`;
    const groupes = await mesGroupes(), dejaPartage = new Set(partages.filter(x => x.share_type === 'group').map(x => x.share_with));
    $('#lg-deplacer-groupes').innerHTML = groupes.map(g => `<label><input type="checkbox" name="groupe" value="${echapper(g)}" ${dejaPartage.has(g) || (!dejaPartage.size && g === 'famille') ? 'checked' : ''}> ${echapper(g)}</label>`).join('')
      || '<span class="lg-aide">Aucun groupe : le nouvel arbre restera privé.</span>';
    const nbEv = evenements.filter(e => plan.membres.includes(String(e.person_id))).length;
    zone.innerHTML = `<strong>${plan.membres.length}</strong> personnes copiées dans le nouvel arbre, avec leurs liens${nbEv ? ` et ${nbEv} événements` : ''} : ${plan.membres.map(i => echapper(nom(i))).join(', ')}.<br>`
      + (plan.ponts.length ? `<strong>Restent aussi ici</strong>, reliées par un pont : ${plan.ponts.map(i => echapper(nom(i))).join(', ')}.<br>` : '')
      + `<strong>Retirées de « ${echapper(arbre.name)} »</strong> : ${plan.retires.map(i => echapper(nom(i))).join(', ') || 'personne'}.`
      + (plan.membres.some(i => personne(i)?.photo_url) ? '<br><small>Les photos ne sont pas copiées.</small>' : '');
    bouton.disabled = false; bouton.textContent = 'Déplacer';
    bouton.onclick = async () => {
      if (!f.nom.value.trim()) { f.nom.reportValidity(); return; }
      bouton.disabled = true; bouton.textContent = 'Déplacement…';
      let cree = null;
      try {
        cree = await api('POST', '/trees', { name: f.nom.value.trim() });
        for (const c of f.querySelectorAll('input[name="groupe"]:checked'))
          await api('POST', `/trees/${cree.id}/shares`, { share_type: 'group', share_with: c.value, permission: 'edit' });
        const nouveaux = new Map();
        for (const i of plan.membres) {
          const brut = personne(i), corps = corpsPersonne(brut, { photo_url: '' });
          for (const k of ['birth_date', 'death_date']) corps[k] = versIso(brut[k]) || brut[k] || '';
          nouveaux.set(i, (await api('POST', `/trees/${cree.id}/people`, corps)).id);
        }
        for (const l of liens) {
          const a = nouveaux.get(String(l.person1_id)), b = nouveaux.get(String(l.person2_id));
          if (a && b) await api('POST', `/trees/${cree.id}/relationships`, { type: l.type, person1_id: a, person2_id: b });
        }
        for (const e of evenements) {
          const n = nouveaux.get(String(e.person_id));
          if (n) await api('POST', `/people/${n}/events`, { type: e.type, title: e.title, event_date: e.event_date, place: e.place, description: e.description });
        }
        for (const i of plan.ponts) await api('POST', `/people/${i}/passerelles`, { cible_id: nouveaux.get(i) });
      } catch (err) {
        if (cree) await api('DELETE', `/trees/${cree.id}`).catch(() => {});
        zone.classList.add('lg-erreur'); zone.textContent = 'Déplacement annulé, rien n\'a été modifié : ' + (err.message || err);
        bouton.disabled = false; bouton.textContent = 'Réessayer';
        return;
      }
      const echecs = [];
      for (const i of plan.retires) { try { await api('DELETE', `/people/${i}`); } catch (err) { echecs.push(nom(i)); } }
      dlg.close(); fermerFiche();
      arbres = await api('GET', '/trees'); remplirChoix(arbre.id);
      ligneeAffichee = null; await chargerArbre(arbre.id);
      toast(echecs.length ? `Lignée copiée, mais non retirées d'ici : ${echecs.join(', ')}` : `Lignée ${lignee.nom} déplacée dans « ${cree.name} »`);
    };
    dlg.showModal();
  }

  // ---- Paramètres de l'arbre (anniversaires dans un agenda, lignée automatique des conjoints)
  async function arbrePourConjoint(conjoint) {
    const nomFamille = (conjoint.surname || conjoint.given_name || '').trim();
    const nom = `Famille ${nomFamille.charAt(0).toUpperCase()}${nomFamille.slice(1).toLowerCase()}`;
    const cree = await api('POST', '/trees', { name: nom });
    for (const sh of partages.filter(x => x.share_type === 'group'))
      await api('POST', `/trees/${cree.id}/shares`, { share_type: 'group', share_with: sh.share_with, permission: sh.permission });
    const copie = await api('POST', `/trees/${cree.id}/people`, corpsPersonne(conjoint, { photo_url: '' }));
    await api('POST', `/people/${conjoint.id}/passerelles`, { cible_id: copie.id });
    arbres = await api('GET', '/trees'); remplirChoix(arbre.id);
    toast(`Arbre « ${nom} » créé pour sa famille (bouton « Voir sa lignée » dans sa fiche)`);
  }
  async function parametres() {
    const dlg = $('#lg-parametres'), f = $('#lg-form-parametres');
    let p;
    try { p = await api('GET', `/trees/${arbre.id}/parametres`); } catch (err) { erreur(err); return; }
    $('#lg-parametres-titre').textContent = `Paramètres de « ${arbre.name} »`;
    for (const k of ['anniversaires', 'deces', 'rappel', 'lignee_conjoint']) f[k].checked = !!p[k];
    const options = p.mes_agendas.map(a => `<option value="${echapper(a.uri)}">${echapper(a.nom)}</option>`);
    if (p.agenda_uri && !p.agenda_est_le_mien) options.unshift(`<option value="">Garder l'agenda de ${echapper(p.agenda_proprietaire)}</option>`);
    options.push('<option value="nouveau">Nouvel agenda…</option>');
    f.agenda_uri.innerHTML = options.join('');
    f.agenda_uri.value = p.agenda_est_le_mien && p.agenda_uri ? p.agenda_uri : (p.agenda_uri ? '' : (p.mes_agendas[0]?.uri ?? 'nouveau'));
    f.agenda_nom.value = `Anniversaires — ${arbre.name}`;
    const maj = () => {
      $('#lg-parametres-agenda').classList.toggle('lg-inactif', !f.anniversaires.checked);
      f.agenda_nom.hidden = f.agenda_uri.value !== 'nouveau';
      $('#lg-parametres-agenda-info').textContent = f.agenda_uri.value === ''
        ? `Les anniversaires vont dans un agenda de ${p.agenda_proprietaire}.`
        : 'Lignées n\'ajoute, ne modifie et ne retire que ses propres événements dans cet agenda.';
    };
    f.onchange = maj; maj();
    [...f.elements].forEach(e => { if (e.name) e.disabled = !p.peut_modifier; });
    $('#lg-parametres-ok').hidden = !p.peut_modifier;
    $('#lg-parametres-ok').onclick = async () => {
      const corps = { anniversaires: f.anniversaires.checked, deces: f.deces.checked, rappel: f.rappel.checked, lignee_conjoint: f.lignee_conjoint.checked };
      if (f.anniversaires.checked && f.agenda_uri.value) { corps.agenda_uri = f.agenda_uri.value; corps.agenda_nom = f.agenda_nom.value.trim(); }
      try {
        const r = await api('PUT', `/trees/${arbre.id}/parametres`, corps);
        parametresArbre = r.parametres; dlg.close();
        const b = r.synchronisation;
        toast(b.actif ? `Agenda à jour : ${b.ajoutes} ajouté(s), ${b.modifies} modifié(s), ${b.supprimes} retiré(s)` : 'Paramètres enregistrés');
      } catch (err) { erreur(err); }
    };
    dlg.showModal();
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
      dessiner(idCentre(), mode === 'famille' && famille ? d3.zoomTransform(famille.conteneur) : undefined);
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
    $('#lg-voir-lignee').onclick = e => {
      const b = e.currentTarget, id = choisi;
      if (b.dataset.arbre) allerVers(b.dataset.arbre, b.dataset.personne).catch(erreur);
      else { changerLignee(b.dataset.cle, id); ouvrirFiche(id); }
    };
    $('#lg-nouvel-arbre-btn').onclick = () => nouvelArbre();
    $('#lg-theme-lignee').onclick = e => { e.stopPropagation(); ouvrirPalette(); };
    $('#lg-palette').onclick = e => { e.stopPropagation(); const b = e.target.closest('[data-theme]'); if (b) choisirTheme(b.dataset.theme); };
    document.addEventListener('click', () => $('#lg-palette').classList.remove('lg-ouverte'));
    $('#lg-partage-btn').onclick = () => partager();
    $('#lg-parametres-btn').onclick = () => parametres();
    $('#lg-choix-lignee').onchange = e => { fermerFiche(); changerLignee(e.target.value, famille?.selection); };
    document.querySelectorAll('.lg-onglets button').forEach(b => { b.onclick = () => {
      document.querySelectorAll('.lg-onglets button').forEach(x => x.classList.toggle('lg-actif', x === b));
      for (const o of ['identite', 'liens', 'actions']) $('#lg-onglet-' + o).hidden = o !== b.dataset.onglet;
    }; });
    $('#lg-onglet-liens').onclick = e => {
      const x = e.target.closest('.lg-delier'); if (x) { delier(x); return; }
      const ar = e.target.closest('[data-arbre]'); if (ar) { allerVers(ar.dataset.arbre, ar.dataset.personne).catch(erreur); return; }
      const b = e.target.closest('[data-id]'); if (b) { centrer(b.dataset.id); ouvrirFiche(b.dataset.id); }
    };
    $('#lg-form-relier').type.onchange = preparerRelier;
    $('#lg-onglet-actions').onclick = e => {
      const a = e.target.closest('[data-action]')?.dataset.action; if (!a) return;
      if (a === 'centrer') centrer(choisi);
      else if (a === 'supprimer') supprimer();
      else if (a === 'relier') relier();
      else if (a === 'pont') pont();
      else if (a === 'deplacer') deplacerLignee();
      else ajouter(a);
    };
    $('#lg-photo').onchange = e => { envoyerPhoto(e.target.files[0]); e.target.value = ''; };
    $('#lg-onglet-identite').onsubmit = enregistrerFiche;
  }

  document.addEventListener('DOMContentLoaded', () => { brancher(); demarrer(); });
})();

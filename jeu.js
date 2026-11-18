// Interface de « Code secret » : menu, plateau, saisie tactile et clavier, 4 modes, sons, statistiques.
// Les règles (réponse noirs/blancs, solveur de l'ordi) sont dans regles.js.
(function () {
  'use strict';
  const R = window.Regles;

  const COULEURS = [
    { nom: 'rouge', c: '#e53935' }, { nom: 'orange', c: '#fb8c00' }, { nom: 'jaune', c: '#fdd835', clair: true },
    { nom: 'vert', c: '#43a047' }, { nom: 'bleu', c: '#1e88e5' }, { nom: 'violet', c: '#8e24aa' },
    { nom: 'cyan', c: '#4dd0e1', clair: true }, { nom: 'rose', c: '#f8a5c2', clair: true },
  ];
  const NIVEAUX = {
    classique: { trous: 4, couleurs: 6, essais: 10, repet: true },
    super: { trous: 5, couleurs: 8, essais: 12, repet: true },
    expert: { trous: 6, couleurs: 8, essais: 12, repet: true },
  };
  const MODES = ['solo', 'defi', 'ordi', 'duo'];

  const $ = (id) => document.getElementById(id);
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    if (tag === 'button') e.type = 'button';
    return e;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  function duree(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; }

  // Stockage local : peut être bloqué (navigation privée), le jeu marche alors sans mémoire.
  const memo = {
    lire(k, defaut) {
      try { const v = localStorage.getItem('codesecret:' + k); return v == null ? defaut : JSON.parse(v); } catch { return defaut; }
    },
    ecrire(k, v) { try { localStorage.setItem('codesecret:' + k, JSON.stringify(v)); } catch { /* pas de stockage */ } },
    effacer(k) { try { localStorage.removeItem('codesecret:' + k); } catch { /* idem */ } },
  };

  let S = { phase: 'menu' };
  let chrono = 0, minuteur = 0;
  const cacheTous = new Map();

  // ---------------------------------------------------------------- Menu
  const modeChoisi = () => document.querySelector('input[name="mode"]:checked').value;

  function majMenu() {
    const mode = modeChoisi(), match = mode === 'ordi' || mode === 'duo';
    $('bloc-joueurs').hidden = !match;
    $('champ-nom2').hidden = mode !== 'duo';
    $('lbl-nom1').textContent = mode === 'ordi' ? 'Ton nom' : 'Joueur 1';
    $('bloc-reglages').hidden = mode === 'defi';
    const note = $('note-defi');
    note.hidden = mode !== 'defi';
    const fait = memo.lire('defi:' + cleJour(), null);
    note.textContent = fait && fait.fini
      ? 'Défi du jour déjà joué : tu peux revoir ton résultat. Nouveau code demain !'
      : 'Réglages classiques (4 pions, 6 couleurs, 10 essais). Le même code pour tout le monde aujourd\'hui ; ta partie est gardée si tu quittes.';
    $('btn-jouer').textContent = mode === 'defi' && fait && fait.fini ? 'Voir mon résultat' : 'Jouer';
  }

  function appliquerNiveau() {
    const n = NIVEAUX[$('preset').value];
    if (!n) return;
    $('trous').value = n.trous; $('couleurs').value = n.couleurs; $('essais').value = n.essais; $('repet').checked = n.repet;
  }
  function niveauCorrespondant() {
    const cfg = lireReglages();
    const nom = Object.keys(NIVEAUX).find((k) => Object.keys(cfg).every((c) => NIVEAUX[k][c] === cfg[c]));
    $('preset').value = nom || 'perso';
  }
  function lireReglages() {
    return { trous: +$('trous').value, couleurs: +$('couleurs').value, essais: +$('essais').value, repet: $('repet').checked };
  }

  function choisir(id, valeur) { const s = $(id); s.value = String(valeur); if (!s.value) s.selectedIndex = 0; }
  function restaurerMenu() {
    const m = memo.lire('menu', null);
    if (!m || typeof m !== 'object') return;
    if (MODES.includes(m.mode)) document.querySelector(`input[name="mode"][value="${m.mode}"]`).checked = true;
    if (typeof m.nom1 === 'string') $('nom1').value = m.nom1.slice(0, 14);
    if (typeof m.nom2 === 'string') $('nom2').value = m.nom2.slice(0, 14);
    choisir('manches', m.manches); choisir('trous', m.trous); choisir('couleurs', m.couleurs); choisir('essais', m.essais);
    $('repet').checked = m.repet !== false;
    $('possibles').checked = !!m.possibles;
    $('chiffres').checked = m.chiffres !== false;
    niveauCorrespondant();
  }
  function sauverMenu() {
    memo.ecrire('menu', { mode: modeChoisi(), nom1: $('nom1').value, nom2: $('nom2').value, manches: $('manches').value,
      ...lireReglages(), possibles: $('possibles').checked, chiffres: $('chiffres').checked });
  }

  function demarrer() {
    sauverMenu();
    const mode = modeChoisi();
    const nom1 = $('nom1').value.trim() || 'Joueur 1';
    let nom2 = $('nom2').value.trim() || 'Joueur 2';
    if (nom2 === nom1) nom2 += ' (2)';
    S = {
      mode, cfg: mode === 'defi' ? { ...NIVEAUX.classique } : lireReglages(),
      manche: 0, manches: +$('manches').value, points: [0, 0],
      joueurs: mode === 'ordi' ? [{ nom: nom1 }, { nom: 'L\'ordi', ordi: true }] : [{ nom: nom1 }, { nom: nom2 }],
      possibles: $('possibles').checked,
    };
    document.body.classList.toggle('sans-chiffres', !$('chiffres').checked);
    nouvelleManche();
  }

  function allerMenu() {
    const enCours = ['jeu', 'compose', 'ordi', 'passe'].includes(S.phase) && S.mode !== 'defi'
      && (S.lignes.length > 0 || S.manche > 0 || S.phase !== 'jeu');
    if (enCours && !confirm('Quitter la partie en cours ?')) return;
    arreter();
    S.phase = 'menu';
    majMenu();
    montrer('ecran-menu');
  }

  function montrer(id) {
    for (const e of document.querySelectorAll('.ecran')) e.hidden = e.id !== id;
    $('btn-menu').hidden = id === 'ecran-menu';
  }

  // ---------------------------------------------------------------- Déroulement
  const estMatch = () => S.mode === 'ordi' || S.mode === 'duo';
  const nom = (i) => S.joueurs[i].nom;
  const chercheur = () => (estMatch() ? 1 - S.codeur : 0);
  const humainCherche = () => !estMatch() || !S.joueurs[chercheur()].ordi;
  const saisieActive = () => S.phase === 'jeu' || S.phase === 'compose';

  function tous() {
    const k = `${S.cfg.trous}-${S.cfg.couleurs}-${S.cfg.repet}`;
    if (!cacheTous.has(k)) cacheTous.set(k, R.tousLesCodes(S.cfg.trous, S.cfg.couleurs, S.cfg.repet));
    return cacheTous.get(k);
  }
  function candidats() {
    if (!S.candidats) S.candidats = S.lignes.reduce((c, l) => R.compatibles(c, l.essai, l), tous());
    return S.candidats;
  }
  function viderSaisie() { S.saisie = new Array(S.cfg.trous).fill(null); S.curseur = 0; }
  function arreter() { clearInterval(chrono); clearTimeout(minuteur); chrono = minuteur = 0; }

  function nouvelleManche() {
    arreter();
    // Manche 1 : le joueur 2 (ou l'ordi) cache, le joueur 1 cherche ; puis on alterne.
    Object.assign(S, { lignes: [], code: null, candidats: null, aides: 0, debut: 0, duree: 0, trouve: false, fin: null,
      codeur: (S.manche + 1) % 2, vite: false });
    viderSaisie();
    signaler('');
    const { trous, couleurs, repet } = S.cfg;
    if (S.mode === 'solo') { S.code = R.codeAuHasard(trous, couleurs, repet); return chercher(); }
    if (S.mode === 'defi') return lancerDefi();
    if (S.joueurs[S.codeur].ordi) { S.code = R.codeAuHasard(trous, couleurs, repet); return chercher(); }
    if (S.mode === 'duo') {
      return passer(`Manche ${S.manche + 1} sur ${S.manches}`,
        `${nom(S.codeur)} cache un code. ${nom(chercheur())}, ne regarde pas l'écran !`,
        `Je suis ${nom(S.codeur)}, je cache mon code`, composer);
    }
    composer();
  }

  function passer(titre, texte, bouton, suite) {
    arreter();
    S.phase = 'passe';
    $('passe-titre').textContent = titre;
    $('passe-texte').textContent = texte;
    const b = $('btn-passe');
    b.textContent = bouton;
    b.onclick = suite;
    montrer('ecran-passe');
    b.focus();
  }

  function composer() {
    S.phase = 'compose';
    viderSaisie();
    montrer('ecran-jeu');
    dessiner();
    signaler(S.cfg.repet ? 'Compose ton code, puis « Cacher ce code ».' : 'Compose ton code (chaque couleur une seule fois).');
  }

  function chercher() {
    S.phase = 'jeu';
    if (!S.debut) S.debut = Date.now();
    montrer('ecran-jeu');
    dessiner();
    clearInterval(chrono);
    chrono = setInterval(majInfo, 1000);
  }

  function lancerOrdi() {
    S.phase = 'ordi';
    S.candidats = tous();
    montrer('ecran-jeu');
    dessiner();
    minuteur = setTimeout(coupOrdi, 900);
  }

  function coupOrdi() {
    jouerEssai(R.prochainEssai(S.candidats, tous(), S.cfg.repet));
    if (S.phase === 'ordi') minuteur = setTimeout(coupOrdi, S.vite ? 250 : 1300);
  }

  function jouerEssai(essai) {
    const r = R.evaluer(essai, S.code);
    S.lignes.push({ essai, noirs: r.noirs, blancs: r.blancs });
    if (S.candidats) S.candidats = R.compatibles(S.candidats, essai, r);
    S.revele = S.lignes.length - 1;
    son('valider');
    if (S.mode === 'defi') sauverDefi(false);
    if (r.noirs === S.cfg.trous) finManche(true);
    else if (S.lignes.length >= S.cfg.essais) finManche(false);
    else dessiner();
  }

  // ---------------------------------------------------------------- Saisie
  function poser(c) {
    if (!saisieActive() || c >= S.cfg.couleurs) return;
    S.saisie[S.curseur] = c;
    S.dernierPose = S.curseur;
    const n = S.saisie.length;
    let suivant = -1;
    for (let d = 1; d <= n; d++) { const k = (S.curseur + d) % n; if (S.saisie[k] == null) { suivant = k; break; } }
    S.curseur = suivant >= 0 ? suivant : Math.min(S.curseur + 1, n - 1);
    son('poser');
    signaler('');
    dessiner();
  }

  function effacer() {
    if (!saisieActive()) return;
    if (S.saisie[S.curseur] == null) {
      for (let k = S.curseur - 1; k >= 0; k--) if (S.saisie[k] != null) { S.curseur = k; break; }
    }
    S.saisie[S.curseur] = null;
    dessiner();
  }

  function deplacer(d) {
    if (!saisieActive()) return;
    S.curseur = (S.curseur + d + S.cfg.trous) % S.cfg.trous;
    dessiner();
  }

  function recopier(r) {
    if (S.phase !== 'jeu') return;
    S.saisie = S.lignes[r].essai.slice();
    S.curseur = 0;
    signaler(`Rangée ${r + 1} recopiée : modifie-la puis valide.`);
    dessiner();
  }

  function suggerer() {
    if (S.phase !== 'jeu' || S.mode !== 'solo') return;
    S.saisie = R.prochainEssai(candidats(), tous(), S.cfg.repet).slice();
    S.curseur = 0;
    S.aides++;
    signaler(`Suggestion de l'ordi (${pluriel(candidats().length, 'code')} encore possible${candidats().length > 1 ? 's' : ''}).`);
    dessiner();
  }

  function valider() {
    if (!saisieActive()) return;
    const manque = S.saisie.filter((c) => c == null).length;
    if (manque) return signaler(`Il manque ${pluriel(manque, 'pion')}.`, true);
    const code = S.saisie.slice();
    viderSaisie();
    if (S.phase === 'compose') {
      if (!S.cfg.repet && R.aDesRepetitions(code)) { S.saisie = code; return signaler('Chaque couleur une seule fois dans ce réglage.', true); }
      S.code = code;
      son('valider');
      signaler('');
      if (S.joueurs[chercheur()].ordi) return lancerOrdi();
      return passer('Code caché !', `Passe l'appareil à ${nom(chercheur())}.`, `Je suis ${nom(chercheur())}, je cherche`, chercher);
    }
    signaler('');
    jouerEssai(code);
  }

  // ---------------------------------------------------------------- Fin de manche
  function finManche(trouve, dejaJoue) {
    arreter();
    S.phase = 'fin';
    S.trouve = trouve;
    if (!dejaJoue) S.duree = S.debut ? Date.now() - S.debut : 0;
    const n = S.lignes.length;
    let titre, texte;
    const boutons = [];
    if (!estMatch()) {
      titre = trouve ? `Bravo ! Trouvé en ${pluriel(n, 'essai')}.` : 'Perdu… voici le code.';
      texte = `Temps : ${duree(S.duree)}`;
      if (S.aides) texte += ` · ${pluriel(S.aides, 'suggestion')}`;
      if (S.mode === 'solo') {
        if (!dejaJoue) enregistrerStats(trouve, n, S.duree);
        const s = memo.lire('stats', {})[cleCfg(S.cfg)];
        if (s) texte += `\n${pluriel(s.victoires, 'victoire')} sur ${pluriel(s.parties, 'partie')} · série : ${s.serie}`;
        boutons.push(['Rejouer', nouvelleManche, true], ['Changer les réglages', allerMenu]);
      } else {
        if (!dejaJoue) finDefi(trouve);
        texte += `\nSérie de défis réussis : ${pluriel(serieDefi(), 'jour')}. Nouveau code demain.`;
        boutons.push(['Partager', partagerDefi, true], ['Menu', allerMenu]);
      }
    } else {
      const codeur = S.codeur, ch = chercheur(), pts = R.pointsCodeur(n, trouve);
      S.points[codeur] += pts;
      titre = trouve ? `${nom(ch)} trouve en ${pluriel(n, 'essai')}.` : `${nom(ch)} ne trouve pas !`;
      texte = `${nom(codeur)} marque ${pluriel(pts, 'point')}${trouve ? '' : ' (dont 1 de bonus)'}.`;
      S.manche++;
      if (S.manche < S.manches) {
        boutons.push(['Manche suivante', nouvelleManche, true]);
      } else {
        const [a, b] = S.points;
        texte += a === b ? `\nFin du match : égalité ${a} à ${b} !` : `\nFin du match : ${nom(a > b ? 0 : 1)} gagne ${Math.max(a, b)} à ${Math.min(a, b)} !`;
        boutons.push(['Revanche', revanche, true], ['Menu', allerMenu]);
      }
    }
    S.fin = { titre, texte, boutons };
    if (humainCherche()) { son(trouve ? 'gagne' : 'perd'); if (trouve && !dejaJoue) confettis(); } else son('fin');
    montrer('ecran-jeu');
    dessiner();
  }

  function revanche() { S.manche = 0; S.points = [0, 0]; nouvelleManche(); }

  // ---------------------------------------------------------------- Défi du jour
  function cleJour(decalage = 0) {
    const d = new Date();
    d.setDate(d.getDate() + decalage);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const codeValide = (e) => Array.isArray(e) && e.length === 4 && e.every((c) => Number.isInteger(c) && c >= 0 && c < 6);

  function lancerDefi() {
    S.jour = cleJour();
    S.code = R.codeAuHasard(4, 6, true, R.hasard(Math.imul(Number(S.jour.replace(/-/g, '')), 2654435761)));
    const sauve = memo.lire('defi:' + S.jour, null);
    if (sauve && Array.isArray(sauve.essais)) {
      for (const e of sauve.essais.filter(codeValide).slice(0, S.cfg.essais)) {
        const r = R.evaluer(e, S.code);
        S.lignes.push({ essai: e, noirs: r.noirs, blancs: r.blancs });
      }
      S.debut = Number(sauve.debut) || Date.now();
      S.duree = Number(sauve.duree) || 0;
      if (sauve.fini) return finManche(!!sauve.trouve, true);
    }
    chercher();
  }

  function sauverDefi(fini) {
    memo.ecrire('defi:' + S.jour, { essais: S.lignes.map((l) => l.essai), debut: S.debut, duree: S.duree, fini, trouve: S.trouve });
  }

  function finDefi(trouve) {
    sauverDefi(true);
    const s = memo.lire('defi-serie', { serie: 0, meilleure: 0, dernier: '' });
    s.serie = trouve ? (s.dernier === cleJour(-1) ? s.serie + 1 : 1) : 0;
    s.meilleure = Math.max(s.meilleure || 0, s.serie);
    if (trouve) s.dernier = S.jour;
    memo.ecrire('defi-serie', s);
  }

  function serieDefi() {
    const s = memo.lire('defi-serie', { serie: 0, dernier: '' });
    return s.dernier === cleJour() || s.dernier === cleJour(-1) ? s.serie : 0;
  }

  async function partagerDefi() {
    const jour = new Date().toLocaleDateString('fr-FR');
    const grille = S.lignes.map((l) => '⚫'.repeat(l.noirs) + '⚪'.repeat(l.blancs) + '▫️'.repeat(4 - l.noirs - l.blancs)).join('\n');
    const texte = `Code secret · défi du ${jour} · ${S.trouve ? S.lignes.length : 'X'}/${S.cfg.essais}\n${grille}`;
    try {
      if (navigator.share) { await navigator.share({ text: texte }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
      await navigator.clipboard.writeText(texte);
    } catch {
      const t = el('textarea');
      t.value = texte;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    signaler('Résultat copié : colle-le dans un message.');
  }

  // ---------------------------------------------------------------- Statistiques (solo)
  const cleCfg = (c) => `${c.trous}-${c.couleurs}-${c.essais}-${c.repet ? 'r' : 's'}`;

  function enregistrerStats(trouve, n, ms) {
    const toutes = memo.lire('stats', {});
    const s = toutes[cleCfg(S.cfg)] || { parties: 0, victoires: 0, essais: 0, meilleur: 0, temps: 0, serie: 0, meilleureSerie: 0 };
    s.parties++;
    if (trouve) {
      s.victoires++;
      s.essais += n;
      s.meilleur = s.meilleur ? Math.min(s.meilleur, n) : n;
      s.temps = s.temps ? Math.min(s.temps, ms) : ms;
      s.serie++;
      s.meilleureSerie = Math.max(s.meilleureSerie, s.serie);
    } else s.serie = 0;
    toutes[cleCfg(S.cfg)] = s;
    memo.ecrire('stats', toutes);
  }

  function ouvrirStats() {
    const corps = $('stats-corps');
    corps.replaceChildren();
    const bloc = (titre, valeurs) => {
      const d = el('div', 'stat'), dl = el('dl');
      d.append(el('h4', '', titre), dl);
      for (const [k, v] of valeurs) dl.append(el('dt', '', k), el('dd', '', String(v)));
      corps.append(d);
    };
    const s = memo.lire('defi-serie', { serie: 0, meilleure: 0 });
    const auj = memo.lire('defi:' + cleJour(), null);
    bloc('📅 Défi du jour', [
      ['Aujourd\'hui', auj && auj.fini ? (auj.trouve ? `trouvé en ${auj.essais.length}` : 'raté') : 'à jouer'],
      ['Série', serieDefi()], ['Meilleure série', s.meilleure || 0]]);
    const toutes = memo.lire('stats', {});
    const cles = Object.keys(toutes);
    if (!cles.length) corps.append(el('p', 'note', 'Aucune partie solo terminée pour l\'instant.'));
    for (const k of cles) {
      const [t, c, e, r] = k.split('-'), x = toutes[k];
      bloc(`🎯 ${t} pions · ${c} couleurs · ${e} essais${r === 's' ? ' · sans répétition' : ''}`, [
        ['Parties', x.parties], ['Gagnées', `${Math.round((100 * x.victoires) / Math.max(1, x.parties))} %`],
        ['Moyenne', x.victoires ? (x.essais / x.victoires).toFixed(1).replace('.', ',') + ' essais' : '–'],
        ['Meilleur', x.meilleur ? pluriel(x.meilleur, 'essai') : '–'], ['Meilleur temps', x.temps ? duree(x.temps) : '–'],
        ['Série', `${x.serie} (max ${x.meilleureSerie})`]]);
    }
    if (!$('dlg-stats').open) $('dlg-stats').showModal();
  }

  // ---------------------------------------------------------------- Dessin
  function pion(c, cls) {
    const p = el('span', 'pion' + (COULEURS[c].clair ? ' clair' : '') + (cls ? ' ' + cls : ''), String(c + 1));
    p.style.setProperty('--c', COULEURS[c].c);
    p.setAttribute('aria-hidden', 'true');
    return p;
  }
  const nomsCouleurs = (code) => code.map((c) => COULEURS[c].nom).join(', ');
  const retourTexte = (l) => `${pluriel(l.noirs, 'noir')}, ${pluriel(l.blancs, 'blanc')}`;

  function trousSaisie() {
    return S.saisie.map((c, k) => {
      const b = el('button', 'trou' + (k === S.curseur ? ' curseur' : ''));
      b.setAttribute('aria-label', `Trou ${k + 1} : ${c == null ? 'vide' : COULEURS[c].nom}${k === S.curseur ? ' (choisi)' : ''}`);
      if (c != null) b.append(pion(c, k === S.dernierPose ? 'pose' : ''));
      b.onclick = () => {
        if (S.curseur === k && S.saisie[k] != null) S.saisie[k] = null;
        S.curseur = k;
        dessiner();
      };
      return b;
    });
  }

  function retour(ligne, anime) {
    const box = el('div', 'retour');
    for (let k = 0; k < S.cfg.trous; k++) {
      const type = !ligne ? '' : k < ligne.noirs ? ' noir' : k < ligne.noirs + ligne.blancs ? ' blanc' : '';
      const f = el('span', 'fb' + type + (anime && type ? ' apparait' : ''));
      if (anime) f.style.animationDelay = `${150 + k * 110}ms`;
      box.append(f);
    }
    if (ligne) { box.setAttribute('role', 'img'); box.setAttribute('aria-label', retourTexte(ligne)); } else box.setAttribute('aria-hidden', 'true');
    return box;
  }

  function dessinerSecret() {
    const { phase } = S, trous = $('secret-trous');
    $('secret-etiquette').textContent = { compose: 'Ton code', jeu: 'Code', ordi: 'Ton code', fin: 'Le code' }[phase] || '';
    trous.replaceChildren();
    if (phase === 'compose') { trous.append(...trousSaisie()); return; }
    for (let k = 0; k < S.cfg.trous; k++) {
      if (phase === 'jeu') trous.append(el('span', 'cache', '?'));
      else {
        const p = pion(S.code[k], phase === 'fin' ? 'revele' : '');
        p.style.animationDelay = `${k * 90}ms`;
        trous.append(p);
      }
    }
    $('secret').setAttribute('aria-label', phase === 'jeu' ? 'Code secret caché' : `Code : ${nomsCouleurs(S.code)}`);
  }

  function dessinerRangees() {
    const ol = $('rangees');
    ol.replaceChildren();
    ol.hidden = S.phase === 'compose';
    if (ol.hidden) return;
    const courante = S.phase === 'jeu' ? S.lignes.length : -1;
    for (let r = 0; r < S.cfg.essais; r++) {
      const ligne = S.lignes[r];
      const li = el('li', 'rangee' + (r === courante ? ' courante' : ligne ? '' : ' future'));
      li.append(el('span', 'num', String(r + 1)));
      let trous;
      if (ligne) {
        trous = el(S.phase === 'jeu' ? 'button' : 'div', 'trous');
        for (const c of ligne.essai) trous.append(pion(c));
        const etiquette = `Essai ${r + 1} : ${nomsCouleurs(ligne.essai)}. ${retourTexte(ligne)}.`;
        if (S.phase === 'jeu') {
          trous.title = 'Recopier cette rangée';
          trous.setAttribute('aria-label', etiquette + ' Recopier.');
          trous.onclick = () => recopier(r);
        } else li.setAttribute('aria-label', etiquette);
      } else {
        trous = el('div', 'trous');
        if (r === courante) trous.append(...trousSaisie());
        else for (let k = 0; k < S.cfg.trous; k++) trous.append(el('span', 'trou'));
      }
      li.append(trous, retour(ligne, r === S.revele));
      ol.append(li);
    }
    // Faire défiler jusqu'à la rangée utile quand un essai vient d'être joué ou que l'écran change.
    if (S.revele >= 0 || S.phase !== S.phaseDessinee) {
      const cible = ol.children[courante >= 0 ? courante : Math.max(0, S.lignes.length - 1)];
      if (cible) cible.scrollIntoView({ block: 'nearest' });
    }
  }

  function dessinerPalette() {
    const p = $('palette');
    if (Number(p.dataset.n) === S.cfg.couleurs) return; // reconstruire seulement si besoin : garde le focus clavier
    p.dataset.n = S.cfg.couleurs;
    p.replaceChildren();
    for (let c = 0; c < S.cfg.couleurs; c++) {
      const b = el('button');
      b.setAttribute('aria-label', `${COULEURS[c].nom} (touche ${c + 1})`);
      b.title = `${COULEURS[c].nom} (${c + 1})`;
      b.append(pion(c));
      b.onclick = () => poser(c);
      p.append(b);
    }
  }

  function dessinerFin() {
    const f = $('fin');
    f.hidden = S.phase !== 'fin';
    if (f.hidden) return;
    $('fin-titre').textContent = S.fin.titre;
    $('fin-texte').textContent = S.fin.texte;
    const b = $('fin-boutons');
    b.replaceChildren();
    for (const [txt, action, principal] of S.fin.boutons) {
      const x = el('button', principal ? 'principal' : 'secondaire', txt);
      x.onclick = action;
      b.append(x);
    }
    b.firstChild.focus({ preventScroll: true });
  }

  function majInfo() {
    if (!S.cfg) return;
    const { phase, cfg } = S;
    const essai = Math.min(S.lignes.length + (phase === 'jeu' ? 1 : 0), cfg.essais);
    let gauche;
    if (S.mode === 'solo') gauche = `Essai ${essai}/${cfg.essais}`;
    else if (S.mode === 'defi') gauche = `Défi du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · essai ${essai}/${cfg.essais}`;
    else {
      const role = phase === 'compose' ? `${nom(S.codeur)} cache son code` : `${nom(chercheur())} cherche`;
      gauche = `Manche ${S.phase === 'fin' ? S.manche : S.manche + 1}/${S.manches} · ${role}`; // en fin de manche, S.manche est déjà passé à la suivante
    }
    const droite = [];
    if (phase === 'ordi' || (phase === 'jeu' && S.possibles)) {
      const n = candidats().length;
      droite.push(`${n} code${n > 1 ? 's' : ''} possible${n > 1 ? 's' : ''}`);
    }
    if ((phase === 'jeu' || phase === 'fin') && humainCherche() && S.debut) droite.push('⏱ ' + duree(phase === 'fin' ? S.duree : Date.now() - S.debut));
    $('info-gauche').textContent = gauche;
    $('info-droite').textContent = droite.join(' · ');
    const score = $('score');
    score.hidden = !estMatch();
    if (estMatch()) {
      score.replaceChildren();
      S.joueurs.forEach((j, i) => {
        const s = el('span', i === S.codeur && S.manche < S.manches ? 'actif' : '', j.nom);
        s.append(el('b', '', String(S.points[i])));
        score.append(s);
      });
    }
  }

  function dessiner() {
    const jeu = $('ecran-jeu');
    jeu.style.setProperty('--n', S.cfg.trous);
    jeu.style.setProperty('--nc', S.cfg.couleurs);
    jeu.style.setProperty('--rc', Math.ceil(S.cfg.trous / 2));
    majInfo();
    dessinerSecret();
    dessinerRangees();
    const saisie = saisieActive();
    $('palette').hidden = !saisie;
    $('commandes').hidden = !saisie;
    $('btn-suggestion').hidden = !(S.phase === 'jeu' && S.mode === 'solo');
    $('btn-valider').textContent = S.phase === 'compose' ? 'Cacher ce code' : 'Valider';
    $('ordi-console').hidden = S.phase !== 'ordi';
    $('btn-vite').hidden = S.vite;
    dessinerPalette();
    dessinerFin();
    S.phaseDessinee = S.phase;
    S.dernierPose = -1;
    S.revele = -1;
  }

  function signaler(txt, erreur) {
    const m = $('message');
    m.textContent = txt;
    m.classList.toggle('erreur', !!erreur);
    if (!erreur) return;
    son('erreur');
    const rangee = S.phase === 'compose' ? $('secret') : document.querySelector('.rangee.courante');
    if (rangee) { rangee.classList.remove('secoue'); void rangee.offsetWidth; rangee.classList.add('secoue'); }
  }

  // ---------------------------------------------------------------- Sons et confettis
  let audio = null;
  const SONS = {
    poser: [[660, 0.05]], valider: [[520, 0.07], [780, 0.09]], erreur: [[180, 0.14]], fin: [[440, 0.12], [550, 0.18]],
    gagne: [[523, 0.12], [659, 0.12], [784, 0.12], [1047, 0.3]], perd: [[392, 0.16], [330, 0.16], [262, 0.32]],
  };
  function son(type) {
    if (!memo.lire('son', true)) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      let t = audio.currentTime + 0.01;
      for (const [f, d] of SONS[type]) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(audio.destination);
        o.start(t);
        o.stop(t + d + 0.02);
        t += d * 0.9;
      }
    } catch { /* pas de son disponible */ }
  }
  function majSon() {
    const actif = memo.lire('son', true);
    $('btn-son').textContent = actif ? '🔊' : '🔇';
    $('btn-son').setAttribute('aria-pressed', String(actif));
  }

  function confettis() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < 70; i++) {
      const c = el('span', 'confetti');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = COULEURS[i % COULEURS.length].c;
      c.style.setProperty('--dx', Math.random() * 160 - 80 + 'px');
      c.style.setProperty('--r', Math.random() * 900 - 450 + 'deg');
      c.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
      c.style.animationDelay = Math.random() * 0.3 + 's';
      document.body.append(c);
      setTimeout(() => c.remove(), 3600);
    }
  }

  // ---------------------------------------------------------------- Branchements
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (!saisieActive()) return;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || ''); // rangée du haut sans Maj sur un clavier AZERTY
    const n = m ? Number(m[1]) : Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= S.cfg.couleurs) poser(n - 1);
    else if (e.key === 'Backspace' || e.key === 'Delete') effacer();
    else if (e.key === 'Enter') valider();
    else if (e.key === 'ArrowLeft') deplacer(-1);
    else if (e.key === 'ArrowRight') deplacer(1);
    else return;
    e.preventDefault();
  });

  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', majMenu));
  $('preset').addEventListener('change', appliquerNiveau);
  for (const id of ['trous', 'couleurs', 'essais', 'repet']) $(id).addEventListener('change', niveauCorrespondant);
  $('form-menu').addEventListener('submit', (e) => { e.preventDefault(); demarrer(); });
  $('btn-menu').onclick = allerMenu;
  $('btn-regles').onclick = () => $('dlg-regles').showModal();
  $('btn-stats').onclick = ouvrirStats;
  $('btn-son').onclick = () => { memo.ecrire('son', !memo.lire('son', true)); majSon(); son('poser'); };
  $('btn-effacer').onclick = effacer;
  $('btn-valider').onclick = valider;
  $('btn-suggestion').onclick = suggerer;
  $('btn-vite').onclick = () => { S.vite = true; $('btn-vite').hidden = true; };
  $('btn-raz').onclick = () => {
    if (!confirm('Effacer toutes les statistiques ?')) return;
    memo.effacer('stats');
    memo.effacer('defi-serie');
    ouvrirStats();
  };

  restaurerMenu();
  majMenu();
  majSon();
  window.CodeSecret = { etat: () => S }; // pour les essais automatiques
})();

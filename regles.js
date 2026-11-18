// Règles et solveur de « Code secret » (principe du Mastermind) : logique pure, sans affichage.
// Utilisé par jeu.js dans le navigateur et par test-regles.js sous Node.
(function (racine) {
  'use strict';

  const MAX_COULEURS = 10;
  const BUDGET = 3e6; // nombre d'évaluations au-delà duquel le solveur renonce au minimax (reste fluide sur téléphone)
  const ce = new Int8Array(MAX_COULEURS), cc = new Int8Array(MAX_COULEURS);

  // Réponse codée sur un entier : noirs × 10 + blancs (rapide pour le solveur).
  function cle(essai, code) {
    ce.fill(0); cc.fill(0);
    let noirs = 0;
    for (let i = 0; i < code.length; i++) {
      if (essai[i] === code[i]) noirs++;
      else { ce[essai[i]]++; cc[code[i]]++; }
    }
    let blancs = 0;
    for (let c = 0; c < MAX_COULEURS; c++) blancs += ce[c] < cc[c] ? ce[c] : cc[c];
    return noirs * 10 + blancs;
  }

  // Noirs = bonne couleur à la bonne place ; blancs = bonne couleur mal placée.
  // Chaque pion du code ne compte qu'une fois : c'est ce qui règle le cas des couleurs répétées.
  function evaluer(essai, code) {
    if (essai.length !== code.length) throw new Error('Essai et code de longueurs différentes');
    const k = cle(essai, code);
    return { noirs: Math.floor(k / 10), blancs: k % 10 };
  }

  // Suite pseudo-aléatoire reproductible (mulberry32) : même graine, même code (défi du jour).
  function hasard(graine) {
    let a = graine >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function codeAuHasard(trous, couleurs, repetitions, rnd = Math.random) {
    if (!repetitions && couleurs < trous) throw new Error('Pas assez de couleurs pour un code sans répétition');
    const dispo = Array.from({ length: couleurs }, (_, i) => i), code = [];
    while (code.length < trous) {
      const i = Math.floor(rnd() * dispo.length);
      code.push(dispo[i]);
      if (!repetitions) dispo.splice(i, 1);
    }
    return code;
  }

  function aDesRepetitions(code) { return new Set(code).size !== code.length; }

  // Tous les codes possibles, dans l'ordre (0 0 0 0, 0 0 0 1, …).
  function tousLesCodes(trous, couleurs, repetitions) {
    const res = [], code = new Array(trous);
    (function remplir(i) {
      if (i === trous) { res.push(code.slice()); return; }
      for (let c = 0; c < couleurs; c++) {
        if (!repetitions && code.slice(0, i).includes(c)) continue;
        code[i] = c;
        remplir(i + 1);
      }
    })(0);
    return res;
  }

  // Codes qui auraient donné la même réponse à cet essai.
  function compatibles(candidats, essai, retour) {
    const k = retour.noirs * 10 + retour.blancs;
    return candidats.filter((c) => cle(essai, c) === k);
  }

  // Ouverture de Knuth généralisée : 0 0 1 1 (2 2).
  function premierEssai(trous) { return Array.from({ length: trous }, (_, i) => Math.floor(i / 2)); }

  // Essai suivant de l'ordinateur : minimax de Knuth (l'essai dont la pire réponse laisse le moins de codes,
  // de préférence un code encore possible) tant que le calcul reste court, sinon un code encore possible au hasard.
  function prochainEssai(candidats, tous, repetitions, rnd = Math.random) {
    if (candidats.length <= 2) return candidats[0];
    if (repetitions && candidats.length === tous.length) return premierEssai(tous[0].length);
    let pool;
    if (tous.length * candidats.length <= BUDGET) pool = tous;
    else if (candidats.length * candidats.length <= BUDGET) pool = candidats;
    else return candidats[Math.floor(rnd() * candidats.length)];
    const possibles = new Set(candidats.map(String));
    const compte = new Int32Array(100);
    let meilleur = null, pire = Infinity, meilleurPossible = false;
    for (const g of pool) {
      compte.fill(0);
      let max = 0;
      for (const c of candidats) {
        const k = cle(g, c);
        compte[k]++;
        if (compte[k] > max) { max = compte[k]; if (max > pire) break; }
      }
      if (max > pire) continue;
      const possible = possibles.has(String(g));
      if (max < pire || (possible && !meilleurPossible)) { meilleur = g; pire = max; meilleurPossible = possible; }
    }
    return meilleur;
  }

  // Règle officielle à deux : le codeur marque 1 point par essai du chercheur, +1 si le code n'est pas trouvé.
  function pointsCodeur(essaisUtilises, trouve) { return essaisUtilises + (trouve ? 0 : 1); }

  const api = { evaluer, hasard, codeAuHasard, aDesRepetitions, tousLesCodes, compatibles, prochainEssai, pointsCodeur };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.Regles = api;
})(this);

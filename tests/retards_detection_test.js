// Détection des retards / sorties non pointées — fonctions RÉELLES importées du MÊME module que l'edge
// function (supabase/functions/check-retards/detection.mjs). Aucune réimplémentation : pas de jumeau qui dérive.
// Couvre : fuseau (CET/CEST + bascule de jour), seuil, non-répétition, indispo validée ignorée,
// créneau à cheval sur minuit, résolution (heure réelle + durée exacte / absence).
const path = require('path');

(async () => {
  const M = await import(path.join(__dirname, '..', 'supabase', 'functions', 'check-retards', 'detection.mjs'));
  const { parisLocal, hmToMin, finMinutes, dowLundi0, daysBetween,
          findArrivee, aPointeArrivee, estIgnore, decideRetard, decideSortie, resolveRetard } = M;

  let ok = true;
  const t = (l, c) => { console.log((c ? 'PASS' : 'FAIL') + ' · ' + l); ok = c && ok; };

  // Helpers de construction
  const cfg = (o = {}) => ({ actif: true, seuil_minutes: 15, plage_debut: '06:00', plage_fin: '23:59',
                             alerte_sortie_oubliee: false, sortie_grace_minutes: 30, ...o });
  const now = (iso) => parisLocal(iso);

  // ── FUSEAU (piège récurrent : pointages UTC, planning heure locale) ──
  t('CET hiver : 08:30Z → 09:30 Paris', (() => { const p = parisLocal('2026-01-15T08:30:00Z'); return p.date === '2026-01-15' && p.minutes === 9 * 60 + 30; })());
  t('CEST été : 08:30Z → 10:30 Paris', (() => { const p = parisLocal('2026-07-15T08:30:00Z'); return p.date === '2026-07-15' && p.minutes === 10 * 60 + 30; })());
  t('bascule de jour été : 22:30Z 14/07 → 00:30 Paris 15/07', (() => { const p = parisLocal('2026-07-14T22:30:00Z'); return p.date === '2026-07-15' && p.minutes === 30; })());
  t('bascule de jour hiver : 23:30Z 14/01 → 00:30 Paris 15/01', (() => { const p = parisLocal('2026-01-14T23:30:00Z'); return p.date === '2026-01-15' && p.minutes === 30; })());
  t('dowLundi0 : 2026-07-20 = lundi (0)', dowLundi0('2026-07-20') === 0);
  t('dowLundi0 : 2026-07-19 = dimanche (6)', dowLundi0('2026-07-19') === 6);
  t('daysBetween : 14→15 juillet = 1', daysBetween('2026-07-14', '2026-07-15') === 1);

  // ── SEUIL ──
  const cMidi = { date: '2026-07-20', service: 'midi', heure_debut: '11:00', heure_fin: '15:00', salarie_id: 'S1', restaurant_id: 'R1' };
  const base = { creneau: cMidi, pointages: [], dispos: [], alternance: [], cfg: cfg(), existingRetard: null };
  t('seuil : 11:10 (< 15 min) → pas encore', decideRetard({ ...base, now: now('2026-07-20T09:10:00Z') }).alert === false); // 09:10Z = 11:10 Paris
  t('seuil : 11:14 → pas encore', decideRetard({ ...base, now: now('2026-07-20T09:14:00Z') }).reason === 'pas_encore');
  t('seuil : 11:15 (pile seuil) → RETARD', decideRetard({ ...base, now: now('2026-07-20T09:15:00Z') }).alert === true);
  t('seuil : 11:30 → retard 30 min', decideRetard({ ...base, now: now('2026-07-20T09:30:00Z') }).retardMinutes === 30);

  // ── DÉJÀ POINTÉ EN AVANCE (n'est pas un retard) ──
  const arr1050 = [{ type: 'arrivee', ts: '2026-07-20T08:50:00Z', salarie_id: 'S1', restaurant_id: 'R1' }]; // 10:50 Paris
  t('pointé à 10:50 (avance) → aucune alerte même à 11:30', decideRetard({ ...base, pointages: arr1050, now: now('2026-07-20T09:30:00Z') }).reason === 'deja_pointe');
  t('arrivée à un AUTRE resto ne compte pas', decideRetard({ ...base, pointages: [{ type: 'arrivee', ts: '2026-07-20T08:50:00Z', restaurant_id: 'R2' }], now: now('2026-07-20T09:30:00Z') }).alert === true);

  // ── NON-RÉPÉTITION (le cœur de la garantie « une seule alerte par créneau ») ──
  t('retard déjà enregistré → aucune nouvelle alerte', decideRetard({ ...base, existingRetard: { id: 'x' }, now: now('2026-07-20T10:00:00Z') }).reason === 'deja_alerte');

  // ── ABSENCE JUSTIFIÉE IGNORÉE ──
  const dispoValidee = [{ salarie_id: 'S1', statut: 'indispo', statut_demande: 'validee', type: 'ponctuelle', date_specifique: '2026-07-20' }];
  t('indispo ponctuelle VALIDÉE ce jour → ignoré', decideRetard({ ...base, dispos: dispoValidee, now: now('2026-07-20T09:30:00Z') }).reason === 'absence_justifiee');
  const dispoAttente = [{ salarie_id: 'S1', statut: 'indispo', statut_demande: 'en_attente', type: 'ponctuelle', date_specifique: '2026-07-20' }];
  t('indispo NON validée (en_attente) → alerte quand même', decideRetard({ ...base, dispos: dispoAttente, now: now('2026-07-20T09:30:00Z') }).alert === true);
  const dispoRecLundi = [{ salarie_id: 'S1', statut: 'indispo', statut_demande: 'validee', type: 'recurrente', jour_semaine: 0 }]; // lundi
  t('indispo récurrente validée le lundi (créneau un lundi) → ignoré', estIgnore({ dispos: dispoRecLundi, alternance: [], creneau: cMidi }) === true);
  const dispoRecMardi = [{ salarie_id: 'S1', statut: 'indispo', statut_demande: 'validee', type: 'recurrente', jour_semaine: 1 }];
  t('indispo récurrente le mardi n\'affecte pas un créneau du lundi', estIgnore({ dispos: dispoRecMardi, alternance: [], creneau: cMidi }) === false);
  t('indispo partielle 08:00-10:00 ne couvre pas un début à 11:00', estIgnore({ dispos: [{ salarie_id: 'S1', statut: 'indispo', statut_demande: 'validee', type: 'ponctuelle', date_specifique: '2026-07-20', heure_debut: '08:00', heure_fin: '10:00' }], alternance: [], creneau: cMidi }) === false);
  t('alternance école ce jour → ignoré', estIgnore({ dispos: [], alternance: [{ date: '2026-07-20', type: 'ecole' }], creneau: cMidi }) === true);

  // ── PLAGE / ACTIF / JOUR ──
  t('config inactive → aucune alerte', decideRetard({ ...base, cfg: cfg({ actif: false }), now: now('2026-07-20T09:30:00Z') }).reason === 'inactif');
  t('hors plage (plage 06:00-10:00, il est 11:30) → pas d\'alerte', decideRetard({ ...base, cfg: cfg({ plage_fin: '10:00' }), now: now('2026-07-20T09:30:00Z') }).reason === 'hors_plage');
  t('créneau d\'un autre jour → pas aujourd\'hui', decideRetard({ ...base, now: now('2026-07-21T09:30:00Z') }).reason === 'pas_aujourdhui');

  // ── SORTIE NON POINTÉE, dont créneau SOIR à cheval sur minuit ──
  const cSoir = { date: '2026-07-20', service: 'soir', heure_debut: '18:00', heure_fin: '00:30', salarie_id: 'S1', restaurant_id: 'R1' };
  t('finMinutes 18:00→00:30 = 1470 (J+1)', finMinutes('18:00', '00:30') === 1470);
  t('finMinutes 11:00→15:00 = 900 (même jour)', finMinutes('11:00', '15:00') === 900);
  const arrSoir = [{ type: 'arrivee', ts: '2026-07-20T15:55:00Z', restaurant_id: 'R1' }]; // 17:55 Paris
  const cfgSortie = cfg({ alerte_sortie_oubliee: true });
  // il est 01:15 Paris le 21 (23:15Z le 20) : fin+grace = 1470+30=1500 ; nowRel = 1440+75 = 1515 ≥ 1500
  t('soir à cheval sur minuit, pas de sortie à 01:15 → sortie oubliée', decideSortie({ creneau: cSoir, pointages: arrSoir, now: now('2026-07-20T23:15:00Z'), cfg: cfgSortie, existingSortie: null }).alert === true);
  const arrEtSortie = arrSoir.concat([{ type: 'sortie', ts: '2026-07-20T22:40:00Z', restaurant_id: 'R1' }]); // 00:40 Paris le 21
  t('sortie pointée à 00:40 (J+1, après l\'arrivée) → pas d\'alerte', decideSortie({ creneau: cSoir, pointages: arrEtSortie, now: now('2026-07-20T23:15:00Z'), cfg: cfgSortie, existingSortie: null }).reason === 'sortie_ok');
  t('jamais arrivé → pas une sortie oubliée (c\'est un retard/absence)', decideSortie({ creneau: cSoir, pointages: [], now: now('2026-07-20T23:15:00Z'), cfg: cfgSortie, existingSortie: null }).reason === 'jamais_arrive');
  t('avant fin+grace (23:00 Paris) → pas encore', decideSortie({ creneau: cSoir, pointages: arrSoir, now: now('2026-07-20T21:00:00Z'), cfg: cfgSortie, existingSortie: null }).reason === 'pas_encore');
  t('sortie oubliée désactivée dans la config → jamais d\'alerte', decideSortie({ creneau: cSoir, pointages: arrSoir, now: now('2026-07-20T23:15:00Z'), cfg: cfg(), existingSortie: null }).reason === 'desactive');

  // ── RÉSOLUTION (heure réelle + durée exacte pour usage disciplinaire) ──
  const rowOuvert = { date: '2026-07-20', heure_prevue: '11:00', restaurant_id: 'R1', statut: 'en_retard' };
  const arr1145 = [{ type: 'arrivee', ts: '2026-07-20T09:45:00Z', restaurant_id: 'R1' }]; // 11:45 Paris
  const res = resolveRetard(rowOuvert, arr1145, now('2026-07-20T10:00:00Z'));
  t('résolution : arrivée 11:45 → statut arrive, retard 45 min exact', res && res.statut === 'arrive' && res.retard_minutes === 45);
  t('résolution : pas d\'arrivée le lendemain → absent', (() => { const r = resolveRetard(rowOuvert, [], now('2026-07-21T10:00:00Z')); return r && r.statut === 'absent' && r.retard_minutes === null; })());
  t('résolution : journée en cours, pas d\'arrivée → non résolu (null)', resolveRetard(rowOuvert, [], now('2026-07-20T12:00:00Z')) === null);

  console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FAIL harness crash:', e); process.exit(1); });

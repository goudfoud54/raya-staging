// detection.mjs — LOGIQUE PURE de détection des retards / sorties non pointées.
// SOURCE UNIQUE : importée telle quelle par l'edge function (Deno) ET par le harnais Node (tests).
// Aucune dépendance runtime hors `Intl` (présent dans Deno et Node full-ICU). Aucun accès réseau/DB ici.
//
// Rappels des pièges de ce projet, traités ci-dessous :
//  - Fuseau : pointages en UTC, planning en heure locale → parisLocal() convertit via Intl (DST correct).
//  - Fin ≤ début ⇒ service à cheval sur minuit (J+1, +1440 min) → finMinutes().
//  - « Une seule alerte par créneau » = décidé ICI (decideRetard/decideSortie via existingRetard),
//    l'index unique en base n'est qu'un garde-fou anti-course.

// ── Conversions temps ──────────────────────────────────────────────────────

// Instant UTC ISO → heure locale Europe/Paris. Renvoie {date:'YYYY-MM-DD', hh, mm, minutes}.
export function parisLocal(tsIso) {
  const d = tsIso instanceof Date ? tsIso : new Date(tsIso);
  const fmt = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p = {};
  for (const part of fmt.formatToParts(d)) p[part.type] = part.value;
  let hh = parseInt(p.hour, 10);
  if (hh === 24) hh = 0;                         // certains ICU rendent 24:00 à minuit
  const mm = parseInt(p.minute, 10);
  return { date: `${p.year}-${p.month}-${p.day}`, hh, mm, minutes: hh * 60 + mm };
}

// 'HH:MM[:SS]' → minutes depuis minuit local. null si vide.
export function hmToMin(hm) {
  if (!hm) return null;
  const [h, m] = String(hm).split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

// Fin d'un créneau en minutes depuis minuit du JOUR DE DÉBUT. Fin ≤ début ⇒ J+1 (+1440).
export function finMinutes(debut, fin) {
  const d = hmToMin(debut), f = hmToMin(fin);
  if (d == null || f == null) return null;
  return f <= d ? f + 1440 : f;
}

// Jour de semaine 0=lundi..6=dimanche, calculé depuis la CHAÎNE (indépendant du fuseau du process).
export function dowLundi0(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

// Nombre de jours calendaires entre deux dates 'YYYY-MM-DD' (d - ref), sans fuseau.
export function daysBetween(refDate, d) {
  const [ry, rm, rd] = String(refDate).split('-').map(Number);
  const [y, m, dd] = String(d).split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, dd) - Date.UTC(ry, rm - 1, rd)) / 86400000);
}

// Position d'un pointage en « minutes depuis minuit du jour de référence » (peut dépasser 1440 → J+1).
export function relOf(p, refDate) {
  const pl = parisLocal(p.ts);
  return daysBetween(refDate, pl.date) * 1440 + pl.minutes;
}

// ── Pointages ──────────────────────────────────────────────────────────────

// Première arrivée du jour `date` sur ce restaurant. Renvoie {pointage, rel} ou null.
export function findArrivee(pointages, date, restaurantId) {
  let best = null, bestRel = null;
  for (const p of (pointages || [])) {
    if (p.type !== 'arrivee') continue;
    if (restaurantId && p.restaurant_id && p.restaurant_id !== restaurantId) continue;
    const r = relOf(p, date);
    if (r >= 0 && r < 1440 && (bestRel == null || r < bestRel)) { best = p; bestRel = r; }
  }
  return best ? { pointage: best, rel: bestRel } : null;
}

export function aPointeArrivee(pointages, creneau) {
  return findArrivee(pointages, creneau.date, creneau.restaurant_id) != null;
}

// Y a-t-il une sortie APRÈS l'arrivée (rel > arrRel) ? Gère le service à cheval sur minuit.
export function aPointeSortie(pointages, creneau, arrRel) {
  return (pointages || []).some(p => {
    if (p.type !== 'sortie') return false;
    if (creneau.restaurant_id && p.restaurant_id && p.restaurant_id !== creneau.restaurant_id) return false;
    return relOf(p, creneau.date) > arrRel;
  });
}

// ── Absences justifiées (belt-and-suspenders : normalement aucun créneau posé) ──
// Congé / arrêt / mise à pied ne sont PAS modélisés en base : ils se traduisent par l'absence
// de créneau. On ne peut donc les détecter ici ; on couvre ce qui EST modélisé :
//  - alternance CFA (école/examen) ce jour,
//  - indisponibilité VALIDÉE couvrant le début du créneau.
export function estIgnore({ dispos, alternance, creneau }) {
  if ((alternance || []).some(a => a.date === creneau.date && (a.type === 'ecole' || a.type === 'examen'))) return true;

  const debutMin = hmToMin(creneau.heure_debut);
  const di = dowLundi0(creneau.date);
  for (const d of (dispos || [])) {
    if (d.salarie_id && creneau.salarie_id && d.salarie_id !== creneau.salarie_id) continue;
    if (d.statut !== 'indispo') continue;
    if ((d.statut_demande || 'validee') !== 'validee') continue;
    const matchJour = (d.type === 'recurrente' && d.jour_semaine === di)
                   || (d.type === 'ponctuelle' && d.date_specifique === creneau.date);
    if (!matchJour) continue;
    // Journée entière (pas d'heures) → ignore. Sinon : le début du créneau tombe-t-il dans la fenêtre ?
    const hd = hmToMin(d.heure_debut), hf = hmToMin(d.heure_fin);
    if (hd == null || hf == null) return true;
    if (debutMin == null) return true;
    if (debutMin >= hd && debutMin < hf) return true;
  }
  return false;
}

// ── Décisions (SOURCE UNIQUE, testables) ───────────────────────────────────

// Faut-il alerter un RETARD sur ce créneau, maintenant ?
// creneau {date, service, heure_debut, salarie_id, restaurant_id}
// pointages : ceux du salarié (arrivées/sorties). now = parisLocal(nowIso). cfg = ligne retard_alertes_config.
// existingRetard : ligne 'retard' déjà en base pour cette clé (→ ne pas renvoyer d'alerte).
export function decideRetard({ creneau, pointages, dispos, alternance, now, cfg, existingRetard }) {
  if (existingRetard) return { alert: false, reason: 'deja_alerte' };
  if (!cfg || cfg.actif === false) return { alert: false, reason: 'inactif' };
  const debutMin = hmToMin(creneau.heure_debut);
  if (debutMin == null) return { alert: false, reason: 'pas_heure_debut' };
  if (now.date !== creneau.date) return { alert: false, reason: 'pas_aujourdhui' };
  const pd = hmToMin(cfg.plage_debut) ?? 0, pf = hmToMin(cfg.plage_fin) ?? 1439;
  if (now.minutes < pd || now.minutes > pf) return { alert: false, reason: 'hors_plage' };
  const seuil = cfg.seuil_minutes ?? 15;
  if (now.minutes < debutMin + seuil) return { alert: false, reason: 'pas_encore' };
  if (estIgnore({ dispos, alternance, creneau })) return { alert: false, reason: 'absence_justifiee' };
  if (aPointeArrivee(pointages, creneau)) return { alert: false, reason: 'deja_pointe' };
  return { alert: true, reason: 'retard', retardMinutes: now.minutes - debutMin };
}

// Faut-il alerter une SORTIE NON POINTÉE ? (le salarié est venu mais n'a pas badgé en partant)
export function decideSortie({ creneau, pointages, now, cfg, existingSortie }) {
  if (!cfg || cfg.actif === false) return { alert: false, reason: 'inactif' };
  if (!cfg.alerte_sortie_oubliee) return { alert: false, reason: 'desactive' };
  if (existingSortie) return { alert: false, reason: 'deja_alerte' };
  const arr = findArrivee(pointages, creneau.date, creneau.restaurant_id);
  if (!arr) return { alert: false, reason: 'jamais_arrive' };  // absence/retard, pas sortie oubliée
  const finMin = finMinutes(creneau.heure_debut, creneau.heure_fin);
  if (finMin == null) return { alert: false, reason: 'pas_heure_fin' };
  const grace = cfg.sortie_grace_minutes ?? 30;
  const nowRel = daysBetween(creneau.date, now.date) * 1440 + now.minutes;
  if (nowRel < finMin + grace) return { alert: false, reason: 'pas_encore' };
  if (aPointeSortie(pointages, creneau, arr.rel)) return { alert: false, reason: 'sortie_ok' };
  return { alert: true, reason: 'sortie_oubliee', heureFinMin: finMin };
}

// ── Résolution (passe ultérieure : renseigne heure réelle + durée exacte, ou marque absent) ──
// row : ligne `retards` de type 'retard' encore ouverte {date, heure_prevue, restaurant_id}.
// Renvoie {statut, pointage_ts, retard_minutes} à écrire, ou null si rien à changer (encore ouvert).
export function resolveRetard(row, pointages, now) {
  const debutMin = hmToMin(row.heure_prevue);
  const arr = findArrivee(pointages, row.date, row.restaurant_id);
  if (arr) {
    const retard = debutMin == null ? null : Math.max(0, arr.rel - debutMin);
    return { statut: 'arrive', pointage_ts: arr.pointage.ts, retard_minutes: retard };
  }
  const nowRel = daysBetween(row.date, now.date) * 1440 + now.minutes;
  if (nowRel >= 1440) return { statut: 'absent', pointage_ts: null, retard_minutes: null }; // le lendemain, toujours rien
  return null; // journée en cours, on laisse la ligne ouverte
}

// Décision de limitation des tentatives de PIN — SOURCE UNIQUE, partagée par verify-pin et
// create-pointage. Fonction PURE : aucune E/S, aucune horloge implicite, aucun accès réseau.
// Le harnais tests/pin_ratelimit_test.js importe CE fichier — pas une recopie qui dériverait.
//
// POURQUOI
// La limitation d'origine comptait les échecs par `kiosk_id`. Cette valeur est FOURNIE PAR
// L'APPELANT (utils.js kioskId() lit un UUID dans localStorage et le recopie dans le corps de la
// requête) : en changer à chaque essai suffisait à neutraliser le compteur. Mesuré le 30/07/2026 :
// 36 PIN en service sur 10 000 combinaisons à 4 chiffres → ~278 requêtes pour tomber sur un PIN
// valide. verify-pin renvoie alors {id, nom, prenom} du salarié, donc de quoi enchaîner sur
// create-pointage et fabriquer des heures de travail.
//
// LES DIMENSIONS, de la plus précise à la plus large
//   kiosk    — fournie par l'appelant. CONSERVÉE, mais pour ce qu'elle vaut : c'est le garde-fou
//              d'usage (quelqu'un qui tape n'importe quoi sur une vraie tablette), jamais une
//              protection contre une attaque, puisque l'attaquant la contrôle.
//   salarie  — create-pointage uniquement. INESCAPABLE : fabriquer les heures d'un salarié impose
//              d'itérer les PIN contre CE salarie_id, qui est un paramètre obligatoire.
//   org / ip — INESCAPABLES, mais appliquées UNIQUEMENT aux tablettes absentes du registre.
//
// POURQUOI L'EXEMPTION DES TABLETTES CONNUES
// Un plafond d'échecs à l'échelle de l'organisation, appliqué à tout le monde, transforme une
// faille d'intégrité en bouton « empêcher trois restaurants de pointer » : il suffirait de générer
// des échecs depuis l'extérieur pour bloquer le service en plein rush. En exemptant les tablettes
// déjà enregistrées, un vrai kiosque n'est jamais concerné par ces deux plafonds — et un attaquant
// ne peut pas entrer au registre sans avoir déjà trouvé un PIN valide.
//
// CE QUI A ÉTÉ ÉCARTÉ, ET POURQUOI
// Un délai croissant sur les échecs (1 s, 2 s, 4 s…) a été envisagé. Écarté : il ne freine qu'un
// attaquant séquentiel — 278 requêtes lancées en parallèle attendent chacune de leur côté et le
// total ne bouge pas — et maintenir des connexions ouvertes est en soi un levier d'épuisement de
// ressources sur une plateforme facturée à la durée d'exécution. Le contrôle réel est le compteur
// sur une dimension inescapable ; l'exemption des tablettes connues règle le risque de blocage
// qui justifiait ce délai.

export const LIMITES = {
  KIOSK_MAX: 5,    KIOSK_FENETRE_S: 300,     // 5 échecs / 5 min sur une même tablette
  SALARIE_MAX: 5,  SALARIE_FENETRE_S: 300,   // 5 échecs / 5 min contre un même salarié
  INCONNU_MAX: 10, INCONNU_FENETRE_S: 900,   // 10 échecs / 15 min pour l'ensemble des inconnus
  RETENTION_H: 24,
};

// Adresse cliente à partir de l'en-tête x-forwarded-for.
// On prend le DERNIER élément : chaque proxy traversé AJOUTE à droite l'adresse du pair dont il a
// reçu la requête. Une valeur forgée par l'appelant reste donc à gauche et ne peut pas occuper la
// position de droite. Si la plateforme remplace l'en-tête, il n'y a qu'un élément, et c'est le bon.
// Le seul cas où cette valeur ne vaut rien est celui d'une plateforme qui laisserait passer
// l'en-tête tel quel : c'est exactement ce que le contrôle décrit dans le rapport va vérifier, et
// tant que ce n'est pas vérifié la dimension IP est désactivée par `ipFiable`.
export function ipCliente(xff, repli) {
  const chaine = String(xff || '').split(',').map(s => s.trim()).filter(Boolean);
  if (chaine.length) return chaine[chaine.length - 1];
  const r = repli == null ? '' : String(repli).trim();
  return r || null;
}

function recents(ts, fenetreS, maintenant) {
  const seuil = maintenant - fenetreS * 1000;
  return (ts || []).filter(t => typeof t === 'number' && t >= seuil).sort((a, b) => a - b);
}
function retryApresS(ts, fenetreS, maintenant) {
  return Math.max(1, Math.ceil((ts[0] + fenetreS * 1000 - maintenant) / 1000));
}

// etat = {
//   kioskConnu   : bool   — la tablette figure-t-elle dans kiosk_registry ?
//   echecsKiosk  : [ms]   — horodatages des échecs de CETTE tablette
//   echecsSalarie: [ms]   — échecs visant CE salarié (create-pointage ; [] pour verify-pin)
//   echecsOrg    : [ms]   — échecs de l'organisation venant d'appelants INCONNUS
//   echecsIp     : [ms]   — échecs de cette IP venant d'appelants INCONNUS
//   ipFiable     : bool   — la plateforme fournit-elle une IP non forgeable ?
//   maintenant   : ms
// }
// Les tableaux portent des horodatages en millisecondes ; le filtrage par fenêtre est fait ICI,
// pour que l'appelant SQL n'ait qu'une seule fenêtre à récupérer (la plus large).
export function decidePin(etat) {
  const now = etat.maintenant;

  const k = recents(etat.echecsKiosk, LIMITES.KIOSK_FENETRE_S, now);
  if (k.length >= LIMITES.KIOSK_MAX)
    return { autorise: false, motif: 'kiosk', retryApresS: retryApresS(k, LIMITES.KIOSK_FENETRE_S, now) };

  const s = recents(etat.echecsSalarie, LIMITES.SALARIE_FENETRE_S, now);
  if (s.length >= LIMITES.SALARIE_MAX)
    return { autorise: false, motif: 'salarie', retryApresS: retryApresS(s, LIMITES.SALARIE_FENETRE_S, now) };

  // Budget des appelants inconnus — ne s'applique JAMAIS à une tablette enregistrée.
  if (!etat.kioskConnu) {
    const o = recents(etat.echecsOrg, LIMITES.INCONNU_FENETRE_S, now);
    if (o.length >= LIMITES.INCONNU_MAX)
      return { autorise: false, motif: 'org', retryApresS: retryApresS(o, LIMITES.INCONNU_FENETRE_S, now) };

    if (etat.ipFiable) {
      const i = recents(etat.echecsIp, LIMITES.INCONNU_FENETRE_S, now);
      if (i.length >= LIMITES.INCONNU_MAX)
        return { autorise: false, motif: 'ip', retryApresS: retryApresS(i, LIMITES.INCONNU_FENETRE_S, now) };
    }
  }

  return { autorise: true, motif: null, retryApresS: 0 };
}

# Eatime360 / Raya — contexte projet

SaaS multi-tenant de gestion de restauration rapide. Développé par Rayan AZZI, utilisé quotidiennement dans 3 snacks réels (Raya Carnot, Grand Cœur, Lobau), **destiné à la revente à d'autres restaurateurs**.

Cette dernière phrase change beaucoup de décisions : ce qui est acceptable pour un usage interne ne l'est pas forcément pour un produit vendu à des tiers.

---

## ⚠️ IL N'Y A QU'UN SEUL ENVIRONNEMENT, ET C'EST LA PRODUCTION

Le projet Supabase **`ynnqvtfayrdteqtgxeuk`** porte le nom trompeur « raya-test ». **Ce n'est pas un environnement de test : c'est la production.** Trois restaurants y tournent au quotidien — 30 salariés actifs, des plannings publiés, des pointages en temps réel, des dossiers disciplinaires réels dont un licenciement effectif.

Le projet `cnuepnkwsvzgzitegemb` (l'ancienne production, `web.app-raya.com`) est **abandonné** : zéro créneau et zéro pointage depuis des semaines. Ne rien y faire.

Le dépôt `raya-staging` porte lui aussi un nom trompeur : c'est le code de production, déployé par GitHub Pages.

Conséquences directes, à garder présentes à l'esprit :
- **Toute migration appliquée sur `ynnqvtfayrdteqtgxeuk` est appliquée en production**, immédiatement. Pas de filet, pas d'étape de validation intermédiaire.
- **Aucune manipulation d'écriture sur les données réelles sans demande explicite.** Lecture seule par défaut.
- L'org « Groupe Raya » (`dc0a81a8-60ec-437f-8aa6-e43b8e2b1978`) contient les vrais salariés, leurs contrats, leurs plannings et leurs procédures disciplinaires. Les données de test se créent dans une organisation dédiée et se nettoient après usage.
- Un schéma cassé se voit sur les tablettes des snacks dans la minute. Préférer une migration additive et réversible à une modification en place.

Une migration risquée (suppression de colonne, changement de type, contrainte sur des données existantes) mérite d'être annoncée au patron avant application, avec ce qu'elle change et comment revenir en arrière.

**Bumper `VERSION` à chaque commit** touchant un module qui l'expose (`planning/index.html`, `salaries/index.html`, `stock/index.html`…). C'est le seul moyen pour le patron de savoir si la page ouverte dans son navigateur est à jour. Pour les kiosques, bumper aussi `sw.js CACHE_VERSION`, sinon les tablettes gardent l'ancienne version.

**Lancer la suite de tests complète et annoncer le résultat en tête de rapport** : `node tests/run.js` (exit ≠ 0 si un seul rouge). Un harnais en échec se traite ou se justifie dans le corps du rapport — jamais en note de bas de page. Historique : des rapports ont annoncé « 16/16 verts » en comptant un sous-ensemble, pendant que 4 harnais étaient cassés depuis plusieurs versions.

**Dire quand on ne sait pas.** Sur les sujets juridiques (droit du travail, facturation électronique) et sur tout ce qui finira dans un document remis à un salarié : vérifier sur source officielle (Légifrance, code.travail.gouv.fr) ou signaler le doute. Une citation d'article erronée dans un produit commercialisé est un risque en soi.

---

## Architecture

Front en HTML/JS vanille, un fichier par module, pas de build. Supabase pour la base, l'auth et les edge functions. Déploiement par GitHub Pages sur push.

```
index.html            portail (cartes de modules)
access.js             contrôle d'accès par module — SOURCE UNIQUE
planning/             moteur d'auto-fill (le module le plus complexe)
salaries/             fiches, contrats, documents, OCR
badgeuse/  kiosk/     pointage par PIN (tablette)
stock/  stock-kiosk/  inventaire + saisie terrain
haccp/  haccp-kiosk/  relevés sanitaires
finance/  facturation/
avertissements/       procédure disciplinaire
calendrier/  pilotage/  moi/  dispos/
equipe/  finance-hub/  coquilles à onglets (iframes) regroupant les modules ci-dessus
parametres/           réglages org, restaurants, permissions, utilisateurs
tests/                harnais Node — `node tests/run.js`
migrations/           SQL versionné
```

Multi-tenant : tout est scopé par `organization_id`, avec RLS. Les helpers `auth_role()`, `auth_org()`, `is_admin_or_super()` et `has_module_access()` sont en SECURITY DEFINER côté Postgres.

---

## Pièges déjà rencontrés — à ne pas refaire

Ces points ont chacun coûté un bug en production ou une régression. Ils reviennent sous des formes différentes.

**Une interface configurable qui n'est jamais lue à l'exécution.** C'est arrivé deux fois : les permissions par module (le portail masquait les cartes mais chaque page refaisait sa propre vérification de rôle), puis les contraintes individuelles des salariés (7 types saisissables dans la fiche, aucune appliquée par le planning). Quand on ajoute un réglage, vérifier qu'il est effectivement consulté là où il compte.

**Deux fonctions qui écrivent le même rendu.** `renderTable` et `recomputeAggregates` peignaient la même colonne avec des logiques différentes : le premier affichage était correct, puis toute modification de créneau réécrivait l'ancienne version. Factoriser (cf. `rowHoursCell`).

**Les règles temporelles doivent être inter-snack.** Le réflexe naturel est de lire `S.creneaux` (snack courant) ; c'est faux pour un salarié multi-snack. Utiliser `S.allCreneauxWeek`. Trois bugs successifs sont venus de là : repos quotidien, coupure, plafond d'heures.

**Les fins après minuit.** Une heure de fin ≤ heure de début signifie J+1 (+1440 minutes). L'oublier produit des calculs de repos faux de 14 heures, et laisse passer une contrainte « pas après 20:00 » sur un service finissant à 00:30.

**Compter des têtes au lieu de compter des présences simultanées.** Quatre personnes qui se relaient sur un poste ne font pas quatre personnes en même temps. Confusion corrigée à trois endroits différents (rapport, badges de jour, panneau de vérifications).

**Les colonnes ajoutées pour un usage anonyme nécessitent un GRANT explicite.** Les politiques RLS ne filtrent pas les colonnes ; sans `GRANT INSERT(col), UPDATE(col)` à `anon`, les kiosques échouent silencieusement.

**Les échecs silencieux sont pires que les pannes.** Si une migration n'est pas appliquée, mieux vaut un blocage visible qu'un enregistrement qui ne se fait pas sans message. Détecter l'absence des colonnes attendues et le dire.

**Les fuseaux horaires.** Les pointages sont en UTC, le planning en heure locale. Un harnais de test a déjà décalé des jours entiers en utilisant `toISOString()` au lieu des composantes de date locales.

---

## Le moteur de planning — principes de conception

Le module le plus travaillé, et celui où une régression coûte le plus cher.

**`checkPlacement` est la source de vérité unique** de toutes les règles de placement. Elle sert à la fois à l'auto-fill et à la saisie manuelle. Toute règle ajoutée ailleurs sera contournée par l'un des deux chemins.

**Principe directeur du solveur, énoncé par le patron :** atteindre le minimum d'heures est un objectif **secondaire**. Ne jamais dépenser de masse salariale non demandée pour y parvenir. Un salarié laissé sous son minimum, signalé clairement, est un résultat acceptable et voulu. En cas de doute, l'algorithme s'abstient et signale plutôt que d'agir.

**Ordre de la phase 3 (distribution), par coût croissant :** transfert d'heures entre salariés (coût nul) → rallonge d'un créneau existant (coût faible) → sureffectif (coût plein, désactivé par défaut, en suggestion seulement). Le déplacement d'un salarié vers un autre restaurant est également désactivé par défaut : il est gratuit en paie mais coûteux humainement.

**Deux plafonds distincts qui se ressemblent — ne jamais les fusionner « pour simplifier » :**
- *têtes ≤ cible + 1* : nombre de personnes sur un service, garde-fou contre la fragmentation des créneaux ;
- *couverture horaire* : nombre de personnes simultanément présentes sur chaque demi-heure, garde-fou contre la sur-couverture.

**La règle des 3h minimum** s'applique aux créneaux **créés**, jamais aux ajustements de bornes. Allonger quelqu'un déjà sur place de 30 minutes reste valide et souhaitable ; le faire venir pour 30 minutes ne l'est pas.

---

## Attentes sur les rapports de fin de chantier

Le patron n'est pas développeur. Il lit les rapports pour décider quoi tester et quoi corriger.

- **Résultat de la suite de tests en tête**, complet.
- **Ce qui est prouvé vs ce qui ne l'est pas.** Distinguer explicitement « testé par harnais sur le code réel » de « relu et parse-checké mais jamais exécuté en navigateur ». Cette honnêteté est appréciée et attendue.
- **Les effets de bord annoncés d'avance.** Exemple : « le compteur de salariés sous leur minimum va augmenter — c'est le correctif qui opère, pas une régression ».
- **Ce qui reste à sa charge**, séparément : migrations à appliquer, données à saisir, vérifications visuelles à faire.
- **Les choix assumés**, avec la raison. Quand une décision est discutable, la nommer plutôt que de la noyer.

---

## Effort de raisonnement

Calibrer selon la nature de la tâche, tout n'a pas besoin du même niveau :

- **Élevé** : moteur de planning, règles légales, sécurité et isolation multi-tenant, tout ce qui touche plusieurs contraintes qui interagissent.
- **Normal** : CRUD, écrans de configuration, ajustements d'interface, corrections ciblées avec cause déjà identifiée.

---

## Fichiers de suivi

- `MAJ_FUTURE.md` (dans le dossier de travail du patron, pas dans ce repo) — roadmap, idées reportées, stratégie de lancement, invariants techniques.
- `tests/README.md` — conventions des harnais, portée de chacun, comment lancer.

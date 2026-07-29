# Suite de non-régression — moteur de planning

Harnais Node en mémoire (aucune base, aucun réseau) qui **extraient les vraies fonctions** de
`planning/index.html`, `salaries/index.html` et des edge functions, puis les exécutent sur des
scénarios contrôlés. C'est le filet de sécurité du moteur (auto-fill, phase 3, checkPlacement,
contraintes, coûts…).

## Lancer la suite

```bash
node tests/run.js            # toute la suite
node tests/run.js transfer   # seulement les harnais dont le nom contient « transfer »
```

- Sortie **verte** `N/N harnais verts` → tout va bien.
- Sortie **rouge** → liste des harnais en échec + les dernières lignes d'erreur de chacun.
- Le lanceur sort en **code ≠ 0** dès qu'un seul harnais échoue (utilisable en pré-commit / CI).
- Un harnais est compté rouge s'il sort en code ≠ 0 **ou** s'il imprime `FAIL` / `SOME FAILED`
  (filet contre un vieux harnais qui oublierait `process.exit(1)`).

## Conventions (à respecter pour tout nouveau harnais)

1. **Chemins robustes** : charger la source via `require("path").join(__dirname, "..", "…")`,
   jamais un chemin absolu ni relatif au répertoire courant.
2. **Extraire le vrai code**, ne pas le réimplémenter. Utiliser `extract.js` (`extractFn`) ou le
   `grab()` local. Un stub qui **double** une vraie fonction est une dette : soit on extrait la vraie
   fonction, soit le stub porte un commentaire disant précisément ce qu'il simule et pourquoi
   (ex. `_contrainteBlocking=()=>null` = « aucune contrainte individuelle dans ce scénario »).
3. **Terminer par** `process.exit(ok?0:1)` et imprimer `ALL PASS` / `SOME FAILED`.
4. Nom du fichier en `*_test.js` (le lanceur ne prend que ceux-là).

## Cas particulier — `phase3_test.js`

Ce harnais exerce une **réplique locale** de la phase 3 (il pilote le vrai `checkPlacement` mais
réimplémente la distribution). Il ne teste donc PAS le vrai `autoFillCore`. Le vrai solveur est
couvert par les harnais à extraction réelle : `coverage_test`, `transfer_test`, `suggest_test`,
`undermin*`, `multi_undermin`, `intersnack_test`, `hayatou_test`, `p3_real_test`. À terme, fusionner
`phase3_test` dans ces harnais plutôt que de maintenir une réplique en parallèle.

## Cas particulier — accès par module (`acces_test.js` + `cas_acces.json`)

La règle de décision d'accès existe forcément **en double** : `effectiveAccess()` dans `access.js`
(navigateur) et `module_access_decide()` en Postgres (migration v6.30). Une divergence = un accès
refusé à tort, ou accordé à tort. Les deux implémentations sont donc vérifiées sur **un seul et même
jeu de cas**, `tests/cas_acces.json` (rôle seul, exception autorisant, exception refusant,
super_admin, module inconnu, permissions d'organisation, rôle vide…).

| Runner | Portée | Où |
|---|---|---|
| `tests/acces_test.js` | verdicts JS sur tous les cas + table `DEFAULT_PERMS` et ordre des règles comparés au texte SQL + câblage réel des pages | dans `node tests/run.js` (hors ligne) |
| `scripts/parite_acces_sql.js` | mêmes cas envoyés à la fonction **réellement déployée** (RPC), comparés au verdict JS | à lancer à la main, réseau requis |

**Ajouter un cas dans `cas_acces.json` le fait vérifier des deux côtés automatiquement.** Après toute
modification de la règle d'accès (l'un ou l'autre côté), lancer les DEUX.

Le runner SQL est volontairement **hors** de `run.js` : la suite est hors ligne par convention, et un
harnais qui « saute » son test quand la base est injoignable serait un trou silencieux.

`acces_test.js` contient aussi deux garde-fous structurels sur les pages du dépôt, qui sont la vraie
protection contre le motif « une interface configurable jamais lue à l'exécution » :
- aucune page n'appelle `canAccessModule` avec un **rôle nu** (les exceptions seraient ignorées) ;
- toute page qui l'appelle lit bien `module_exceptions` dans son `select` de profil (un select à
  colonnes explicites sans cette colonne donnerait `undefined` → accès accordé à tort, en silence).

## Règle de reporting

Tout rapport de chantier annonce le résultat de la suite **complète** en tête (`N/N verts` ou la
liste des échecs). Un harnais rouge est traité ou explicitement justifié dans le corps du rapport —
jamais relégué en note de bas de page.

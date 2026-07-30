# Sauvegardes — ce qui est couvert, ce qui ne l'est pas

État au 30 juillet 2026. Sources officielles Supabase citées en bas de page.

## En une phrase

Le projet est sur le plan **gratuit**, qui ne fait **aucune sauvegarde automatique**. Et même en
passant au plan payant, **les fichiers du stockage ne seront toujours pas sauvegardés** — c'est
écrit noir sur blanc dans la documentation Supabase. Ce sont les 63 Mo de contrats, pièces
d'identité et courriers disciplinaires.

## Ce que couvre chaque plan

| | Base de données | Fichiers du stockage |
|---|---|---|
| **Gratuit** (actuel) | ❌ rien | ❌ rien |
| **Pro — 25 $/mois** | ✅ sauvegarde quotidienne, 7 jours d'historique | ❌ **rien** |
| **Team** (tarif non vérifié ici) | ✅ quotidienne, 14 jours | ❌ **rien** |
| **PITR** — option ~100 $/mois en plus | ✅ restauration à la seconde près, 7 jours | ❌ **rien** |

Les durées d'historique et le tarif Pro viennent de la documentation citée en bas de page. PITR
exige en plus l'option de calcul « Small ».

La phrase qui compte, mot pour mot dans la doc Supabase :

> « Database backups do not include objects you store via the Storage API, as the database only
> includes metadata about these objects. Restoring an old backup does not restore objects you
> deleted after that backup. »

Traduction : la sauvegarde de la base contient la *fiche* du document (son nom, à quel salarié il
appartient), mais **pas le document lui-même**. Restaurer une sauvegarde rendrait donc une base qui
pointe vers des fichiers absents.

Autre point à connaître : **supprimer le projet supprime aussi toutes les sauvegardes**, y compris
celles stockées chez Supabase. Une sauvegarde qui vit uniquement chez le fournisseur ne protège pas
contre une erreur sur le compte du fournisseur.

## Ce qu'il faut faire, concrètement

**1. Les fichiers — c'est ce script, et il n'y a pas d'alternative.**

```bash
export SUPABASE_URL="https://ynnqvtfayrdteqtgxeuk.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="…"     # Dashboard › Project Settings › API › service_role
node scripts/sauvegarde-stockage.js ~/Sauvegardes/eatime360
```

Le script reprend là où il s'est arrêté : le relancer ne retélécharge que ce qui manque. Il écrit
un `manifeste.json` (chemin, taille, empreinte SHA-256 de chaque fichier) qui permet de vérifier
qu'une restauration est fidèle. **S'il sort en erreur, la sauvegarde est incomplète** — il le dit et
liste les fichiers concernés.

Deux refus volontaires, pour éviter la sauvegarde vide qui se croit réussie :
- il refuse une clé qui n'est pas `service_role` (avec la clé anonyme, le stockage répond
  « aucun bucket » sans erreur, et la sauvegarde serait vide sans le dire) ;
- il refuse d'écrire dans un dossier situé sous un dépôt git — **le dépôt de ce projet est public**,
  y déposer des pièces d'identité les publierait.

**2. La base de données — pas couvert par ce script.**

Sujet distinct, à traiter séparément : `supabase db dump`. Tant que ce n'est pas fait, passer au
plan Pro reste le moyen le plus simple d'avoir un filet sur la base.

**3. Ne pas envoyer ça n'importe où.**

Ce sont des données personnelles sensibles au sens du RGPD (pièces d'identité, procédures
disciplinaires). Le script écrit en local et n'envoie rien nulle part, volontairement. Un envoi
automatique vers un service tiers est une décision à prendre en connaissance de cause, pas un
réglage par défaut.

## Sources

- [Database Backups — Supabase](https://supabase.com/docs/guides/platform/backups)
- [Deleting Your Project — Supabase](https://supabase.com/docs/guides/platform/delete-project)
- [Backup and Restore using the CLI — Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

# check-retards

Détection des retards & sorties non pointées (écart planning ↔ pointages), déclenchée toutes les 5 min
par pg_cron (`trigger_check_retards`, cf. `migrations/v6.25_cron_retards.sql`).

## ⚠️ Module partagé — risque de dérive
`detection.mjs` est la **source unique** de la logique de détection : il est importé à la fois par
`index.ts` (edge, Deno) **et** par le harnais Node `tests/retards_detection_test.js`.

Le harnais teste la copie du dépôt ; la fonction déployée tourne sur une copie envoyée à Supabase.
**Après toute modification de `detection.mjs`, il faut redéployer la fonction** (avec `index.ts` +
`detection.mjs`), sinon les tests passent au vert alors que la fonction en production reste sur l'ancienne
logique. Vérifier l'égalité octet-pour-octet entre le fichier du dépôt et la version déployée.

## Secrets attendus (à poser côté hébergement)
- `VAPID_KEYS` : paire de clés VAPID au format JWK `{ publicKey, privateKey }` (push web). Sans elle,
  le push salarié renvoie `{skipped:'no_vapid'}` — aucun envoi, aucune erreur bloquante.
- `VAPID_SUBJECT` : `mailto:...` du contact VAPID.
- `RESEND_API_KEY` / `ALERT_FROM_EMAIL` : envoi email de secours (déjà utilisés par check-stock-alerts).

La clé **publique** VAPID (embarquée dans `moi/index.html`, `PUSH_PUBLIC_KEY`) doit correspondre à la
paire posée dans `VAPID_KEYS`.

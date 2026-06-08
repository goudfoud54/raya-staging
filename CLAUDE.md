# Eatime360 — Brief pour Claude Code

SaaS multi-tenant de gestion de restaurants. HTML/JS statique servi par GitHub Pages, backend Supabase (Auth + Postgres + Storage + Edge Functions + RLS).

## Stack
- **Front** : HTML/JS pur, Supabase JS SDK depuis CDN, pas de build step.
- **Backend** : Supabase project TEST `ynnqvtfayrdteqtgxeuk` (TOUJOURS travailler sur celui-là, jamais PROD `cnuepnkwsvzgzitegemb` sans validation explicite).
- **Edge functions** (Deno) : `assistant-chat` (agent IA Mistral), `import-contrat-ai`, `check-stock-alerts`.
- **Repo GitHub** : `goudfoud54/raya-staging`, déploiement auto via GitHub Pages sur la branche `main`.

## Workflow local
1. `python3 -m http.server 8000` à la racine du repo
2. Ouvrir `http://localhost:8000` (auth Supabase fonctionne en local car les RLS sont sur le projet TEST distant)
3. Modifier, recharger Cmd+R, tester
4. Quand validé : `git add -A && git commit -m "..." && git push`

## Règles strictes
- **JAMAIS** modifier la DB PROD `cnuepnkwsvzgzitegemb` sans demander d'abord
- **JAMAIS** désactiver une RLS policy sans valider l'impact multi-tenant
- **JAMAIS** créer un fichier `.md` non demandé ailleurs que dans `/staging/` ou la racine du projet
- **TOUJOURS** incrémenter la version du footer dans `index.html` après chaque modif visible
- **TOUJOURS** ajouter un cache buster `?v=X.Y` aux scripts modifiés pour bypasser le cache GitHub Pages
- **TOUJOURS** isoler par organization_id (multi-tenant strict)

## Modules en place
- /salaries/ : fiches RH (avec OCR pré-remplissage contrat, agent IA conversationnel)
- /planning/ : grille hebdo
- /badgeuse/ + /stock-kiosk/ + /haccp-kiosk/ : kiosques PIN salarié
- /moi/ : espace salarié mobile (planning, indispos, pointages, tâches)
- /haccp/ /stock/ /facturation/ /finance/ /parametres/
- /calendrier/ : RH (auto events depuis contrats)
- /avertissements/ : sanctions disciplinaires + génération PDF (admin only)
- /pilotage/ : Kanban tâches équipe

## Tests
Pas de framework de test automatisé pour l'instant. Validation manuelle via navigateur en local.

## Versions
La version actuelle est dans le footer de `index.html`. Format : `vMAJEURE.MINEURE`. Incrémenter à chaque changement visible.

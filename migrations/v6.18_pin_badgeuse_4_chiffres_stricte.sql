-- v6.18 — PIN badgeuse restreint à EXACTEMENT 4 chiffres (fini le 4-6 hérité du S11).
-- Vérifié avant migration : les 11 salariés avec un pin_badgeuse non nul sont déjà tous à 4
-- chiffres (le seul code à 6 chiffres, celui de Kalifa, a été régénéré manuellement en 4 chiffres
-- avant cette migration). Aucune donnée modifiée ici — uniquement une contrainte bloquante pour
-- l'avenir (toute tentative d'insert/update avec un PIN de longueur différente échouera en base,
-- même si un bug côté client ou un outil externe — ex. tool-call IA — l'avait laissé passer).
alter table public.salaries
  add constraint salaries_pin_badgeuse_4_digits
  check (pin_badgeuse is null or pin_badgeuse ~ '^[0-9]{4}$');

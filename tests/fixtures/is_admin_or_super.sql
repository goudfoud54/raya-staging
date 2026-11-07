-- Définition de public.is_admin_or_super() relevée en PRODUCTION (pg_get_functiondef, 2026-11-07).
-- Elle n'est dans aucun fichier de migration du dépôt : ce relevé sert de référence à
-- tests/haccp_archivage_test.js, qui vérifie que EatimeAccess.ROLES_ADMIN (access.js) dit la même chose.
-- Si la fonction change en base, mettre ce fichier à jour EN MÊME TEMPS qu'access.js.
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select role in ('admin','super_admin') from profiles where id = auth.uid()
$function$

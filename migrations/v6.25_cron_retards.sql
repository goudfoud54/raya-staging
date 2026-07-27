-- v6.25 — Cron des alertes de retard : appelle l'edge function check-retards toutes les 5 minutes.
-- Calqué sur trigger_check_stock_alerts (pg_cron + pg_net déjà activés sur le projet).
-- INOFFENSIF tant qu'aucune retard_alertes_config n'est actif=true : la fonction ne fait alors rien.
-- Un SEUL job (contrairement aux deux jobs CET/CEST du stock) : la fonction calcule elle-même l'heure
-- locale Europe/Paris et respecte la plage horaire de chaque config, donc pas besoin de doubler.

create or replace function public.trigger_check_retards()
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_url  text := 'https://ynnqvtfayrdteqtgxeuk.supabase.co/functions/v1/check-retards';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlubnF2dGZheXJkdGVxdGd4ZXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4OTE1MTQsImV4cCI6MjA5NTQ2NzUxNH0._mfVAGexu7ew38UQk6adn42az4Gt_J3ePxR6O6wuWHc';
begin
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_anon)
  );
end$function$;

-- (Ré)ordonnancement idempotent : on retire un éventuel job homonyme avant de planifier.
do $$
begin
  perform cron.unschedule('check_retards_5min');
exception when others then null;
end$$;

select cron.schedule('check_retards_5min', '*/5 * * * *', $$select public.trigger_check_retards()$$);

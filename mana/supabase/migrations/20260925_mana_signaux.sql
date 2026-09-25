-- Signaux calculés chaque nuit par la fonction surveiller-collectes (moteur src/lib/signaux.ts).
-- Appliquée le 25/09/2026 (migration « mana_signaux_surveillance »).
create table if not exists public.mana_signaux (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cle text not null,
  type text not null,
  niveau text not null check (niveau in ('info', 'attention', 'alerte')),
  societe_id text,
  magasin_id text,
  collecteur text,
  titre text not null,
  detail jsonb not null default '{}'::jsonb,
  statut text not null default 'ouvert' check (statut in ('ouvert', 'traite', 'ignore', 'resolu')),
  ouvert_le timestamptz not null default now(),
  mis_a_jour_le timestamptz not null default now(),
  resolu_le timestamptz,
  traite_le timestamptz,
  traite_par text,
  note text
);
-- Un seul signal vivant par clé et par compte ; l'historique garde les signaux résolus.
create unique index if not exists mana_signaux_vivant on public.mana_signaux (user_id, cle) where resolu_le is null;
create index if not exists mana_signaux_statut on public.mana_signaux (statut, niveau, mis_a_jour_le desc);

alter table public.mana_signaux enable row level security;
create policy signaux_lecture on public.mana_signaux for select
  using ((select auth.uid()) = user_id or public.mana_a_acces(user_id) or public.mana_est_admin());
create policy signaux_maj_admin on public.mana_signaux for update
  using (public.mana_est_admin()) with check (public.mana_est_admin());

-- Journal des passages du moteur.
create table if not exists public.mana_surveillances (
  id uuid primary key default gen_random_uuid(),
  commencee_le timestamptz not null default now(),
  terminee_le timestamptz,
  declencheur text not null default 'cron',
  comptes int not null default 0,
  signaux_ouverts int not null default 0,
  nouveaux int not null default 0,
  resolus int not null default 0,
  erreurs jsonb not null default '[]'::jsonb
);
alter table public.mana_surveillances enable row level security;
create policy surveillances_lecture_admin on public.mana_surveillances for select using (public.mana_est_admin());

-- Passage nocturne : 3 h 10 UTC (4 h 10 / 5 h 10 à Paris), même mécanique que la tâche Pennylane.
select cron.schedule(
  'mana-surveiller-collectes',
  '10 3 * * *',
  $$
  select net.http_post(
    url     := 'https://wygptxqkptuabdefonhe.supabase.co/functions/v1/surveiller-collectes',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
               ),
    body    := '{"declencheur":"cron"}'::jsonb
  );
  $$
);

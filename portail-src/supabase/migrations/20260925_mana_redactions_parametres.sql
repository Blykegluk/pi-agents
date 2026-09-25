-- Semaine 5 : apprentissage du style. Chaque mail consigné garde la version proposée par
-- Mana et la version envoyée par l'équipe ; les règles de style vivent dans mana_parametres.
-- Appliquée le 25/09/2026 (migration « mana_redactions_parametres »).
create table if not exists public.mana_redactions (
  id uuid primary key default gen_random_uuid(),
  admin_email text not null,
  genre text not null,
  demande_id uuid references public.mana_demandes(id) on delete set null,
  propose_objet text not null default '',
  propose_corps text not null default '',
  envoye_objet text not null default '',
  envoye_corps text not null default '',
  cree_le timestamptz not null default now()
);
alter table public.mana_redactions enable row level security;
create policy redactions_admin_lecture on public.mana_redactions for select using (public.mana_est_admin());
create policy redactions_admin_ecriture on public.mana_redactions for insert with check (public.mana_est_admin());

create table if not exists public.mana_parametres (
  cle text primary key,
  valeur jsonb not null default '{}'::jsonb,
  maj_le timestamptz not null default now(),
  maj_par text
);
alter table public.mana_parametres enable row level security;
create policy parametres_admin_lecture on public.mana_parametres for select using (public.mana_est_admin());
create policy parametres_admin_insertion on public.mana_parametres for insert with check (public.mana_est_admin());
create policy parametres_admin_maj on public.mana_parametres for update using (public.mana_est_admin()) with check (public.mana_est_admin());

-- Semaine 2 : dossiers de résolution. Un signal de passages manqués ouvre un fil « suivi »
-- (demande créée par Mana) dans lequel le client répond et où Mana consigne ses relances.
-- Appliquée le 25/09/2026 (migration « mana_suivi_collecte »).
alter table public.mana_demandes drop constraint if exists mana_demandes_type_check;
alter table public.mana_demandes add constraint mana_demandes_type_check
  check (type = any (array['collecte'::text, 'support'::text, 'association'::text, 'suivi'::text]));

drop policy if exists demandes_creation_admin on public.mana_demandes;
create policy demandes_creation_admin on public.mana_demandes for insert
  with check (public.mana_est_admin() and type = 'suivi');

alter table public.mana_signaux add column if not exists demande_id uuid references public.mana_demandes(id) on delete set null;
create index if not exists mana_signaux_demande on public.mana_signaux (demande_id);

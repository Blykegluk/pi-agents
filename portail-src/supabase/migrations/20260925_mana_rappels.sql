-- Semaine 4 : rappels au responsable de magasin (bordereau d'hier non saisi, relevé du mois),
-- postés par la surveillance nocturne dans un fil « Rappels » par magasin. Un rappel par clé.
-- Appliquée le 25/09/2026 (migration « mana_rappels »).
create table if not exists public.mana_rappels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  magasin_id text not null,
  cle text not null,
  type text not null,
  demande_id uuid references public.mana_demandes(id) on delete set null,
  canal text not null default 'messages',
  envoye_le timestamptz not null default now(),
  unique (user_id, cle)
);
alter table public.mana_rappels enable row level security;
create policy rappels_lecture on public.mana_rappels for select
  using ((select auth.uid()) = user_id or public.mana_a_acces(user_id) or public.mana_est_admin());
alter table public.mana_surveillances add column if not exists rappels int not null default 0;

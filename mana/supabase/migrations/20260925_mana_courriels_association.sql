-- Semaine 6 : courrier. File d'attente des e-mails automatiques (expédiés dès que le domaine
-- et la clé Resend sont configurés) et réponses des associations dans les fils de suivi.
-- Appliquée le 25/09/2026 (migration « mana_courriels_association »).
create table if not exists public.mana_courriels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  demande_id uuid references public.mana_demandes(id) on delete set null,
  destinataire text not null,
  objet text not null,
  corps text not null,
  genre text not null,
  repondre_a text,
  statut text not null default 'en_attente' check (statut in ('en_attente', 'envoye', 'erreur', 'desactive')),
  erreur text,
  id_externe text,
  cree_le timestamptz not null default now(),
  envoye_le timestamptz
);
create index if not exists mana_courriels_statut on public.mana_courriels (statut, cree_le);
alter table public.mana_courriels enable row level security;
create policy courriels_lecture on public.mana_courriels for select
  using ((select auth.uid()) = user_id or public.mana_est_admin());

alter table public.mana_messages drop constraint if exists mana_messages_auteur_check;
alter table public.mana_messages add constraint mana_messages_auteur_check
  check (auteur = any (array['client'::text, 'mana'::text, 'association'::text]));
alter table public.mana_messages add column if not exists origine jsonb;
alter table public.mana_surveillances add column if not exists courriels int not null default 0;

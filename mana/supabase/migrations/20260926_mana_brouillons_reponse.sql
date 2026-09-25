-- Réponses préparées par Mana aux messages des clients.
-- À chaque message client, la fonction preparer-reponse rédige une réponse ; l'équipe la valide
-- telle quelle, la corrige ou l'écarte. L'écart entre proposé et envoyé mesure la qualité, et
-- l'envoi autonome ne s'ouvre qu'une fois ce taux atteint (voir mana_parametres « reponse_auto »).
create table if not exists public.mana_brouillons_reponse (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references public.mana_demandes(id) on delete cascade,
  message_id uuid references public.mana_messages(id) on delete set null,
  user_id uuid not null,
  message_client text not null default '',
  texte text not null default '',
  confiance text not null default 'basse' check (confiance in ('haute', 'moyenne', 'basse')),
  a_valider boolean not null default true,
  raison text not null default '',
  -- propose : attend l'équipe ; envoye : validé tel quel ; corrige : envoyé après retouche ;
  -- ecarte : non utilisé ; remplace : dépassé par un message plus récent ou une réponse écrite à la main ;
  -- auto : envoyé seul par Mana.
  statut text not null default 'propose' check (statut in ('propose', 'envoye', 'corrige', 'ecarte', 'remplace', 'auto')),
  texte_envoye text,
  ecart numeric,
  modele text,
  cree_le timestamptz not null default now(),
  traite_le timestamptz,
  traite_par text
);
create unique index if not exists mana_brouillons_reponse_message on public.mana_brouillons_reponse (message_id) where message_id is not null;
create index if not exists mana_brouillons_reponse_demande on public.mana_brouillons_reponse (demande_id, cree_le desc);
alter table public.mana_brouillons_reponse enable row level security;
drop policy if exists brouillons_reponse_admin_lecture on public.mana_brouillons_reponse;
create policy brouillons_reponse_admin_lecture on public.mana_brouillons_reponse for select using (public.mana_est_admin());
drop policy if exists brouillons_reponse_admin_maj on public.mana_brouillons_reponse;
create policy brouillons_reponse_admin_maj on public.mana_brouillons_reponse for update using (public.mana_est_admin()) with check (public.mana_est_admin());

-- Un message client arrive : on demande une réponse préparée. Asynchrone (pg_net) et sans
-- jamais bloquer l'envoi du message, même si l'appel échoue.
create or replace function public.mana_demander_reponse() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.auteur = 'client' then
    begin
      perform net.http_post(
        url := 'https://wygptxqkptuabdefonhe.supabase.co/functions/v1/preparer-reponse',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        body := jsonb_build_object('demandeId', new.demande_id, 'messageId', new.id, 'declencheur', 'message'),
        timeout_milliseconds := 150000
      );
    exception when others then
      null;
    end;
  end if;
  return new;
end $$;
revoke all on function public.mana_demander_reponse() from public, anon, authenticated;
drop trigger if exists mana_messages_demander_reponse on public.mana_messages;
create trigger mana_messages_demander_reponse after insert on public.mana_messages
  for each row execute function public.mana_demander_reponse();

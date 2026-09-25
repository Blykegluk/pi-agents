-- Accès partagés : une portée « société » en plus de « magasin » et « tout le compte ».
-- magasin_id et societe_id sont exclusifs ; les deux à null = tout le compte (DAF, DG, assistante…).
alter table public.mana_acces add column if not exists societe_id text;
alter table public.mana_acces drop constraint if exists mana_acces_portee_unique;
alter table public.mana_acces add constraint mana_acces_portee_unique check (magasin_id is null or societe_id is null);

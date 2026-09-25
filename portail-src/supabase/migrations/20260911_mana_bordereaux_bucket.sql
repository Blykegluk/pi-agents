-- Bordereaux d'enlèvement scannés : bucket privé, une arborescence par compte.
-- Les photos ne peuvent plus tenir dans le localStorage dès qu'il y a un
-- enlèvement par jour (≈600 photos/an pour deux magasins).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mana-bordereaux', 'mana-bordereaux', false, 8388608,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Chaque compte n'accède qu'au dossier portant son propre identifiant.
drop policy if exists "mana_bordereaux_lecture" on storage.objects;
create policy "mana_bordereaux_lecture" on storage.objects for select
  to authenticated
  using (bucket_id = 'mana-bordereaux' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "mana_bordereaux_ecriture" on storage.objects;
create policy "mana_bordereaux_ecriture" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'mana-bordereaux' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "mana_bordereaux_suppression" on storage.objects;
create policy "mana_bordereaux_suppression" on storage.objects for delete
  to authenticated
  using (bucket_id = 'mana-bordereaux' and (storage.foldername(name))[1] = auth.uid()::text);

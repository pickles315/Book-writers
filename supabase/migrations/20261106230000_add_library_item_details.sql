alter table public.library_items
  add column if not exists description text not null default '',
  add column if not exists page_count integer,
  add column if not exists audio_duration_seconds integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'library_items_page_count_positive') then
    alter table public.library_items add constraint library_items_page_count_positive check (page_count is null or page_count > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'library_items_audio_duration_positive') then
    alter table public.library_items add constraint library_items_audio_duration_positive check (audio_duration_seconds is null or audio_duration_seconds > 0);
  end if;
end $$;

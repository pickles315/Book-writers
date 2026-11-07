-- Additive migration applied to the BookWriters Supabase project.
-- Supports metadata-only unreleased catalogue entries, optional EPUB samples,
-- and reader release-alert subscriptions.
alter table public.library_items
  alter column file_path drop not null,
  alter column cover_path drop not null;

alter table public.library_items
  add column if not exists released boolean not null default true,
  add column if not exists preview_file_path text;

create table if not exists public.library_release_alerts (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.library_cards(id) on delete cascade,
  item_id uuid not null references public.library_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (card_id, item_id)
);

create index if not exists library_release_alerts_item_idx
  on public.library_release_alerts(item_id);

alter table public.library_release_alerts enable row level security;
revoke all on public.library_release_alerts from anon, authenticated;
grant all on public.library_release_alerts to service_role;

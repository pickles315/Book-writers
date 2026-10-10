-- BookWriters feature migration (safe to run once; does not delete existing writing).
-- Run in Supabase SQL Editor after reviewing the statements.

alter table public.books add column if not exists cover_url text;
create table if not exists public.book_likes (
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (book_id,user_id)
);
create table if not exists public.bookmarks (
  book_id uuid not null references public.books(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (book_id,user_id)
);
create table if not exists public.writer_follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id,followed_id),
  check (follower_id <> followed_id)
);
create table if not exists public.chapter_versions (
  id bigint generated always as identity primary key,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  editor_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  saved_at timestamptz not null default now()
);
alter table public.book_likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.writer_follows enable row level security;
alter table public.chapter_versions enable row level security;

drop policy if exists "Read likes on public books" on public.book_likes;
create policy "Read likes on public books" on public.book_likes for select to anon, authenticated
using (exists(select 1 from public.books b where b.id=book_id and b.is_published=true));
drop policy if exists "Users manage own likes" on public.book_likes;
create policy "Users manage own likes" on public.book_likes for all to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists "Users manage own bookmarks" on public.bookmarks;
create policy "Users manage own bookmarks" on public.bookmarks for all to authenticated
using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists "Read follows" on public.writer_follows;
create policy "Read follows" on public.writer_follows for select to authenticated using (true);
drop policy if exists "Users manage own follows" on public.writer_follows;
create policy "Users manage own follows" on public.writer_follows for all to authenticated
using (follower_id=(select auth.uid())) with check (follower_id=(select auth.uid()));

drop policy if exists "Read versions for accessible books" on public.chapter_versions;
create policy "Read versions for accessible books" on public.chapter_versions for select to authenticated
using (exists(select 1 from public.chapters c where c.id=chapter_id and public.can_edit_book(c.book_id)));
drop policy if exists "Editors save versions" on public.chapter_versions;
create policy "Editors save versions" on public.chapter_versions for insert to authenticated
with check (editor_id=(select auth.uid()) and exists(select 1 from public.chapters c where c.id=chapter_id and public.can_edit_book(c.book_id)));

grant select on public.book_likes to anon, authenticated;
grant insert, delete on public.book_likes, public.bookmarks, public.writer_follows to authenticated;
grant select on public.bookmarks, public.writer_follows, public.chapter_versions to authenticated;
grant insert on public.chapter_versions to authenticated;
grant usage, select on sequence public.chapter_versions_id_seq to authenticated;

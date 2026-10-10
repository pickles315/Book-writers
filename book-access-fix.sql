-- BookWriters: restore owners' access to their own books and chapters.
-- Run this file in Supabase Dashboard -> SQL Editor, then deploy the matching
-- app commit. This migration changes policies only; it does not delete book data.
--
-- Why: PostgreSQL RLS policies can silently hide a row even when the app
-- knows its ID. These helpers check ownership/collaboration without recursive
-- RLS lookups on the same tables.

create or replace function public.bw_can_access_book(target_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.books b
    where b.id = target_book
      and (
        b.is_published = true
        or b.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.book_collaborators bc
          where bc.book_id = b.id
            and bc.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.bw_can_edit_book(target_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.books b
    where b.id = target_book
      and b.owner_id = (select auth.uid())
  ) or exists (
    select 1
    from public.book_collaborators bc
    where bc.book_id = target_book
      and bc.user_id = (select auth.uid())
      and bc.role in ('writer', 'editor')
  );
$$;

grant execute on function public.bw_can_access_book(uuid) to anon, authenticated;
grant execute on function public.bw_can_edit_book(uuid) to authenticated;

alter table public.books enable row level security;
alter table public.chapters enable row level security;

-- Remove old policies on these two tables so permissive/incorrect legacy
-- policies cannot conflict with the intended access rules.
do $$
declare pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('books', 'chapters')
  loop
    execute format('drop policy if exists %I on %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end;
$$;

-- Owners can always see their own books, including unpublished drafts.
create policy "BW read published own or shared books"
on public.books for select to anon, authenticated
using (
  is_published = true
  or owner_id = (select auth.uid())
  or exists (
    select 1 from public.book_collaborators bc
    where bc.book_id = books.id and bc.user_id = (select auth.uid())
  )
);

create policy "BW create own books"
on public.books for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "BW owners update own books"
on public.books for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "BW owners delete own books"
on public.books for delete to authenticated
using (owner_id = (select auth.uid()));

create policy "BW read accessible chapters"
on public.chapters for select to anon, authenticated
using (public.bw_can_access_book(book_id));

create policy "BW editors create chapters"
on public.chapters for insert to authenticated
with check (public.bw_can_edit_book(book_id));

create policy "BW editors update chapters"
on public.chapters for update to authenticated
using (public.bw_can_edit_book(book_id))
with check (public.bw_can_edit_book(book_id));

create policy "BW editors delete chapters"
on public.chapters for delete to authenticated
using (public.bw_can_edit_book(book_id));

grant select on public.books, public.chapters to anon, authenticated;
grant insert, update, delete on public.books, public.chapters to authenticated;

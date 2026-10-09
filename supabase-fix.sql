-- BookWriters signup and row-level security fix
-- Run this in Supabase SQL Editor after creating the five app tables.
-- This replaces policies on the app tables with a known, consistent set.

-- Fix signup usernames: the old UUID-based username could exceed the
-- profiles.username column's 24-character limit.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'writer_' || substr(replace(new.id::text, '-', ''), 1, 16),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      'Writer'
    )
  );
  return new;
end;
$$;

-- SECURITY DEFINER helpers keep RLS checks from recursively querying
-- the same protected tables through their own policies.
create or replace function public.is_book_owner(target_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.books b
    where b.id = target_book and b.owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_book_collaborator(target_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.book_collaborators bc
    where bc.book_id = target_book and bc.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_book(target_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.books b
    where b.id = target_book
      and (
        b.is_published = true
        or b.owner_id = (select auth.uid())
        or exists (
          select 1 from public.book_collaborators bc
          where bc.book_id = b.id and bc.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.can_edit_book(target_book uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.books b
    where b.id = target_book and b.owner_id = (select auth.uid())
  ) or exists (
    select 1 from public.book_collaborators bc
    where bc.book_id = target_book
      and bc.user_id = (select auth.uid())
      and bc.role in ('writer', 'editor')
  );
$$;

grant usage on schema public to anon, authenticated;
grant execute on function public.is_book_owner(uuid) to anon, authenticated;
grant execute on function public.is_book_collaborator(uuid) to anon, authenticated;
grant execute on function public.can_access_book(uuid) to anon, authenticated;
grant execute on function public.can_edit_book(uuid) to authenticated;

-- Remove all existing policies from these app tables, so a leftover
-- permissive policy cannot accidentally override the intended restrictions.
do $$
declare pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','books','book_collaborators','chapters','chat_messages')
  loop
    execute format('drop policy if exists %I on %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.book_collaborators enable row level security;
alter table public.chapters enable row level security;
alter table public.chat_messages enable row level security;

-- Profiles are public writer cards; only the account owner can change theirs.
create policy "Public profiles are readable"
on public.profiles for select to anon, authenticated
using (true);

create policy "Users insert their own profile"
on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

create policy "Users update their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Users delete their own profile"
on public.profiles for delete to authenticated
using (id = (select auth.uid()));

-- Public books can be discovered; private books stay with their owner/collaborators.
create policy "Read published books or own collaborations"
on public.books for select to anon, authenticated
using (
  is_published = true
  or owner_id = (select auth.uid())
  or public.is_book_collaborator(id)
);

create policy "Users create books as themselves"
on public.books for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners update their books"
on public.books for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "Owners delete their books"
on public.books for delete to authenticated
using (owner_id = (select auth.uid()));

-- Owners and collaborators can see the roster; each user can see their own row.
create policy "Read accessible collaborator lists"
on public.book_collaborators for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_book_owner(book_id)
  or public.is_book_collaborator(book_id)
);

create policy "Owners add collaborators"
on public.book_collaborators for insert to authenticated
with check (public.is_book_owner(book_id));

create policy "Owners remove collaborators"
on public.book_collaborators for delete to authenticated
using (public.is_book_owner(book_id));

-- Published chapters are readable by everyone; drafts only by project members.
create policy "Read chapters of accessible books"
on public.chapters for select to anon, authenticated
using (public.can_access_book(book_id));

create policy "Writers create chapters"
on public.chapters for insert to authenticated
with check (public.can_edit_book(book_id));

create policy "Writers update chapters"
on public.chapters for update to authenticated
using (public.can_edit_book(book_id))
with check (public.can_edit_book(book_id));

create policy "Owners delete chapters"
on public.chapters for delete to authenticated
using (public.is_book_owner(book_id));

-- Chat is only readable/writable by a book's owner and collaborators.
create policy "Read chat for accessible projects"
on public.chat_messages for select to authenticated
using (public.is_book_owner(book_id) or public.is_book_collaborator(book_id));

create policy "Send chat as yourself to accessible projects"
on public.chat_messages for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (public.is_book_owner(book_id) or public.is_book_collaborator(book_id))
);

grant select on public.profiles, public.books, public.chapters to anon, authenticated;
grant insert, update, delete on public.profiles to authenticated;
grant insert, update, delete on public.books to authenticated;
grant select, insert, update, delete on public.chapters to authenticated;
grant select, insert, delete on public.book_collaborators to authenticated;
grant select, insert on public.chat_messages to authenticated;

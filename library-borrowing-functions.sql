-- Server-only helpers for the library API. Browser roles cannot execute these functions.
alter table public.library_progress
  add column if not exists reading_location text;

create or replace function public.library_check_login_limit(p_attempt_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.library_login_attempts%rowtype;
begin
  select * into v
  from public.library_login_attempts
  where attempt_key = p_attempt_key;

  if not found then return true; end if;
  if v.locked_until is not null and v.locked_until > now() then return false; end if;
  if v.window_started_at < now() - interval '15 minutes' then return true; end if;
  return v.attempts < 5;
end;
$$;

create or replace function public.library_record_failed_login(p_attempt_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.library_login_attempts(attempt_key, attempts, window_started_at, locked_until)
  values (p_attempt_key, 1, now(), null)
  on conflict (attempt_key) do update
  set attempts = case
        when public.library_login_attempts.window_started_at < now() - interval '15 minutes' then 1
        else public.library_login_attempts.attempts + 1
      end,
      window_started_at = case
        when public.library_login_attempts.window_started_at < now() - interval '15 minutes' then now()
        else public.library_login_attempts.window_started_at
      end,
      locked_until = case
        when (case
          when public.library_login_attempts.window_started_at < now() - interval '15 minutes' then 1
          else public.library_login_attempts.attempts + 1
        end) >= 5 then now() + interval '15 minutes'
        else public.library_login_attempts.locked_until
      end;
end;
$$;

create or replace function public.library_clear_login_attempts(p_attempt_key text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.library_login_attempts where attempt_key = p_attempt_key;
$$;

create or replace function public.library_borrow_item(p_card_id uuid, p_item_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_copies integer;
  v_active integer;
  v_loan_id uuid;
begin
  select total_copies into v_copies
  from public.library_items
  where id = p_item_id
  for update;

  if not found then raise exception 'ITEM_NOT_FOUND'; end if;

  select count(*) into v_active
  from public.library_loans
  where item_id = p_item_id
    and returned_at is null
    and due_at > now();

  if v_active >= v_copies then raise exception 'NO_COPIES_AVAILABLE'; end if;

  if exists (
    select 1 from public.library_loans
    where card_id = p_card_id and item_id = p_item_id
      and returned_at is null and due_at > now()
  ) then raise exception 'ALREADY_BORROWED'; end if;

  insert into public.library_loans(card_id, item_id, borrowed_at, due_at)
  values (p_card_id, p_item_id, now(), now() + interval '12 days')
  returning id into v_loan_id;

  return v_loan_id;
end;
$$;

create or replace function public.library_return_item(p_card_id uuid, p_loan_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.library_loans
  set returned_at = now()
  where id = p_loan_id and card_id = p_card_id and returned_at is null;
  return found;
end;
$$;

create or replace function public.library_expire_loans()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.library_loans
  set returned_at = due_at
  where returned_at is null and due_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.library_check_login_limit(text) from public, anon, authenticated;
revoke all on function public.library_record_failed_login(text) from public, anon, authenticated;
revoke all on function public.library_clear_login_attempts(text) from public, anon, authenticated;
revoke all on function public.library_borrow_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.library_return_item(uuid, uuid) from public, anon, authenticated;
revoke all on function public.library_expire_loans() from public, anon, authenticated;

grant execute on function public.library_check_login_limit(text) to service_role;
grant execute on function public.library_record_failed_login(text) to service_role;
grant execute on function public.library_clear_login_attempts(text) to service_role;
grant execute on function public.library_borrow_item(uuid, uuid) to service_role;
grant execute on function public.library_return_item(uuid, uuid) to service_role;
grant execute on function public.library_expire_loans() to service_role;

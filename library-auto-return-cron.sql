-- Return overdue loans automatically, within one minute of their 12-day due time.
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'library-auto-return') then
    perform cron.unschedule((select jobid from cron.job where jobname = 'library-auto-return' limit 1));
  end if;
  perform cron.schedule(
    'library-auto-return',
    '* * * * *',
    'select public.library_expire_loans();'
  );
end
$$;

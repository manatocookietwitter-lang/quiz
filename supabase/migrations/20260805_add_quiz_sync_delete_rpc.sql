create or replace function public.quiz_sync_delete(p_sync_id text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  deleted_count integer;
begin
  if p_sync_id is null
    or p_sync_id !~ '^[0-9a-f]{36}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_sync_id';
  end if;

  delete from public.quiz_sync_data
  where sync_id = p_sync_id;

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$function$;

revoke all on function public.quiz_sync_delete(text) from public;
grant execute on function public.quiz_sync_delete(text) to anon, authenticated;

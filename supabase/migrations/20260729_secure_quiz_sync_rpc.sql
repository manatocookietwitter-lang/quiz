-- Keep the sync id as a client-held secret, but do not expose the backing table
-- to the public API. The only public operations below require an exact sync id;
-- there is no operation that can enumerate ids.

alter table public.quiz_sync_data enable row level security;

revoke all on table public.quiz_sync_data from public;
revoke all on table public.quiz_sync_data from anon;
revoke all on table public.quiz_sync_data from authenticated;

create or replace function public.quiz_sync_read(p_sync_id text)
returns table (
  sync_id text,
  data jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $function$
begin
  if p_sync_id is null
    or p_sync_id !~ '^[0-9a-f]{36}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_sync_id';
  end if;

  return query
    select row_data.sync_id, row_data.data, row_data.updated_at
    from public.quiz_sync_data as row_data
    where row_data.sync_id = p_sync_id
    limit 1;
end;
$function$;

create or replace function public.quiz_sync_upsert(
  p_sync_id text,
  p_data jsonb,
  p_updated_at timestamptz,
  p_expected_updated_at timestamptz default null,
  p_force boolean default false
)
returns table (
  sync_id text,
  data jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  existing_updated_at timestamptz;
  effective_updated_at timestamptz := clock_timestamp();
  row_exists boolean;
begin
  if p_sync_id is null
    or p_sync_id !~ '^[0-9a-f]{36}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_sync_id';
  end if;

  if p_data is null
    or jsonb_typeof(p_data) is distinct from 'object'
    or p_data ->> 'version' is distinct from '1'
    or jsonb_typeof(p_data -> 'localStorage') is distinct from 'object'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_sync_payload';
  end if;

  if p_updated_at is null then
    raise exception using
      errcode = '22023',
      message = 'invalid_updated_at';
  end if;

  select row_data.updated_at
    into existing_updated_at
    from public.quiz_sync_data as row_data
    where row_data.sync_id = p_sync_id
    for update;
  row_exists := found;

  if row_exists then
    if not coalesce(p_force, false)
      and (
        p_expected_updated_at is null
        or existing_updated_at is distinct from p_expected_updated_at
      )
    then
      raise exception using
        errcode = '40001',
        message = 'quiz_sync_conflict';
    end if;

    update public.quiz_sync_data as row_data
      set data = p_data,
          updated_at = effective_updated_at
      where row_data.sync_id = p_sync_id;
  else
    begin
      insert into public.quiz_sync_data (sync_id, data, updated_at)
      values (p_sync_id, p_data, effective_updated_at);
    exception
      when unique_violation then
        raise exception using
          errcode = '40001',
          message = 'quiz_sync_conflict';
    end;
  end if;

  return query
    select row_data.sync_id, row_data.data, row_data.updated_at
    from public.quiz_sync_data as row_data
    where row_data.sync_id = p_sync_id
    limit 1;
end;
$function$;

create or replace function public.quiz_sync_probe(p_sync_id text)
returns boolean
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $function$
begin
  if p_sync_id is null
    or p_sync_id !~ '^[0-9a-f]{36}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid_sync_id';
  end if;

  return true;
end;
$function$;

revoke all on function public.quiz_sync_read(text) from public;
revoke all on function public.quiz_sync_upsert(text, jsonb, timestamptz, timestamptz, boolean) from public;
revoke all on function public.quiz_sync_probe(text) from public;

grant execute on function public.quiz_sync_read(text) to anon, authenticated;
grant execute on function public.quiz_sync_upsert(text, jsonb, timestamptz, timestamptz, boolean) to anon, authenticated;
grant execute on function public.quiz_sync_probe(text) to anon, authenticated;

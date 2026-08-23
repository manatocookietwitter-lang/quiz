-- Harden account-owned bearer-secret sync without changing existing payloads.
-- Persistent sync IDs remain 144-bit secrets. Human-friendly 8-character
-- codes are short-lived, one-time pairing tokens only.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.quiz_sync_security_config (
  singleton boolean primary key default true check (singleton),
  fingerprint_key bytea not null
);

insert into private.quiz_sync_security_config (singleton, fingerprint_key)
values (true, extensions.gen_random_bytes(32))
on conflict (singleton) do nothing;

create table if not exists private.quiz_sync_rate_limits (
  id bigint generated always as identity primary key,
  actor_hash bytea not null,
  action text not null,
  requested_at timestamptz not null default clock_timestamp()
);

create index if not exists quiz_sync_rate_limits_actor_action_time_idx
  on private.quiz_sync_rate_limits (actor_hash, action, requested_at desc);

-- The actor/action index serves the rate check.  Housekeeping deletes by time
-- across every actor, so it needs its own leading requested_at index and must
-- not run on an RPC hot path.
create index if not exists quiz_sync_rate_limits_requested_at_idx
  on private.quiz_sync_rate_limits (requested_at);

create table if not exists private.quiz_sync_tombstones (
  sync_id_hash bytea primary key,
  deleted_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null
);

create index if not exists quiz_sync_tombstones_expires_at_idx
  on private.quiz_sync_tombstones (expires_at);

revoke all on table private.quiz_sync_security_config from public, anon, authenticated;
revoke all on table private.quiz_sync_rate_limits from public, anon, authenticated;
revoke all on table private.quiz_sync_tombstones from public, anon, authenticated;
revoke all on sequence private.quiz_sync_rate_limits_id_seq from public, anon, authenticated;

alter table private.quiz_sync_security_config enable row level security;
alter table private.quiz_sync_rate_limits enable row level security;
alter table private.quiz_sync_tombstones enable row level security;

create or replace function private.quiz_sync_hash(p_value text)
returns bytea
language sql
stable
security definer
set search_path = ''
as $function$
  select extensions.hmac(
    pg_catalog.convert_to(coalesce(p_value, ''), 'UTF8'),
    config.fingerprint_key,
    'sha256'
  )
  from private.quiz_sync_security_config as config
  where config.singleton
$function$;

create or replace function private.quiz_sync_authenticated_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  authenticated_user uuid := auth.uid();
  claims jsonb := '{}'::jsonb;
  anonymous_claim text;
begin
  begin
    claims := coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    claims := '{}'::jsonb;
  end;

  anonymous_claim := pg_catalog.lower(coalesce(claims ->> 'is_anonymous', 'false'));
  if authenticated_user is null
    or anonymous_claim not in ('false', 'f', '0')
  then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'quiz_sync_authentication_required',
        'message', 'A signed-in, non-anonymous account is required for sync.'
      )::text,
      detail = pg_catalog.jsonb_build_object(
        'status', 401,
        'status_text', 'Unauthorized'
      )::text;
  end if;

  return authenticated_user;
end;
$function$;

create or replace function private.quiz_sync_actor_hash()
returns bytea
language sql
stable
security definer
set search_path = ''
as $function$
  select private.quiz_sync_hash(
    'user:' || private.quiz_sync_authenticated_user()::text
  )
$function$;

create or replace function private.quiz_sync_lock_id(p_sync_id text)
returns void
language sql
volatile
security definer
set search_path = ''
as $function$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('quiz-sync-id:' || coalesce(p_sync_id, ''), 0)
  )
$function$;

create or replace function private.quiz_sync_lock_quota_actor(p_actor bytea)
returns void
language sql
volatile
security definer
set search_path = ''
as $function$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'quiz-sync-quota:' || pg_catalog.encode(coalesce(p_actor, ''::bytea), 'hex'),
      0
    )
  )
$function$;

create or replace function private.enforce_quiz_sync_rate_limit(
  p_action text,
  p_limit integer,
  p_window interval default interval '1 minute'
)
returns void
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  actor bytea := private.quiz_sync_actor_hash();
  recent_count integer;
begin
  if p_action is null
    or p_action !~ '^[a-z_]{1,40}$'
    or p_limit is null
    or p_limit < 1
    or p_limit > 1000
    or p_window is null
    or p_window < interval '1 second'
    or p_window > interval '1 day'
  then
    raise exception using errcode = '22023', message = 'invalid_rate_limit_configuration';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.encode(actor, 'hex') || ':' || p_action, 0)
  );

  select count(*)
    into recent_count
    from private.quiz_sync_rate_limits as attempts
    where attempts.actor_hash = actor
      and attempts.action = p_action
      and attempts.requested_at >= clock_timestamp() - p_window;

  if recent_count >= p_limit then
    raise sqlstate 'PGRST' using
      message = pg_catalog.jsonb_build_object(
        'code', 'quiz_sync_rate_limited',
        'message', 'Too many sync requests. Please wait and try again.'
      )::text,
      detail = pg_catalog.jsonb_build_object(
        'status', 429,
        'status_text', 'Too Many Requests'
      )::text;
  end if;

  insert into private.quiz_sync_rate_limits (actor_hash, action)
  values (actor, p_action);
end;
$function$;

revoke all on function private.quiz_sync_hash(text) from public, anon, authenticated;
revoke all on function private.quiz_sync_authenticated_user() from public, anon, authenticated;
revoke all on function private.quiz_sync_actor_hash() from public, anon, authenticated;
revoke all on function private.quiz_sync_lock_id(text) from public, anon, authenticated;
revoke all on function private.quiz_sync_lock_quota_actor(bytea) from public, anon, authenticated;
revoke all on function private.enforce_quiz_sync_rate_limit(text, integer, interval) from public, anon, authenticated;

alter table public.quiz_sync_data
  add column if not exists creator_hash bytea,
  add column if not exists last_accessed_at timestamptz,
  add column if not exists payload_bytes integer,
  add column if not exists payload_size_enforced boolean not null default false;

-- The sync table is reachable only through the narrowly granted RPCs below.
-- Repeat these protections here so this migration is safe even when an older
-- project was created before the secure-RPC migration was applied.
alter table public.quiz_sync_data enable row level security;
revoke all on table public.quiz_sync_data from public, anon, authenticated;

update public.quiz_sync_data
set last_accessed_at = coalesce(last_accessed_at, updated_at, clock_timestamp())
where last_accessed_at is null;

update public.quiz_sync_data
set payload_bytes = pg_catalog.octet_length(data::text)
where payload_bytes is null;

alter table public.quiz_sync_data
  alter column last_accessed_at set default clock_timestamp(),
  alter column last_accessed_at set not null,
  alter column payload_bytes set not null;

create index if not exists quiz_sync_data_last_accessed_idx
  on public.quiz_sync_data (last_accessed_at);

create index if not exists quiz_sync_data_creator_quota_idx
  on public.quiz_sync_data (creator_hash)
  include (payload_bytes)
  where creator_hash is not null;

create or replace function private.set_quiz_sync_payload_bytes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.payload_bytes := pg_catalog.octet_length(new.data::text);
  new.payload_size_enforced := true;
  return new;
end;
$function$;

revoke all on function private.set_quiz_sync_payload_bytes() from public, anon, authenticated;

drop trigger if exists set_quiz_sync_payload_bytes on public.quiz_sync_data;
create trigger set_quiz_sync_payload_bytes
before insert or update of data on public.quiz_sync_data
for each row execute function private.set_quiz_sync_payload_bytes();

do $block$
begin
  alter table public.quiz_sync_data
    drop constraint if exists quiz_sync_data_payload_size_limit;

  -- Existing payloads remain readable and can still receive last-access
  -- updates even when they predate the 8 MiB policy.  The trigger flips the
  -- enforcement marker on every new row or data change.  A later migration
  -- may validate this constraint after legacy oversized rows are remediated.
  alter table public.quiz_sync_data
    add constraint quiz_sync_data_payload_size_limit
    check (
      not payload_size_enforced
      or payload_bytes <= 8388608
    )
    not valid;
end
$block$;

create table if not exists public.quiz_sync_pairing_codes (
  code_hash bytea primary key,
  sync_id text not null references public.quiz_sync_data(sync_id)
    on update cascade on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);

create index if not exists quiz_sync_pairing_codes_expires_idx
  on public.quiz_sync_pairing_codes (expires_at);

create unique index if not exists quiz_sync_pairing_codes_sync_id_uidx
  on public.quiz_sync_pairing_codes (sync_id);

alter table public.quiz_sync_pairing_codes enable row level security;
revoke all on table public.quiz_sync_pairing_codes from public, anon, authenticated;

-- A response can be lost after a legacy rotation commits, and two tabs may have
-- persisted different candidates. Keep a bounded, HMAC-keyed winner record so
-- every retry converges without storing the legacy bearer secret itself.
create table if not exists private.quiz_sync_legacy_migrations (
  legacy_id_hash bytea primary key,
  winner_sync_id text not null references public.quiz_sync_data(sync_id)
    on update cascade on delete cascade,
  winner_updated_at timestamptz not null,
  creator_hash bytea,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  check (winner_sync_id ~ '^[0-9a-f]{36}$'),
  check (expires_at > created_at)
);

alter table private.quiz_sync_legacy_migrations
  add column if not exists creator_hash bytea;

create index if not exists quiz_sync_legacy_migrations_expires_idx
  on private.quiz_sync_legacy_migrations (expires_at);

create index if not exists quiz_sync_legacy_migrations_winner_idx
  on private.quiz_sync_legacy_migrations (winner_sync_id);

alter table private.quiz_sync_legacy_migrations enable row level security;
revoke all on table private.quiz_sync_legacy_migrations from public, anon, authenticated;

create or replace function private.cleanup_quiz_sync_housekeeping(
  p_now timestamptz default clock_timestamp()
)
returns table (
  rate_limits_deleted bigint,
  tombstones_deleted bigint,
  pairing_codes_deleted bigint
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '30s'
as $function$
declare
  deleted_rows bigint;
begin
  if p_now is null then
    return query select 0::bigint, 0::bigint, 0::bigint;
    return;
  end if;

  delete from private.quiz_sync_rate_limits
  where requested_at < p_now - interval '1 day';
  get diagnostics deleted_rows = row_count;
  rate_limits_deleted := deleted_rows;

  delete from private.quiz_sync_tombstones
  where expires_at <= p_now;
  get diagnostics deleted_rows = row_count;
  tombstones_deleted := deleted_rows;

  delete from public.quiz_sync_pairing_codes
  where expires_at <= p_now;
  get diagnostics deleted_rows = row_count;
  pairing_codes_deleted := deleted_rows;

  delete from private.quiz_sync_legacy_migrations
  where expires_at <= p_now;

  return next;
end;
$function$;

revoke all on function private.cleanup_quiz_sync_housekeeping(timestamptz)
  from public, anon, authenticated;

comment on function private.cleanup_quiz_sync_housekeeping(timestamptz) is
  'Deletes expired rate, tombstone, pairing, and legacy-winner rows from a trusted scheduler.';

-- Supabase Cron is backed by pg_cron. A named schedule is an upsert, so
-- reapplying the migration cannot create duplicate jobs. Keeping cleanup off
-- request paths avoids latency spikes while guaranteeing expired abuse-control
-- rows do not grow without bound.
create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
grant execute on function cron.schedule(text, text, text) to postgres;

select cron.schedule(
  'quizmake-sync-housekeeping-v1',
  '17 3 * * *',
  $cron$select * from private.cleanup_quiz_sync_housekeeping();$cron$
);

revoke all on schema cron from public, anon, authenticated;
revoke all on all tables in schema cron from public, anon, authenticated;
revoke all on all sequences in schema cron from public, anon, authenticated;
revoke execute on all functions in schema cron from public, anon, authenticated;

create or replace function public.quiz_sync_read(p_sync_id text)
returns table (
  sync_id text,
  data jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  actor bytea := private.quiz_sync_actor_hash();
begin
  perform private.enforce_quiz_sync_rate_limit('read', 30, interval '1 minute');

  if p_sync_id is null or p_sync_id !~ '^[0-9a-f]{36}$' then
    return;
  end if;

  perform private.quiz_sync_lock_id(p_sync_id);

  update public.quiz_sync_data as row_data
    set creator_hash = actor
    where row_data.sync_id = p_sync_id
      and row_data.creator_hash is null;

  update public.quiz_sync_data as row_data
    set last_accessed_at = clock_timestamp()
    where row_data.sync_id = p_sync_id
      and row_data.creator_hash = actor
      and row_data.last_accessed_at < clock_timestamp() - interval '1 day';

  return query
    select row_data.sync_id, row_data.data, row_data.updated_at
    from public.quiz_sync_data as row_data
    where row_data.sync_id = p_sync_id
      and row_data.creator_hash = actor
    limit 1;
end;
$function$;

create or replace function public.quiz_sync_meta(p_sync_id text)
returns table (
  sync_id text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  actor bytea := private.quiz_sync_actor_hash();
begin
  perform private.enforce_quiz_sync_rate_limit('meta', 60, interval '1 minute');

  if p_sync_id is null or p_sync_id !~ '^[0-9a-f]{36}$' then
    return;
  end if;

  perform private.quiz_sync_lock_id(p_sync_id);

  update public.quiz_sync_data as row_data
    set creator_hash = actor
    where row_data.sync_id = p_sync_id
      and row_data.creator_hash is null;

  update public.quiz_sync_data as row_data
    set last_accessed_at = clock_timestamp()
    where row_data.sync_id = p_sync_id
      and row_data.creator_hash = actor
      and row_data.last_accessed_at < clock_timestamp() - interval '1 day';

  return query
    select row_data.sync_id, row_data.updated_at
    from public.quiz_sync_data as row_data
    where row_data.sync_id = p_sync_id
      and row_data.creator_hash = actor
    limit 1;
end;
$function$;

create or replace function public.quiz_sync_probe(p_sync_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
begin
  perform private.enforce_quiz_sync_rate_limit('probe', 30, interval '1 minute');
  if p_sync_id is null or p_sync_id !~ '^[0-9a-f]{36}$' then
    return false;
  end if;
  return true;
end;
$function$;

-- New clients use a versioned result-code endpoint.  The historical unversioned
-- endpoint is recreated below with its original three-column result shape so a
-- deployed client cannot mistake an expected failure row for a successful write.
drop function if exists public.quiz_sync_upsert_v2(
  text, jsonb, timestamptz, timestamptz, boolean
);

drop function if exists public.quiz_sync_upsert(
  text, jsonb, timestamptz, timestamptz, boolean
);

create function public.quiz_sync_upsert_v2(
  p_sync_id text,
  p_data jsonb,
  p_updated_at timestamptz,
  p_expected_updated_at timestamptz default null,
  p_force boolean default false
)
returns table (
  result_code text,
  sync_id text,
  data jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
as $function$
declare
  existing_updated_at timestamptz;
  existing_creator bytea;
  effective_updated_at timestamptz;
  row_exists boolean;
  actor bytea := private.quiz_sync_actor_hash();
  quota_actor bytea;
  other_row_count integer;
  other_payload_bytes bigint;
  incoming_payload_bytes integer;
  local_key_count integer;
  note_key_count integer := 0;
  sync_hash bytea;
  active_tombstone boolean;
begin
  perform private.enforce_quiz_sync_rate_limit('upsert', 12, interval '1 minute');

  if p_sync_id is null or p_sync_id !~ '^[0-9a-f]{36}$' then
    return query
      select 'invalid_sync_id'::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  if p_data is null
    or pg_catalog.jsonb_typeof(p_data) is distinct from 'object'
    or p_data ->> 'version' is distinct from '1'
    or pg_catalog.jsonb_typeof(p_data -> 'localStorage') is distinct from 'object'
    or (
      p_data ? 'indexedDbNotes'
      and pg_catalog.jsonb_typeof(p_data -> 'indexedDbNotes') is distinct from 'object'
    )
  then
    return query
      select 'invalid_sync_payload'::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  incoming_payload_bytes := pg_catalog.octet_length(p_data::text);
  if incoming_payload_bytes > 8388608 then
    return query
      select 'sync_payload_too_large'::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  select count(*) into local_key_count
  from pg_catalog.jsonb_each(p_data -> 'localStorage') as entry
  where pg_catalog.jsonb_typeof(entry.value) = 'string';

  if local_key_count <> (
    select count(*) from pg_catalog.jsonb_object_keys(p_data -> 'localStorage')
  ) or local_key_count > 10000 then
    return query
      select 'invalid_sync_local_storage'::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  if p_data ? 'indexedDbNotes' then
    select count(*) into note_key_count
    from pg_catalog.jsonb_each(p_data -> 'indexedDbNotes') as entry
    where pg_catalog.jsonb_typeof(entry.value) = 'string';

    if note_key_count <> (
      select count(*) from pg_catalog.jsonb_object_keys(p_data -> 'indexedDbNotes')
    ) or note_key_count > 10000 then
      return query
        select 'invalid_sync_notes'::text, null::text, null::jsonb, null::timestamptz;
      return;
    end if;
  end if;

  -- Match the client-side export limit: localStorage and note entries share a
  -- single 10,000-key budget rather than receiving 10,000 keys each.
  if local_key_count + note_key_count > 10000 then
    return query
      select 'invalid_sync_payload'::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  if p_updated_at is null then
    return query
      select 'invalid_updated_at'::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  -- Every mutation concerning this secret uses the same lock key.  This
  -- closes the delete/tombstone/reinsert race across separate rows/tables.
  perform private.quiz_sync_lock_id(p_sync_id);
  sync_hash := private.quiz_sync_hash('sync:' || p_sync_id);
  select exists (
    select 1 from private.quiz_sync_tombstones as tombstone
    where tombstone.sync_id_hash = sync_hash
      and tombstone.expires_at > clock_timestamp()
  ) into active_tombstone;

  -- A live tombstone always wins, including over a force request.  Force may
  -- override CAS only for a row that still exists; it must never resurrect a
  -- sync deleted by another device after the conflict UI was opened.
  if active_tombstone then
    return query
      select 'deleted'::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  select row_data.updated_at, row_data.creator_hash
    into existing_updated_at, existing_creator
    from public.quiz_sync_data as row_data
    where row_data.sync_id = p_sync_id
    for update;
  row_exists := found;

  if row_exists then
    if existing_creator is not null and existing_creator is distinct from actor then
      return query
        select 'not_found'::text, null::text, null::jsonb, null::timestamptz;
      return;
    end if;

    -- Force records an explicit user confirmation but never bypasses CAS. The
    -- revision confirmed by the user must still be the live revision at write
    -- time, otherwise a second intervening write would be silently erased.
    if p_expected_updated_at is null
      or existing_updated_at is distinct from p_expected_updated_at
    then
      return query
        select 'conflict'::text, null::text, null::jsonb, existing_updated_at;
      return;
    end if;
    quota_actor := actor;
  else
    if p_expected_updated_at is not null then
      return query
        select 'conflict'::text, null::text, null::jsonb, null::timestamptz;
      return;
    end if;
    quota_actor := actor;
  end if;

  -- Mutations of different sync IDs owned by the same quota actor must be
  -- serialized before checking aggregate usage.
  perform private.quiz_sync_lock_quota_actor(quota_actor);

  select count(*), coalesce(sum(row_data.payload_bytes), 0)
    into other_row_count, other_payload_bytes
    from public.quiz_sync_data as row_data
    where row_data.creator_hash = quota_actor
      and row_data.sync_id <> p_sync_id;

  -- The saved row will belong to quota_actor after this write even when it is
  -- an older row whose creator_hash has not been backfilled yet.
  if other_row_count >= 50
    or other_payload_bytes + incoming_payload_bytes > 134217728
  then
    return query
      select 'quota_exceeded'::text, null::text, null::jsonb, null::timestamptz;
    return;
  end if;

  if row_exists then
    -- Allocate the revision only after the sync/quota locks and checks.  A
    -- delayed force writer must sort after the write it actually follows, even
    -- if the wall clock has the same resolution or moves slightly backwards.
    effective_updated_at := greatest(
      pg_catalog.clock_timestamp(),
      existing_updated_at + interval '1 microsecond'
    );
    update public.quiz_sync_data as row_data
      set data = p_data,
          updated_at = effective_updated_at,
          last_accessed_at = effective_updated_at,
          creator_hash = quota_actor
      where row_data.sync_id = p_sync_id;
  else
    effective_updated_at := pg_catalog.clock_timestamp();
    begin
      insert into public.quiz_sync_data (
        sync_id, data, updated_at, last_accessed_at, creator_hash
      ) values (
        p_sync_id, p_data, effective_updated_at, effective_updated_at, quota_actor
      );
    exception
      when unique_violation then
        return query
          select 'conflict'::text, null::text, null::jsonb, null::timestamptz;
        return;
    end;
  end if;

  -- Only an expired tombstone is cleaned here, after the write has passed
  -- validation, CAS, and quota checks. Active tombstones returned above.
  delete from private.quiz_sync_tombstones
  where sync_id_hash = sync_hash
    and expires_at <= clock_timestamp();

  return query
    select 'ok'::text, row_data.sync_id, row_data.data, row_data.updated_at
    from public.quiz_sync_data as row_data
    where row_data.sync_id = p_sync_id
    limit 1;
end;
$function$;

-- Compatibility contract for clients deployed before result_code existed.
-- Expected v2 failures are deliberately converted to one structurally invalid
-- legacy row.  In particular, never expose the authoritative conflict revision:
-- an old client could otherwise accept that revision and overwrite newer data.
-- Rate-limit exceptions are not caught, so their HTTP 429 behavior is preserved.
create function public.quiz_sync_upsert(
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
security invoker
set search_path = ''
set statement_timeout = '10s'
as $function$
declare
  v_result_code text;
  v_sync_id text;
  v_data jsonb;
  v_updated_at timestamptz;
begin
  select response.result_code,
         response.sync_id,
         response.data,
         response.updated_at
    into v_result_code, v_sync_id, v_data, v_updated_at
    from public.quiz_sync_upsert_v2(
      p_sync_id,
      p_data,
      p_updated_at,
      p_expected_updated_at,
      p_force
    ) as response;

  if not found or v_result_code is distinct from 'ok' then
    return query
      select null::text, '{}'::jsonb, null::timestamptz;
    return;
  end if;

  return query
    select v_sync_id, v_data, v_updated_at;
end;
$function$;

drop function if exists public.quiz_sync_delete_v2(text, timestamptz, boolean);
drop function if exists public.quiz_sync_delete(text, timestamptz, boolean);

create function public.quiz_sync_delete_v2(
  p_sync_id text,
  p_expected_updated_at timestamptz,
  p_force boolean
)
returns table (
  result_code text,
  sync_id text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  deleted_count integer;
  existing_updated_at timestamptz;
  existing_creator bytea;
  actor bytea := private.quiz_sync_actor_hash();
begin
  perform private.enforce_quiz_sync_rate_limit('delete', 6, interval '1 minute');

  if p_sync_id is null or p_sync_id !~ '^[0-9a-f]{36}$' then
    return query select 'invalid_sync_id'::text, null::text, null::timestamptz;
    return;
  end if;

  perform private.quiz_sync_lock_id(p_sync_id);

  select row_data.updated_at, row_data.creator_hash
    into existing_updated_at, existing_creator
    from public.quiz_sync_data as row_data
    where row_data.sync_id = p_sync_id
    for update;

  if not found then
    return query select 'not_found'::text, null::text, null::timestamptz;
    return;
  end if;

  if existing_creator is not null and existing_creator is distinct from actor then
    return query select 'not_found'::text, null::text, null::timestamptz;
    return;
  end if;

  -- As with upsert, force records explicit confirmation but never bypasses CAS.
  if p_expected_updated_at is null then
    return query select 'revision_required'::text, p_sync_id, existing_updated_at;
    return;
  end if;

  if existing_updated_at is distinct from p_expected_updated_at then
    return query select 'conflict'::text, p_sync_id, existing_updated_at;
    return;
  end if;

  delete from public.quiz_sync_data as row_data
  where row_data.sync_id = p_sync_id
    and row_data.updated_at = p_expected_updated_at;

  get diagnostics deleted_count = row_count;
  if deleted_count > 0 then
    insert into private.quiz_sync_tombstones (sync_id_hash, expires_at)
    values (
      private.quiz_sync_hash('sync:' || p_sync_id),
      clock_timestamp() + interval '90 days'
    )
    on conflict (sync_id_hash) do update
      set deleted_at = clock_timestamp(),
          expires_at = excluded.expires_at;
  end if;

  if deleted_count = 0 then
    return query select 'conflict'::text, p_sync_id, existing_updated_at;
    return;
  end if;

  return query select 'ok'::text, p_sync_id, existing_updated_at;
end;
$function$;

-- Compatibility endpoint for installed clients that only know the historical
-- one-argument function.  It deliberately refuses destructive work because a
-- stale client cannot supply a revision or explicit force confirmation.
create or replace function public.quiz_sync_delete(p_sync_id text)
returns boolean
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
as $function$
begin
  perform result.result_code
  from public.quiz_sync_delete_v2(p_sync_id, null, false) as result;
  return false;
end;
$function$;

drop function if exists public.quiz_sync_create_pairing_code(text);

create function public.quiz_sync_create_pairing_code(p_sync_id text)
returns table (
  result_code text,
  pairing_code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  random_bytes bytea;
  candidate text;
  candidate_hash bytea;
  expiry timestamptz := clock_timestamp() + interval '5 minutes';
  attempt integer;
  actor bytea := private.quiz_sync_actor_hash();
  existing_creator bytea;
begin
  perform private.enforce_quiz_sync_rate_limit('pair_create', 6, interval '1 minute');

  if p_sync_id is null or p_sync_id !~ '^[0-9a-f]{36}$' then
    return query
      select 'invalid_sync_id'::text, null::text, null::timestamptz;
    return;
  end if;

  perform private.quiz_sync_lock_id(p_sync_id);
  select row_data.creator_hash
  into existing_creator
  from public.quiz_sync_data as row_data
  where row_data.sync_id = p_sync_id
  for key share;

  if not found then
    return query select 'not_found'::text, null::text, null::timestamptz;
    return;
  end if;

  if existing_creator is not null and existing_creator is distinct from actor then
    return query select 'not_found'::text, null::text, null::timestamptz;
    return;
  end if;

  if existing_creator is null then
    update public.quiz_sync_data as row_data
      set creator_hash = actor
      where row_data.sync_id = p_sync_id
        and row_data.creator_hash is null;
  end if;

  for attempt in 1..8 loop
    random_bytes := extensions.gen_random_bytes(8);
    select pg_catalog.string_agg(
      pg_catalog.substr(
        alphabet,
        (pg_catalog.get_byte(random_bytes, position) % 32) + 1,
        1
      ),
      '' order by position
    )
    into candidate
    from pg_catalog.generate_series(0, 7) as position;

    candidate_hash := private.quiz_sync_hash('pair:' || candidate);
    begin
      -- This subtransaction preserves the previous code if the newly generated
      -- hash happens to collide with another sync's code.
      delete from public.quiz_sync_pairing_codes as pairing
      where pairing.sync_id = p_sync_id;

      insert into public.quiz_sync_pairing_codes (code_hash, sync_id, expires_at)
      values (candidate_hash, p_sync_id, expiry);
      return query select 'ok'::text, candidate, expiry;
      return;
    exception when unique_violation then
      null;
    end;
  end loop;

  return query select 'unavailable'::text, null::text, null::timestamptz;
end;
$function$;

drop function if exists public.quiz_sync_redeem_pairing_code(text);

create function public.quiz_sync_redeem_pairing_code(p_pairing_code text)
returns table (
  result_code text,
  sync_id text
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  normalized_code text := pg_catalog.upper(
    pg_catalog.replace(
      pg_catalog.replace(coalesce(p_pairing_code, ''), '-', ''),
      ' ',
      ''
    )
  );
  candidate_sync_id text;
  locked_sync_id text;
  redeemed_sync_id text;
  actor bytea := private.quiz_sync_actor_hash();
begin
  perform private.enforce_quiz_sync_rate_limit('pair_redeem', 20, interval '1 minute');

  if normalized_code !~ '^[0-9A-HJKMNP-TV-Z]{8}$' then
    return query select 'invalid_pairing_code'::text, null::text;
    return;
  end if;

  -- Read first without a row lock, then acquire the same advisory lock used by
  -- every other mutation for this sync ID. Taking a row lock first would
  -- deadlock with code creation, which takes the advisory lock first.
  select pairing.sync_id
    into candidate_sync_id
    from public.quiz_sync_pairing_codes as pairing
    join public.quiz_sync_data as row_data on row_data.sync_id = pairing.sync_id
    where pairing.code_hash = private.quiz_sync_hash('pair:' || normalized_code)
      and pairing.expires_at > clock_timestamp()
      and (row_data.creator_hash is null or row_data.creator_hash = actor);

  if candidate_sync_id is null then
    return query select 'not_found_or_expired'::text, null::text;
    return;
  end if;

  perform private.quiz_sync_lock_id(candidate_sync_id);

  -- A legacy-ID upgrade may have cascaded the pairing row to a new ID while
  -- this request waited. Lock that authoritative ID as well before consuming
  -- the token.
  select pairing.sync_id
    into locked_sync_id
    from public.quiz_sync_pairing_codes as pairing
    join public.quiz_sync_data as row_data on row_data.sync_id = pairing.sync_id
    where pairing.code_hash = private.quiz_sync_hash('pair:' || normalized_code)
      and pairing.expires_at > clock_timestamp()
      and (row_data.creator_hash is null or row_data.creator_hash = actor);

  if locked_sync_id is null then
    return query select 'not_found_or_expired'::text, null::text;
    return;
  end if;

  if locked_sync_id is distinct from candidate_sync_id then
    perform private.quiz_sync_lock_id(locked_sync_id);
  end if;

  update public.quiz_sync_data as row_data
    set creator_hash = actor
    where row_data.sync_id = locked_sync_id
      and row_data.creator_hash is null;

  delete from public.quiz_sync_pairing_codes as pairing
  where pairing.code_hash = private.quiz_sync_hash('pair:' || normalized_code)
    and pairing.expires_at > clock_timestamp()
  returning pairing.sync_id into redeemed_sync_id;

  if redeemed_sync_id is null then
    return query select 'not_found_or_expired'::text, null::text;
    return;
  end if;

  return query select 'ok'::text, redeemed_sync_id;
end;
$function$;

drop function if exists public.quiz_sync_upgrade_legacy_id(text, timestamptz);
drop function if exists public.quiz_sync_upgrade_legacy_id(text, timestamptz, text);

create function public.quiz_sync_upgrade_legacy_id(
  p_legacy_sync_id text,
  p_expected_updated_at timestamptz,
  p_candidate_sync_id text
)
returns table (
  result_code text,
  sync_id text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
as $function$
declare
  existing_updated_at timestamptz;
  existing_creator bytea;
  existing_payload_bytes integer;
  candidate_updated_at timestamptz;
  legacy_hash_value bytea;
  mapped_sync_id text;
  mapped_updated_at timestamptz;
  mapped_creator bytea;
  mapping_created_at timestamptz;
  quota_actor bytea := private.quiz_sync_actor_hash();
  candidate_creator bytea;
  other_row_count integer;
  other_payload_bytes bigint;
begin
  perform private.enforce_quiz_sync_rate_limit('legacy_upgrade', 5, interval '1 hour');

  if p_legacy_sync_id is null
    or p_legacy_sync_id !~ '^[A-Za-z0-9_-]{5,128}$'
    or p_legacy_sync_id ~ '^[0-9a-f]{36}$'
    or p_expected_updated_at is null
    or p_candidate_sync_id is null
    or p_candidate_sync_id !~ '^[0-9a-f]{36}$'
  then
    return query
      select 'invalid_legacy_sync_id'::text, null::text, null::timestamptz;
    return;
  end if;

  perform private.quiz_sync_lock_id(p_legacy_sync_id);
  legacy_hash_value := private.quiz_sync_hash('legacy:' || p_legacy_sync_id);

  -- Read the winner without a row lock, then acquire its standard advisory lock
  -- before re-reading. This preserves the global ID-before-row lock ordering used
  -- by delete/upsert and avoids deadlocking a cascading winner deletion.
  select migration.winner_sync_id, migration.winner_updated_at, migration.creator_hash
    into mapped_sync_id, mapped_updated_at, mapped_creator
    from private.quiz_sync_legacy_migrations as migration
    where migration.legacy_id_hash = legacy_hash_value
      and migration.expires_at > clock_timestamp();

  if found then
    if mapped_creator is not null and mapped_creator is distinct from quota_actor then
      return query select 'not_found'::text, null::text, null::timestamptz;
      return;
    end if;

    perform private.quiz_sync_lock_id(mapped_sync_id);
    select migration.winner_sync_id, migration.winner_updated_at, migration.creator_hash
      into mapped_sync_id, mapped_updated_at, mapped_creator
      from private.quiz_sync_legacy_migrations as migration
      where migration.legacy_id_hash = legacy_hash_value
        and migration.expires_at > clock_timestamp();

    if found then
      if mapped_creator is not null and mapped_creator is distinct from quota_actor then
        return query select 'not_found'::text, null::text, null::timestamptz;
        return;
      end if;

      if mapped_updated_at is distinct from p_expected_updated_at then
        return query select 'conflict'::text, null::text, null::timestamptz;
        return;
      end if;

      update public.quiz_sync_data as row_data
        set creator_hash = quota_actor
        where row_data.sync_id = mapped_sync_id
          and row_data.creator_hash is null;

      if exists (
        select 1 from public.quiz_sync_data as row_data
        where row_data.sync_id = mapped_sync_id
          and row_data.creator_hash = quota_actor
      ) then
        update private.quiz_sync_legacy_migrations as migration
          set creator_hash = quota_actor
          where migration.legacy_id_hash = legacy_hash_value
            and migration.creator_hash is null;
        return query select 'ok'::text, mapped_sync_id, mapped_updated_at;
        return;
      end if;

      return query select 'not_found'::text, null::text, null::timestamptz;
      return;
    end if;

    -- The mapping was removed while waiting for its winner (expiry cleanup or
    -- winner deletion). Do not acquire a second, arbitrarily ordered strong-ID
    -- lock in this transaction; the caller can retry from a clean lock set.
    return query select 'not_found'::text, null::text, null::timestamptz;
    return;
  end if;

  -- Idempotent retries of completed mappings remain available for their bounded
  -- TTL even after the window closes; only a new rotation is date-gated.
  if clock_timestamp() >= timestamptz '2027-08-15 00:00:00+00' then
    return query
      select 'migration_expired'::text, null::text, null::timestamptz;
    return;
  end if;

  delete from private.quiz_sync_legacy_migrations as migration
  where migration.legacy_id_hash = legacy_hash_value
    and migration.expires_at <= clock_timestamp();

  perform private.quiz_sync_lock_id(p_candidate_sync_id);

  select row_data.updated_at, row_data.creator_hash, row_data.payload_bytes
    into existing_updated_at, existing_creator, existing_payload_bytes
    from public.quiz_sync_data as row_data
    where row_data.sync_id = p_legacy_sync_id
    for update;

  if not found then
    -- A successful rotation can commit even if its HTTP response is lost. The
    -- client persists its candidate before calling, so the same request is an
    -- idempotent success when that candidate now holds the expected revision.
    select row_data.updated_at, row_data.creator_hash
      into candidate_updated_at, candidate_creator
      from public.quiz_sync_data as row_data
      where row_data.sync_id = p_candidate_sync_id
      for update;

    if found then
      if candidate_creator is not null and candidate_creator is distinct from quota_actor then
        return query select 'not_found'::text, null::text, null::timestamptz;
        return;
      end if;

      if candidate_updated_at is distinct from p_expected_updated_at then
        return query select 'conflict'::text, null::text, null::timestamptz;
        return;
      end if;

      update public.quiz_sync_data as row_data
        set creator_hash = quota_actor
        where row_data.sync_id = p_candidate_sync_id
          and row_data.creator_hash is null;
      return query select 'ok'::text, p_candidate_sync_id, candidate_updated_at;
      return;
    end if;

    if exists (
      select 1
      from private.quiz_sync_tombstones as tombstone
      where tombstone.sync_id_hash = private.quiz_sync_hash('sync:' || p_candidate_sync_id)
        and tombstone.expires_at > clock_timestamp()
    ) then
      return query select 'deleted'::text, null::text, null::timestamptz;
      return;
    end if;

    return query select 'not_found'::text, null::text, null::timestamptz;
    return;
  end if;

  if existing_updated_at is distinct from p_expected_updated_at then
    return query select 'conflict'::text, null::text, null::timestamptz;
    return;
  end if;

  if existing_creator is not null and existing_creator is distinct from quota_actor then
    return query select 'not_found'::text, null::text, null::timestamptz;
    return;
  end if;

  select row_data.updated_at, row_data.creator_hash
    into candidate_updated_at, candidate_creator
    from public.quiz_sync_data as row_data
    where row_data.sync_id = p_candidate_sync_id
    for update;
  if found then
    return query select case
      when candidate_creator is null or candidate_creator = quota_actor then 'conflict'
      else 'not_found'
    end::text, null::text, null::timestamptz;
    return;
  end if;

  -- A caller-generated candidate is still unusable while protected by a live
  -- deletion tombstone. The client must generate a different pending candidate.
  if exists (
    select 1
    from private.quiz_sync_tombstones as tombstone
    where tombstone.sync_id_hash = private.quiz_sync_hash('sync:' || p_candidate_sync_id)
      and tombstone.expires_at > clock_timestamp()
  ) then
    return query select 'unavailable'::text, null::text, null::timestamptz;
    return;
  end if;

  -- Rows created before creator_hash existed join the current actor's quota on
  -- migration. Serialize and account for that ownership transfer first.
  if existing_creator is null then
    perform private.quiz_sync_lock_quota_actor(quota_actor);
    select count(*), coalesce(sum(row_data.payload_bytes), 0)
      into other_row_count, other_payload_bytes
      from public.quiz_sync_data as row_data
      where row_data.creator_hash = quota_actor
        and row_data.sync_id <> p_legacy_sync_id
        and row_data.sync_id <> p_candidate_sync_id;

    if other_row_count >= 50
      or other_payload_bytes + existing_payload_bytes > 134217728
    then
      return query select 'quota_exceeded'::text, null::text, null::timestamptz;
      return;
    end if;
  end if;

  begin
    update public.quiz_sync_data as row_data
    set sync_id = p_candidate_sync_id,
        last_accessed_at = clock_timestamp(),
        creator_hash = quota_actor
    where row_data.sync_id = p_legacy_sync_id;
  exception when unique_violation then
    return query select 'unavailable'::text, null::text, null::timestamptz;
    return;
  end;

  mapping_created_at := clock_timestamp();
  insert into private.quiz_sync_legacy_migrations (
    legacy_id_hash,
    winner_sync_id,
    winner_updated_at,
    creator_hash,
    created_at,
    expires_at
  ) values (
    legacy_hash_value,
    p_candidate_sync_id,
    existing_updated_at,
    quota_actor,
    mapping_created_at,
    mapping_created_at + interval '90 days'
  );

  return query select 'ok'::text, p_candidate_sync_id, existing_updated_at;
  return;
end;
$function$;

revoke all on function public.quiz_sync_read(text) from public, anon, authenticated;
revoke all on function public.quiz_sync_meta(text) from public, anon, authenticated;
revoke all on function public.quiz_sync_probe(text) from public, anon, authenticated;
revoke all on function public.quiz_sync_upsert(text, jsonb, timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.quiz_sync_upsert_v2(text, jsonb, timestamptz, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.quiz_sync_delete_v2(text, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.quiz_sync_delete(text) from public, anon, authenticated;
revoke all on function public.quiz_sync_create_pairing_code(text) from public, anon, authenticated;
revoke all on function public.quiz_sync_redeem_pairing_code(text) from public, anon, authenticated;
revoke all on function public.quiz_sync_upgrade_legacy_id(text, timestamptz, text) from public, anon, authenticated;

grant execute on function public.quiz_sync_read(text) to authenticated;
grant execute on function public.quiz_sync_meta(text) to authenticated;
grant execute on function public.quiz_sync_probe(text) to authenticated;
grant execute on function public.quiz_sync_upsert(text, jsonb, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.quiz_sync_upsert_v2(text, jsonb, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.quiz_sync_delete_v2(text, timestamptz, boolean) to authenticated;
grant execute on function public.quiz_sync_delete(text) to authenticated;
grant execute on function public.quiz_sync_create_pairing_code(text) to authenticated;
grant execute on function public.quiz_sync_redeem_pairing_code(text) to authenticated;
grant execute on function public.quiz_sync_upgrade_legacy_id(text, timestamptz, text) to authenticated;

comment on table public.quiz_sync_pairing_codes is
  'Hashed, one-time, five-minute pairing codes. Plain codes are returned only at creation.';
comment on table private.quiz_sync_legacy_migrations is
  'Bounded account-owned HMAC-keyed legacy migration winners for retry convergence; never stores a legacy ID.';
comment on function public.quiz_sync_meta(text) is
  'Returns only the authoritative server revision for a strong sync ID.';
comment on function public.quiz_sync_upsert(text, jsonb, timestamptz, timestamptz, boolean) is
  'Legacy three-column compatibility endpoint; expected failures return an intentionally invalid row.';
comment on function public.quiz_sync_upsert_v2(text, jsonb, timestamptz, timestamptz, boolean) is
  'CAS-protected sync write endpoint with explicit result codes for current clients.';
comment on function public.quiz_sync_delete_v2(text, timestamptz, boolean) is
  'CAS-protected sync deletion endpoint; force confirmation never bypasses the expected revision.';
comment on function public.quiz_sync_delete(text) is
  'Legacy one-argument compatibility endpoint; always returns false and never deletes data.';
comment on function public.quiz_sync_create_pairing_code(text) is
  'Creates a one-time 8-character pairing code for an existing strong sync ID.';
comment on function public.quiz_sync_redeem_pairing_code(text) is
  'Atomically redeems a one-time pairing code and returns the strong sync ID.';
comment on function public.quiz_sync_upgrade_legacy_id(text, timestamptz, text) is
  'Time-limited, retry-safe legacy migration using a client-persisted strong-ID candidate and exact revision.';

-- Quiz Make collaboration schema. Uses the next migration id to avoid a same-day version collision.
create extension if not exists pgcrypto;

create table if not exists public.quiz_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Quiz Make ユーザー' check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_group_members (
  group_id uuid not null references public.quiz_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.shared_problem_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  local_set_id text not null,
  author_name text not null default 'Quiz Make ユーザー' check (char_length(author_name) between 1 and 40),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  subject text not null default '' check (char_length(subject) <= 80),
  audience text not null default '' check (char_length(audience) <= 80),
  difficulty text not null default 'basic' check (char_length(difficulty) <= 40),
  creation_method text not null default 'manual' check (creation_method in ('manual', 'bulk', 'chatgpt', 'copy', 'import', 'public-copy')),
  source text not null default '' check (char_length(source) <= 500),
  visibility text not null default 'link' check (visibility in ('group', 'link', 'public')),
  share_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  question_count integer not null default 0 check (question_count >= 0),
  add_count integer not null default 0 check (add_count >= 0),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, local_set_id),
  unique (share_token)
);

create table if not exists public.shared_questions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.shared_problem_sets(id) on delete cascade,
  position integer not null check (position >= 0),
  question text not null check (char_length(question) between 1 and 10000),
  choices jsonb not null check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) between 4 and 5),
  answer_indexes integer[] not null check (cardinality(answer_indexes) >= 1),
  answer_text text not null default '',
  explanation text not null default '',
  detailed_explanation text not null default '',
  source_page text not null default '',
  category text not null default '',
  difficulty text not null default 'basic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, position)
);

create table if not exists public.quiz_group_problem_sets (
  group_id uuid not null references public.quiz_groups(id) on delete cascade,
  set_id uuid not null references public.shared_problem_sets(id) on delete cascade,
  shared_by uuid not null references auth.users(id) on delete cascade,
  shared_at timestamptz not null default now(),
  primary key (group_id, set_id)
);

create table if not exists public.quiz_group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.quiz_groups(id) on delete cascade,
  code text not null unique default upper(substr(encode(extensions.gen_random_bytes(9), 'hex'), 1, 12)),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses integer not null default 50 check (max_uses between 1 and 1000),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.problem_set_copies (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.shared_problem_sets(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  installation_id uuid not null,
  local_set_id text not null default '',
  copied_at timestamptz not null default now(),
  unique (set_id, installation_id)
);

create table if not exists public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.shared_problem_sets(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text not null check (reason in ('incorrect', 'copyright', 'inappropriate', 'spam', 'other')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (set_id, reporter_id)
);

create index if not exists shared_problem_sets_public_index on public.shared_problem_sets (visibility, published_at desc);
create index if not exists shared_problem_sets_popular_index on public.shared_problem_sets (visibility, add_count desc);
create index if not exists shared_problem_sets_owner_index on public.shared_problem_sets (owner_id, updated_at desc);
create index if not exists shared_questions_set_index on public.shared_questions (set_id, position);
create index if not exists quiz_group_members_user_index on public.quiz_group_members (user_id, joined_at desc);
create index if not exists quiz_group_problem_sets_group_index on public.quiz_group_problem_sets (group_id, shared_at desc);

create or replace function public.is_quiz_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quiz_group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

create or replace function public.is_quiz_group_admin(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quiz_group_members
    where group_id = p_group_id and user_id = p_user_id and role in ('owner', 'admin')
  );
$$;

alter table public.quiz_profiles enable row level security;
alter table public.quiz_groups enable row level security;
alter table public.quiz_group_members enable row level security;
alter table public.shared_problem_sets enable row level security;
alter table public.shared_questions enable row level security;
alter table public.quiz_group_problem_sets enable row level security;
alter table public.quiz_group_invites enable row level security;
alter table public.problem_set_copies enable row level security;
alter table public.problem_reports enable row level security;

drop policy if exists quiz_profiles_self_select on public.quiz_profiles;
create policy quiz_profiles_self_select on public.quiz_profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists quiz_profiles_self_update on public.quiz_profiles;
create policy quiz_profiles_self_update on public.quiz_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists quiz_groups_member_select on public.quiz_groups;
create policy quiz_groups_member_select on public.quiz_groups for select to authenticated using (public.is_quiz_group_member(id));
drop policy if exists quiz_groups_owner_update on public.quiz_groups;
create policy quiz_groups_owner_update on public.quiz_groups for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists quiz_groups_owner_delete on public.quiz_groups;
create policy quiz_groups_owner_delete on public.quiz_groups for delete to authenticated using (owner_id = auth.uid());

drop policy if exists quiz_group_members_member_select on public.quiz_group_members;
create policy quiz_group_members_member_select on public.quiz_group_members for select to authenticated using (public.is_quiz_group_member(group_id));
drop policy if exists quiz_group_members_admin_delete on public.quiz_group_members;
create policy quiz_group_members_admin_delete on public.quiz_group_members for delete to authenticated using (public.is_quiz_group_admin(group_id) and role <> 'owner');

drop policy if exists shared_sets_visible_select on public.shared_problem_sets;
create policy shared_sets_visible_select on public.shared_problem_sets for select to anon, authenticated using (
  visibility = 'public'
  or owner_id = auth.uid()
  or exists (
    select 1 from public.quiz_group_problem_sets links
    where links.set_id = id and public.is_quiz_group_member(links.group_id)
  )
);
drop policy if exists shared_sets_owner_insert on public.shared_problem_sets;
create policy shared_sets_owner_insert on public.shared_problem_sets for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists shared_sets_owner_update on public.shared_problem_sets;
create policy shared_sets_owner_update on public.shared_problem_sets for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists shared_sets_owner_delete on public.shared_problem_sets;
create policy shared_sets_owner_delete on public.shared_problem_sets for delete to authenticated using (owner_id = auth.uid());

drop policy if exists shared_questions_visible_select on public.shared_questions;
create policy shared_questions_visible_select on public.shared_questions for select to anon, authenticated using (
  exists (
    select 1 from public.shared_problem_sets sets
    where sets.id = set_id and (
      sets.visibility = 'public'
      or sets.owner_id = auth.uid()
      or exists (
        select 1 from public.quiz_group_problem_sets links
        where links.set_id = sets.id and public.is_quiz_group_member(links.group_id)
      )
    )
  )
);
drop policy if exists shared_questions_owner_insert on public.shared_questions;
create policy shared_questions_owner_insert on public.shared_questions for insert to authenticated with check (
  exists (select 1 from public.shared_problem_sets sets where sets.id = set_id and sets.owner_id = auth.uid())
);
drop policy if exists shared_questions_owner_update on public.shared_questions;
create policy shared_questions_owner_update on public.shared_questions for update to authenticated using (
  exists (select 1 from public.shared_problem_sets sets where sets.id = set_id and sets.owner_id = auth.uid())
);
drop policy if exists shared_questions_owner_delete on public.shared_questions;
create policy shared_questions_owner_delete on public.shared_questions for delete to authenticated using (
  exists (select 1 from public.shared_problem_sets sets where sets.id = set_id and sets.owner_id = auth.uid())
);

drop policy if exists group_set_links_member_select on public.quiz_group_problem_sets;
create policy group_set_links_member_select on public.quiz_group_problem_sets for select to authenticated using (public.is_quiz_group_member(group_id));
drop policy if exists group_set_links_owner_insert on public.quiz_group_problem_sets;
create policy group_set_links_owner_insert on public.quiz_group_problem_sets for insert to authenticated with check (
  public.is_quiz_group_member(group_id)
  and shared_by = auth.uid()
  and exists (select 1 from public.shared_problem_sets sets where sets.id = set_id and sets.owner_id = auth.uid())
);
drop policy if exists group_set_links_sharer_delete on public.quiz_group_problem_sets;
create policy group_set_links_sharer_delete on public.quiz_group_problem_sets for delete to authenticated using (
  shared_by = auth.uid() or public.is_quiz_group_admin(group_id)
);

drop policy if exists group_invites_admin_select on public.quiz_group_invites;
create policy group_invites_admin_select on public.quiz_group_invites for select to authenticated using (public.is_quiz_group_admin(group_id));

drop policy if exists reports_reporter_insert on public.problem_reports;
create policy reports_reporter_insert on public.problem_reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists reports_reporter_select on public.problem_reports;
create policy reports_reporter_select on public.problem_reports for select to authenticated using (reporter_id = auth.uid());

create or replace function public.handle_quiz_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.quiz_profiles (user_id, display_name)
  values (new.id, coalesce(nullif(split_part(new.email, '@', 1), ''), 'Quiz Make ユーザー'))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_quiz_auth_user_created on auth.users;
create trigger on_quiz_auth_user_created
after insert on auth.users
for each row execute function public.handle_quiz_user_created();

insert into public.quiz_profiles (user_id, display_name)
select id, coalesce(nullif(split_part(email, '@', 1), ''), 'Quiz Make ユーザー')
from auth.users
on conflict (user_id) do nothing;

create or replace function public.set_profile_display_name(p_display_name text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  update public.quiz_profiles
  set display_name = trim(p_display_name), updated_at = now()
  where user_id = auth.uid();
end;
$$;

create or replace function public.publish_problem_set(p_set jsonb, p_questions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_set_id uuid;
  target_share_token text;
  target_visibility text := coalesce(p_set->>'visibility', 'link');
  question_item jsonb;
  group_id_text text;
  answer_values integer[];
  choice_count integer;
begin
  if current_user_id is null then raise exception 'not authorized'; end if;
  if target_visibility not in ('group', 'link', 'public') then raise exception 'invalid visibility'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 1000 then
    raise exception 'invalid questions';
  end if;
  if char_length(trim(coalesce(p_set->>'title', ''))) not between 1 and 160 then raise exception 'invalid title'; end if;

  insert into public.shared_problem_sets (
    owner_id, local_set_id, author_name, title, description, subject, audience,
    difficulty, creation_method, source, visibility, question_count, published_at, updated_at
  ) values (
    current_user_id,
    left(coalesce(p_set->>'local_set_id', ''), 200),
    left(coalesce(nullif(trim(p_set->>'author_name'), ''), 'Quiz Make ユーザー'), 40),
    trim(p_set->>'title'),
    left(coalesce(p_set->>'description', ''), 2000),
    left(coalesce(p_set->>'subject', ''), 80),
    left(coalesce(p_set->>'audience', ''), 80),
    left(coalesce(p_set->>'difficulty', 'basic'), 40),
    case when p_set->>'creation_method' in ('manual','bulk','chatgpt','copy','import','public-copy') then p_set->>'creation_method' else 'manual' end,
    left(coalesce(p_set->>'source', ''), 500),
    target_visibility,
    jsonb_array_length(p_questions),
    now(),
    now()
  )
  on conflict (owner_id, local_set_id) do update set
    author_name = excluded.author_name,
    title = excluded.title,
    description = excluded.description,
    subject = excluded.subject,
    audience = excluded.audience,
    difficulty = excluded.difficulty,
    creation_method = excluded.creation_method,
    source = excluded.source,
    visibility = excluded.visibility,
    question_count = excluded.question_count,
    updated_at = now()
  returning id, share_token into target_set_id, target_share_token;

  delete from public.shared_questions where set_id = target_set_id;
  delete from public.quiz_group_problem_sets where set_id = target_set_id;

  for question_item in select value from jsonb_array_elements(p_questions)
  loop
    choice_count := jsonb_array_length(question_item->'choices');
    if choice_count not between 4 and 5 or char_length(trim(coalesce(question_item->>'question', ''))) = 0 then
      raise exception 'invalid question';
    end if;
    select array_agg(value::integer order by value::integer)
    into answer_values
    from jsonb_array_elements_text(question_item->'answer_indexes');
    if answer_values is null or exists (select 1 from unnest(answer_values) index_value where index_value < 0 or index_value >= choice_count) then
      raise exception 'invalid answer';
    end if;

    insert into public.shared_questions (
      set_id, position, question, choices, answer_indexes, answer_text, explanation,
      detailed_explanation, source_page, category, difficulty
    ) values (
      target_set_id,
      coalesce((question_item->>'position')::integer, 0),
      trim(question_item->>'question'),
      question_item->'choices',
      answer_values,
      left(coalesce(question_item->>'answer_text', ''), 10000),
      left(coalesce(question_item->>'explanation', ''), 30000),
      left(coalesce(question_item->>'detailed_explanation', ''), 60000),
      left(coalesce(question_item->>'source_page', ''), 500),
      left(coalesce(question_item->>'category', ''), 120),
      left(coalesce(question_item->>'difficulty', 'basic'), 40)
    );
  end loop;

  if target_visibility = 'group' then
    if jsonb_typeof(coalesce(p_set->'group_ids', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_set->'group_ids', '[]'::jsonb)) = 0 then
      raise exception 'group required';
    end if;
    for group_id_text in select value from jsonb_array_elements_text(p_set->'group_ids')
    loop
      if not public.is_quiz_group_member(group_id_text::uuid, current_user_id) then raise exception 'not authorized'; end if;
      insert into public.quiz_group_problem_sets (group_id, set_id, shared_by)
      values (group_id_text::uuid, target_set_id, current_user_id)
      on conflict do nothing;
    end loop;
  end if;

  return jsonb_build_object('id', target_set_id, 'share_token', target_share_token, 'visibility', target_visibility);
end;
$$;

create or replace function public.get_shared_problem_set(p_set_id uuid, p_share_token text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  set_row public.shared_problem_sets%rowtype;
  allowed boolean := false;
begin
  select * into set_row from public.shared_problem_sets where id = p_set_id;
  if not found then return null; end if;
  allowed := set_row.visibility = 'public'
    or set_row.owner_id = auth.uid()
    or (p_share_token is not null and p_share_token = set_row.share_token)
    or exists (
      select 1 from public.quiz_group_problem_sets links
      where links.set_id = set_row.id and public.is_quiz_group_member(links.group_id)
    );
  if not allowed then raise exception 'not authorized'; end if;

  return jsonb_build_object(
    'id', set_row.id,
    'owner_id', set_row.owner_id,
    'author_name', set_row.author_name,
    'title', set_row.title,
    'description', set_row.description,
    'subject', set_row.subject,
    'audience', set_row.audience,
    'difficulty', set_row.difficulty,
    'creation_method', set_row.creation_method,
    'source', set_row.source,
    'visibility', set_row.visibility,
    'question_count', set_row.question_count,
    'add_count', set_row.add_count,
    'published_at', set_row.published_at,
    'updated_at', set_row.updated_at,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'question', question,
        'choices', choices,
        'answer_indexes', answer_indexes,
        'answer_text', answer_text,
        'explanation', explanation,
        'detailed_explanation', detailed_explanation,
        'source_page', source_page,
        'category', category,
        'difficulty', difficulty
      ) order by position)
      from public.shared_questions where set_id = set_row.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.record_problem_set_copy(p_set_id uuid, p_installation_id uuid, p_local_set_id text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare inserted_count integer;
begin
  if not exists (select 1 from public.shared_problem_sets where id = p_set_id) then raise exception 'set not found'; end if;
  insert into public.problem_set_copies (set_id, actor_id, installation_id, local_set_id)
  values (p_set_id, auth.uid(), p_installation_id, left(coalesce(p_local_set_id, ''), 200))
  on conflict (set_id, installation_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count > 0 then
    update public.shared_problem_sets set add_count = add_count + 1 where id = p_set_id;
  end if;
end;
$$;

create or replace function public.create_quiz_group(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare group_row public.quiz_groups%rowtype;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  if char_length(trim(p_name)) not between 1 and 60 then raise exception 'invalid group name'; end if;
  insert into public.quiz_groups (owner_id, name) values (auth.uid(), trim(p_name)) returning * into group_row;
  insert into public.quiz_group_members (group_id, user_id, role) values (group_row.id, auth.uid(), 'owner');
  return jsonb_build_object('id', group_row.id, 'name', group_row.name, 'role', 'owner', 'member_count', 1, 'set_count', 0);
end;
$$;

create or replace function public.list_my_groups()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', groups.id,
    'name', groups.name,
    'role', mine.role,
    'member_count', (select count(*) from public.quiz_group_members members where members.group_id = groups.id),
    'set_count', (select count(*) from public.quiz_group_problem_sets links where links.group_id = groups.id)
  ) order by groups.updated_at desc), '[]'::jsonb)
  from public.quiz_groups groups
  join public.quiz_group_members mine on mine.group_id = groups.id and mine.user_id = auth.uid();
$$;

create or replace function public.create_group_invite(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare invite_row public.quiz_group_invites%rowtype;
begin
  if not public.is_quiz_group_admin(p_group_id) then raise exception 'not authorized'; end if;
  insert into public.quiz_group_invites (group_id, created_by) values (p_group_id, auth.uid()) returning * into invite_row;
  return jsonb_build_object('code', invite_row.code, 'expires_at', invite_row.expires_at);
end;
$$;

create or replace function public.join_quiz_group(p_invite_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare invite_row public.quiz_group_invites%rowtype;
declare group_row public.quiz_groups%rowtype;
begin
  if auth.uid() is null then raise exception 'not authorized'; end if;
  select * into invite_row from public.quiz_group_invites
  where code = upper(trim(p_invite_code)) and revoked_at is null and expires_at > now() and use_count < max_uses
  for update;
  if not found then raise exception 'invalid invite'; end if;
  insert into public.quiz_group_members (group_id, user_id, role)
  values (invite_row.group_id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;
  if found then update public.quiz_group_invites set use_count = use_count + 1 where id = invite_row.id; end if;
  select * into group_row from public.quiz_groups where id = invite_row.group_id;
  return jsonb_build_object(
    'id', group_row.id, 'name', group_row.name, 'role', 'member',
    'member_count', (select count(*) from public.quiz_group_members where group_id = group_row.id),
    'set_count', (select count(*) from public.quiz_group_problem_sets where group_id = group_row.id)
  );
end;
$$;

create or replace function public.remove_quiz_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() <> p_user_id and not public.is_quiz_group_admin(p_group_id) then raise exception 'not authorized'; end if;
  if exists (select 1 from public.quiz_group_members where group_id = p_group_id and user_id = p_user_id and role = 'owner') then
    raise exception 'owner cannot be removed';
  end if;
  delete from public.quiz_group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.list_group_problem_sets(p_group_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_quiz_group_member(p_group_id) then coalesce(jsonb_agg(jsonb_build_object(
    'id', sets.id,
    'owner_id', sets.owner_id,
    'author_name', sets.author_name,
    'title', sets.title,
    'description', sets.description,
    'subject', sets.subject,
    'audience', sets.audience,
    'difficulty', sets.difficulty,
    'creation_method', sets.creation_method,
    'source', sets.source,
    'visibility', sets.visibility,
    'question_count', sets.question_count,
    'add_count', sets.add_count,
    'published_at', sets.published_at,
    'updated_at', sets.updated_at
  ) order by links.shared_at desc), '[]'::jsonb) else '[]'::jsonb end
  from public.quiz_group_problem_sets links
  join public.shared_problem_sets sets on sets.id = links.set_id
  where links.group_id = p_group_id;
$$;

revoke all on function public.is_quiz_group_member(uuid, uuid) from public;
revoke all on function public.is_quiz_group_admin(uuid, uuid) from public;
revoke all on function public.set_profile_display_name(text) from public;
revoke all on function public.publish_problem_set(jsonb, jsonb) from public;
revoke all on function public.get_shared_problem_set(uuid, text) from public;
revoke all on function public.record_problem_set_copy(uuid, uuid, text) from public;
revoke all on function public.create_quiz_group(text) from public;
revoke all on function public.list_my_groups() from public;
revoke all on function public.create_group_invite(uuid) from public;
revoke all on function public.join_quiz_group(text) from public;
revoke all on function public.remove_quiz_group_member(uuid, uuid) from public;
revoke all on function public.list_group_problem_sets(uuid) from public;

grant execute on function public.is_quiz_group_member(uuid, uuid) to authenticated;
grant execute on function public.is_quiz_group_admin(uuid, uuid) to authenticated;
grant execute on function public.set_profile_display_name(text) to authenticated;
grant execute on function public.publish_problem_set(jsonb, jsonb) to authenticated;
grant execute on function public.get_shared_problem_set(uuid, text) to anon, authenticated;
grant execute on function public.record_problem_set_copy(uuid, uuid, text) to anon, authenticated;
grant execute on function public.create_quiz_group(text) to authenticated;
grant execute on function public.list_my_groups() to authenticated;
grant execute on function public.create_group_invite(uuid) to authenticated;
grant execute on function public.join_quiz_group(text) to authenticated;
grant execute on function public.remove_quiz_group_member(uuid, uuid) to authenticated;
grant execute on function public.list_group_problem_sets(uuid) to authenticated;

grant select on public.shared_problem_sets to anon, authenticated;
grant select on public.shared_questions to anon, authenticated;
grant select, update, delete on public.quiz_groups to authenticated;
grant select, delete on public.quiz_group_members to authenticated;
grant select, insert, update, delete on public.shared_problem_sets to authenticated;
grant select, insert, update, delete on public.shared_questions to authenticated;
grant select, insert, delete on public.quiz_group_problem_sets to authenticated;
grant select on public.quiz_group_invites to authenticated;
grant select, update on public.quiz_profiles to authenticated;
grant select, insert on public.problem_reports to authenticated;

comment on table public.shared_problem_sets is 'Published snapshots. Local problem sets remain device-owned and are never overwritten by cloud copies.';
comment on function public.get_shared_problem_set(uuid, text) is 'Returns a set only when public, owner/group accessible, or the exact link token is supplied.';

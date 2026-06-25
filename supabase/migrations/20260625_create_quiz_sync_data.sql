create table if not exists public.quiz_sync_data (
  sync_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
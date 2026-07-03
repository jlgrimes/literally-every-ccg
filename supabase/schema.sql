-- Multiplayer duel matches. Run this once in the Supabase SQL editor, then
-- set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the deployment env.
-- The service role key is only ever used server-side (API routes).
create table if not exists matches (
  code text primary key,
  status text not null default 'waiting', -- waiting | active | done
  host_name text,
  guest_name text,
  host_token text,
  guest_token text,
  host_deck jsonb,
  state jsonb,
  seq int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table matches enable row level security; -- no anon policies: server-only access

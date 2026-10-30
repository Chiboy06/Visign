-- Visign v1 schema. No accounts: the server uses the service role; RLS with no policies
-- blocks the anon/authenticated roles entirely.

create table public.signs (
  id bigint generated always as identity primary key,
  language text not null check (language in ('nsl', 'asl')),
  gloss text not null,
  kind text not null check (kind in ('letter', 'word')),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  version int not null default 1,
  motion_path text, -- Supabase Storage path of the motion JSON
  created_at timestamptz not null default now(),
  unique (language, gloss, version)
);

create table public.recordings (
  id bigint generated always as identity primary key,
  sign_id bigint not null references public.signs (id) on delete cascade,
  contributor text not null, -- anonymous device id
  consent boolean not null check (consent),
  motion_path text not null,
  created_at timestamptz not null default now()
);
create index recordings_sign_id_idx on public.recordings (sign_id);
create index recordings_contributor_idx on public.recordings (contributor);

create table public.corrections (
  id bigint generated always as identity primary key,
  session_id text not null,
  predicted jsonb not null, -- top-3 guesses with confidence
  chosen text not null,
  created_at timestamptz not null default now()
);

create table public.usage_ledger (
  id bigint generated always as identity primary key,
  endpoint text not null,
  cost_usd numeric(12, 6) not null check (cost_usd >= 0),
  session_id text,
  created_at timestamptz not null default now()
);

alter table public.signs enable row level security;
alter table public.recordings enable row level security;
alter table public.corrections enable row level security;
alter table public.usage_ledger enable row level security;

-- Reserve spend atomically: returns the new total, or null when it would pass the cap.
-- The advisory lock serialises concurrent calls so two requests can't both slip under the cap.
create function public.reserve_spend(p_endpoint text, p_cost numeric, p_cap numeric, p_session text default null)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
begin
  perform pg_advisory_xact_lock(hashtext('visign_budget'));
  -- shortcut: sums the whole ledger each call, fine for thousands of rows; keep a running total row past ~100k
  select coalesce(sum(cost_usd), 0) into v_total from public.usage_ledger;
  if v_total + p_cost > p_cap then
    return null;
  end if;
  insert into public.usage_ledger (endpoint, cost_usd, session_id) values (p_endpoint, p_cost, p_session);
  return v_total + p_cost;
end;
$$;

-- Functions are executable by PUBLIC by default and exposed over the REST API; lock it to the server.
revoke execute on function public.reserve_spend(text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.reserve_spend(text, numeric, numeric, text) to service_role;

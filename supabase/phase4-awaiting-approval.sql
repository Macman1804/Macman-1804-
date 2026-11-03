-- DO NOT RUN until you approve it.
-- This does not connect a mailbox, send a text, buy a number, or weaken existing policies.
-- Tokens, if stored later, belong in sealed_secret and are readable by no browser role.

create table if not exists public.mailbox_links (
  subscriber_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  address text not null,
  sealed_secret text not null,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, provider)
);

create table if not exists public.sms_consent (
  subscriber_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null check (status in ('unknown', 'opted_in', 'opted_out')),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (char_length(action) between 1 and 80),
  outcome text not null check (outcome in ('allowed', 'refused')),
  detail text not null default '' check (char_length(detail) <= 180),
  created_at timestamptz not null default now()
);

-- The sealed mailbox secret is not granted to the browser role.
-- Authenticated users cannot read or write mailbox_links until a later approved server path exists.

create index if not exists audit_events_owner_idx
  on public.audit_events (subscriber_id, created_at desc);

alter table public.mailbox_links enable row level security;
alter table public.sms_consent enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.mailbox_links from public, anon, authenticated;
revoke all on table public.sms_consent from public, anon;
revoke all on table public.audit_events from public, anon, authenticated;

grant select, insert, update on table public.sms_consent to authenticated;
grant select on table public.audit_events to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sms_consent' and policyname = 'sms_consent_select_own'
  ) then
    create policy sms_consent_select_own
      on public.sms_consent
      for select
      to authenticated
      using (subscriber_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sms_consent' and policyname = 'sms_consent_insert_own'
  ) then
    create policy sms_consent_insert_own
      on public.sms_consent
      for insert
      to authenticated
      with check (subscriber_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sms_consent' and policyname = 'sms_consent_update_own'
  ) then
    create policy sms_consent_update_own
      on public.sms_consent
      for update
      to authenticated
      using (subscriber_id = (select auth.uid()))
      with check (subscriber_id = (select auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_events' and policyname = 'audit_events_select_own'
  ) then
    create policy audit_events_select_own
      on public.audit_events
      for select
      to authenticated
      using (subscriber_id = (select auth.uid()));
  end if;
end
$$;

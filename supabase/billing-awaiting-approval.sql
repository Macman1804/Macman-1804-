-- DO NOT RUN until you approve it.
-- No prices, no card columns, and billing cannot be turned on by this table.
-- A person can read only their own row. They cannot insert or change it.

create table if not exists public.subscriptions (
  subscriber_id uuid primary key references public.profiles (id) on delete cascade,
  plan text not null default 'not_chosen' check (plan = 'not_chosen'),
  billing boolean not null default false check (billing = false),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

revoke all on table public.subscriptions from public, anon, authenticated;
grant select on table public.subscriptions to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'subscriptions_select_own'
  ) then
    create policy subscriptions_select_own
      on public.subscriptions
      for select
      to authenticated
      using (subscriber_id = (select auth.uid()));
  end if;
end
$$;

-- DO NOT RUN until you approve it.
-- This does not buy a number, enable billing, or weaken existing policies.
-- A row can be read only by its owner. Nobody can insert a real number yet.

create table if not exists public.phone_lines (
  subscriber_id uuid primary key references public.profiles (id) on delete cascade,
  e164 text not null,
  created_at timestamptz not null default now(),
  constraint phone_lines_e164_unique unique (e164),
  constraint phone_lines_e164_check check (e164 ~ '^\+[1-9][0-9]{7,14}$')
);

alter table public.phone_lines enable row level security;

revoke all on table public.phone_lines from public, anon;
revoke insert, update, delete, truncate on table public.phone_lines from authenticated;
grant select on table public.phone_lines to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'phone_lines'
      and policyname = 'phone_lines_select_own'
  ) then
    create policy phone_lines_select_own
      on public.phone_lines
      for select
      to authenticated
      using (subscriber_id = (select auth.uid()));
  end if;
end
$$;

-- Owner-only writes for the existing Macman tables.
-- Apply in the Supabase SQL editor for project bexuyxicdxtviapavdwi.
-- This file is not run by the app migrator. It does not disable RLS.
-- It does not grant access to anon, and it does not grant update or delete
-- on messages, memories, or usage events.

grant insert, update on table public.profiles to authenticated;
grant insert on table public.messages to authenticated;
grant insert on table public.memories to authenticated;
grant insert on table public.usage_events to authenticated;

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy messages_insert_own
  on public.messages
  for insert
  to authenticated
  with check (
    subscriber_id = (select auth.uid())
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and c.subscriber_id = (select auth.uid())
    )
  );

create policy memories_insert_own
  on public.memories
  for insert
  to authenticated
  with check (subscriber_id = (select auth.uid()));

create policy usage_events_insert_own
  on public.usage_events
  for insert
  to authenticated
  with check (subscriber_id = (select auth.uid()));

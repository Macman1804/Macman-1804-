-- Owner-only writes for the existing Macman tables.
-- Review this in the Supabase SQL editor before running it.
-- Repeatable. Does not disable RLS. Does not grant anything to anon.
-- Does not add UPDATE or DELETE on messages, memories, or usage_events.

grant insert, update on table public.profiles to authenticated;
grant insert on table public.messages to authenticated;
grant insert on table public.memories to authenticated;
grant insert on table public.usage_events to authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_insert_own'
  ) THEN
    CREATE POLICY profiles_insert_own
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'messages'
      AND policyname = 'messages_insert_own'
  ) THEN
    CREATE POLICY messages_insert_own
      ON public.messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        subscriber_id = (SELECT auth.uid())
        AND EXISTS (
          SELECT 1
          FROM public.conversations c
          WHERE c.id = conversation_id
            AND c.subscriber_id = (SELECT auth.uid())
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'memories'
      AND policyname = 'memories_insert_own'
  ) THEN
    CREATE POLICY memories_insert_own
      ON public.memories
      FOR INSERT
      TO authenticated
      WITH CHECK (subscriber_id = (SELECT auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'usage_events'
      AND policyname = 'usage_events_insert_own'
  ) THEN
    CREATE POLICY usage_events_insert_own
      ON public.usage_events
      FOR INSERT
      TO authenticated
      WITH CHECK (subscriber_id = (SELECT auth.uid()));
  END IF;
END $$;

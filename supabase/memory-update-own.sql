-- Owner-only soft delete for memories. Does not grant access to anon.
-- A signed-in user may update only rows where subscriber_id is their own id.

grant update on table public.memories to authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'memories'
      AND policyname = 'memories_update_own'
  ) THEN
    CREATE POLICY memories_update_own
      ON public.memories
      FOR UPDATE
      TO authenticated
      USING (subscriber_id = (SELECT auth.uid()))
      WITH CHECK (subscriber_id = (SELECT auth.uid()));
  END IF;
END
$$;

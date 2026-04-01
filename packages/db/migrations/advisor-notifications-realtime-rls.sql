-- In-app notifikace pro poradce: Supabase Realtime na INSERT do advisor_notifications + RLS SELECT pro vlastní řádky.
-- Spusť v Supabase: SQL Editor (projekt musí mít zapnuté Realtime).
-- Pokud tabulka už v publikaci je, příkaz ADD TABLE může hlásit chybu — tu ignoruj nebo uprav.

ALTER PUBLICATION supabase_realtime ADD TABLE public.advisor_notifications;

ALTER TABLE public.advisor_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advisor_notifications_select_own" ON public.advisor_notifications;

CREATE POLICY "advisor_notifications_select_own" ON public.advisor_notifications
  FOR SELECT
  TO authenticated
  USING (target_user_id = auth.uid());

-- Zápis probíhá z aplikace přes serverové DB připojení (mimo anon JWT); klient vidí jen své notifikace.

-- Ověření po nasazení (SQL Editor):
-- SELECT schemaname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'advisor_notifications';
-- SELECT polname, cmd FROM pg_policies WHERE tablename = 'advisor_notifications';

-- Toast v poradenském portálu: Supabase Realtime na INSERT do opportunities + bezpečný SELECT pro JWT.
-- Spusť v Supabase: SQL Editor (projekt musí mít zapnuté Realtime).
-- Pokud tabulka už v publikaci je, příkaz ADD TABLE může hlásit chybu — tu ignoruj nebo uprav.

-- Zařadit opportunities do realtime publikace (jinak klient nedostane postgres_changes).
ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunities;

-- Realtime respektuje RLS: přihlášený uživatel vidí jen řádky svého tenanta.
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunities_select_tenant_members" ON public.opportunities;

CREATE POLICY "opportunities_select_tenant_members" ON public.opportunities
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT m.tenant_id
      FROM public.memberships m
      WHERE m.user_id = (SELECT auth.uid()::text)
    )
  );

-- Poznámka: zápis do opportunities z aplikace probíhá přes serverové DB připojení (mimo RLS JWT).

-- 2026-04-20 · Tasks priority + reminder persistence (QA Batch 8)
--
-- Cíl: NewTaskWizard (apps/web/src/app/portal/tasks/page.tsx) sbírá od uživatele
-- `priority` a `reminder`, ale action `createTask` tyto hodnoty tiše zahazovala,
-- protože tabulka `tasks` neobsahovala odpovídající sloupce. Uživatelský pocit:
-- „nastavil jsem urgentní prioritu a připomínku 1h → nic se nezaznamenalo“.
--
-- Přidáváme:
--   * `priority`  text — „low“ | „normal“ | „high“ (default „normal“),
--   * `reminder`  text — relativní hint („none“ | „10m“ | „1h“ | „1d“ | ...),
--     default „none“. Konverze do absolutního času probíhá na úrovni notifikací
--     (viz cron), zde ukládáme původní volbu, abychom ji mohli editovat i znovu
--     přepočítat po změně `due_date`.
--
-- Idempotentní: IF NOT EXISTS + DEFAULT.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reminder text NOT NULL DEFAULT 'none';

COMMENT ON COLUMN public.tasks.priority IS
  'Priorita úkolu: „low“ | „normal“ | „high“. Nastavuje NewTaskWizard v portálu, zobrazuje se v seznamech úkolů a v detailu kontaktu.';

COMMENT ON COLUMN public.tasks.reminder IS
  'Relativní připomenutí před splněním („none“, „10m“, „1h“, „1d“, ...). Konkrétní čas se počítá z `due_date` a této hodnoty v notifikační vrstvě.';

-- Index pro filtrování/ordering podle priority v úkolech (portal/tasks, dashboard).
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_priority
  ON public.tasks (tenant_id, priority)
  WHERE completed_at IS NULL;

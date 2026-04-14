-- Doplň chybějící user_profiles pro všechny uživatele z memberships (admin ručně přidaný apod.).
-- Bez toho může INSERT do contracts selhat na FK advisor_id → user_profiles.user_id.
-- Idempotentní: bezpečně opakovat.

INSERT INTO user_profiles (user_id, updated_at)
SELECT DISTINCT m.user_id, now()
FROM memberships m
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles up WHERE up.user_id = m.user_id
)
ON CONFLICT (user_id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

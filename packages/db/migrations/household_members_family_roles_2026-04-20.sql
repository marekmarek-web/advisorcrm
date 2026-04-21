-- household_members_family_roles_2026-04-20.sql
--
-- Přechod z legacy hodnot role (primary/member/child) na rodinnou taxonomii:
--   otec, matka, syn, dcera, partner, partnerka, dite, prarodic, jiny
--
-- Důvod: UI v mobilní appce zobrazuje "role" přímo, angličtina vypadala neprofesionálně
-- a "member" nemělo sémantiku. Nová taxonomie pokrývá reálnou strukturu domácnosti.
--
-- Strategie:
--   1. Mapujeme existující hodnoty na nejbližší nový label (primary→partner, member→partnerka,
--      child→dite). Neznámé nenull hodnoty padají do 'jiny'.
--   2. Přidáváme CHECK constraint, aby nová data dodržovala enum.
--
-- Tato migrace je idempotentní – opakované spuštění nic nerozbije.

BEGIN;

UPDATE household_members
SET role = 'partner'
WHERE role = 'primary';

UPDATE household_members
SET role = 'partnerka'
WHERE role = 'member';

UPDATE household_members
SET role = 'dite'
WHERE role = 'child';

UPDATE household_members
SET role = 'jiny'
WHERE role IS NOT NULL
  AND role NOT IN (
    'otec', 'matka', 'syn', 'dcera',
    'partner', 'partnerka',
    'dite', 'prarodic', 'jiny'
  );

ALTER TABLE household_members
  DROP CONSTRAINT IF EXISTS household_members_role_chk;

ALTER TABLE household_members
  ADD CONSTRAINT household_members_role_chk
  CHECK (
    role IS NULL OR role IN (
      'otec', 'matka', 'syn', 'dcera',
      'partner', 'partnerka',
      'dite', 'prarodic', 'jiny'
    )
  );

COMMIT;

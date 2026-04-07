-- Registr výpovědí: čas posledního ověření + interní poznámka (masterplan fáze 10).
ALTER TABLE insurer_termination_registry
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS registry_internal_notes TEXT;

COMMENT ON COLUMN insurer_termination_registry.last_verified_at IS 'Poslední ověření záznamu registru (backoffice).';
COMMENT ON COLUMN insurer_termination_registry.registry_internal_notes IS 'Interní poznámka k pojišťovně (ne pro klienta).';

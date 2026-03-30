-- tenant_settings_unique_key already indexes (tenant_id, key). Safe no-op if index never existed.
DROP INDEX IF EXISTS tenant_settings_tenant_key_idx;

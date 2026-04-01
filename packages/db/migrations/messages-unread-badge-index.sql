-- Speeds up getUnreadConversationsCount / portal badge (tenant filter + partial unread client messages).
CREATE INDEX IF NOT EXISTS idx_messages_tenant_unread_client ON messages (tenant_id) WHERE sender_type = 'client' AND read_at IS NULL;

-- Phase 3 performance improvements

-- Composite index for the most frequent query in the system:
-- getOrCreateConversation(bot_id, user_phone) runs on every incoming message.
-- The existing conversations_bot_id_idx only covers bot_id; this adds user_phone.
CREATE INDEX IF NOT EXISTS conversations_bot_id_user_phone_idx
  ON conversations(bot_id, user_phone);

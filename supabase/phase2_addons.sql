-- ============================================================
-- Nexo Bot — Phase 2 addons migration
-- Run this after phase2.sql
-- ============================================================

-- Add indexing_status to track background indexing state
ALTER TABLE knowledge_base_documents
  ADD COLUMN IF NOT EXISTS indexing_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (indexing_status IN ('pending', 'indexed', 'failed'));

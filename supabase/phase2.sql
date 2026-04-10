-- ============================================================
-- Nexo Bot — Phase 2 migration
-- Run this in the Supabase SQL Editor after schema.sql
-- ============================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add enabled_flows to bots (JSONB map of intent → bool)
ALTER TABLE bots ADD COLUMN IF NOT EXISTS enabled_flows JSONB NOT NULL DEFAULT '{"faq":true,"lead":true,"booking":true,"quote":true,"handoff":true}'::jsonb;

-- ============================================================
-- Knowledge base
-- ============================================================

CREATE TABLE knowledge_base_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES knowledge_base_documents(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES knowledge_base_documents(id) ON DELETE CASCADE,
  bot_id       UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  chunk_index  INTEGER NOT NULL,
  content      TEXT NOT NULL,
  embedding    vector(512),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Bot memory
-- ============================================================

CREATE TABLE bot_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      UUID NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'manual',  -- 'manual' | 'conversation'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (bot_id, key)
);

-- ============================================================
-- Indices
-- ============================================================

CREATE INDEX knowledge_base_documents_bot_id_idx ON knowledge_base_documents(bot_id);
CREATE INDEX document_versions_document_id_idx ON document_versions(document_id);
CREATE INDEX document_chunks_bot_id_idx ON document_chunks(bot_id);
CREATE INDEX document_chunks_document_id_idx ON document_chunks(document_id);
CREATE INDEX bot_memory_bot_id_idx ON bot_memory(bot_id);

-- HNSW index for fast cosine similarity search (requires pgvector >= 0.5)
CREATE INDEX document_chunks_embedding_idx
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- RPC: match_document_chunks
-- Returns chunks ordered by cosine similarity for a given bot
-- ============================================================

CREATE OR REPLACE FUNCTION match_document_chunks(
  p_bot_id       UUID,
  p_embedding    vector(512),
  p_match_count  INTEGER DEFAULT 5,
  p_threshold    FLOAT   DEFAULT 0.5
)
RETURNS TABLE (
  id           UUID,
  document_id  UUID,
  chunk_index  INTEGER,
  content      TEXT,
  similarity   FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> p_embedding) AS similarity
  FROM document_chunks dc
  JOIN knowledge_base_documents kd ON kd.id = dc.document_id
  WHERE dc.bot_id = p_bot_id
    AND kd.is_active = true
    AND 1 - (dc.embedding <=> p_embedding) >= p_threshold
  ORDER BY dc.embedding <=> p_embedding
  LIMIT p_match_count;
$$;

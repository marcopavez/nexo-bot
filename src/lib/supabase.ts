// Re-export barrel — preserves backward-compatible import paths.
// Import directly from src/lib/db/* for new code.
export { getSupabaseClient } from './db/client';
export * from './db/bots';
export * from './db/conversations';
export * from './db/messages';
export * from './db/booking';
export * from './db/knowledge-base';
export * from './db/memory';

import { generateEmbeddings, generateEmbedding } from './embeddings';
import { getSupabaseClient } from './supabase';
import { getCachedEmbedding, setCachedEmbedding } from './redis';

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

export function chunkDocument(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 <= CHUNK_SIZE) {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    } else {
      if (current) chunks.push(current);
      // If paragraph itself exceeds CHUNK_SIZE, split by sentences
      if (trimmed.length > CHUNK_SIZE) {
        const sentences = trimmed.split(/(?<=[.!?])\s+/);
        let sentChunk = '';
        for (const s of sentences) {
          if (sentChunk.length + s.length + 1 <= CHUNK_SIZE) {
            sentChunk = sentChunk ? `${sentChunk} ${s}` : s;
          } else {
            if (sentChunk) chunks.push(sentChunk);
            sentChunk = s;
          }
        }
        current = sentChunk;
      } else {
        current = trimmed;
      }
    }
  }

  if (current) chunks.push(current);

  // Apply overlap: prepend tail of previous chunk to next
  const overlapped: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      overlapped.push(chunks[i]);
    } else {
      const prev = chunks[i - 1];
      const tail = prev.slice(-CHUNK_OVERLAP);
      overlapped.push(`${tail}\n\n${chunks[i]}`);
    }
  }

  return overlapped;
}

export async function indexDocument(
  botId: string,
  documentId: string,
  content: string
): Promise<void> {
  const supabase = getSupabaseClient();

  // Remove old chunks for this document
  await supabase.from('document_chunks').delete().eq('document_id', documentId);

  const chunks = chunkDocument(content);
  if (chunks.length === 0) return;

  const embeddings = await generateEmbeddings(chunks);

  const rows = chunks.map((chunk, i) => ({
    document_id: documentId,
    bot_id: botId,
    chunk_index: i,
    content: chunk,
    embedding: embeddings[i], // pass as number[], not JSON string
  }));

  const { error } = await supabase.from('document_chunks').insert(rows);
  if (error) {
    throw new Error(`Failed to insert document chunks: ${error.message}`);
  }
}

export async function retrieveContext(
  botId: string,
  query: string,
  maxChunks = 5
): Promise<string> {
  // Try embedding cache first
  let embedding = await getCachedEmbedding(botId, query).catch(() => null);
  if (!embedding) {
    embedding = await generateEmbedding(query);
    await setCachedEmbedding(botId, query, embedding).catch(() => {});
  }

  const { data, error } = await getSupabaseClient().rpc('match_document_chunks', {
    p_bot_id: botId,
    p_embedding: embedding, // pass as number[], not JSON string
    p_match_count: maxChunks,
    p_threshold: 0.5,
  });

  if (error) {
    throw new Error(`RAG retrieval failed: ${error.message}`);
  }

  if (!data || data.length === 0) return '';

  return (data as Array<{ content: string; similarity: number }>)
    .map((r) => r.content)
    .join('\n\n---\n\n');
}

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId);

  if (error) {
    throw new Error(`Failed to delete document chunks: ${error.message}`);
  }
}

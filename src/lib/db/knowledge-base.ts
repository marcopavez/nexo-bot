import { getSupabaseClient } from './client';
import type { DocumentVersion, KnowledgeBaseDocument } from '../types';

export async function listDocuments(botId: string): Promise<KnowledgeBaseDocument[]> {
  const { data, error } = await getSupabaseClient()
    .from('knowledge_base_documents')
    .select('*')
    .eq('bot_id', botId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to list documents: ${error.message}`);
  return (data ?? []) as KnowledgeBaseDocument[];
}

export async function createDocument(params: {
  botId: string;
  title: string;
  content: string;
}): Promise<KnowledgeBaseDocument> {
  const { data, error } = await getSupabaseClient()
    .from('knowledge_base_documents')
    .insert({
      bot_id: params.botId,
      title: params.title,
      content: params.content,
      indexing_status: 'pending',
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create document: ${error?.message ?? 'unknown error'}`);
  }
  return data as KnowledgeBaseDocument;
}

export async function getDocument(documentId: string): Promise<KnowledgeBaseDocument | null> {
  const { data, error } = await getSupabaseClient()
    .from('knowledge_base_documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error || !data) return null;
  return data as KnowledgeBaseDocument;
}

export async function updateDocument(
  documentId: string,
  params: {
    title?: string;
    content?: string;
    is_active?: boolean;
    indexing_status?: KnowledgeBaseDocument['indexing_status'];
  }
): Promise<KnowledgeBaseDocument> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseClient()
    .from('knowledge_base_documents')
    .update({ ...params, updated_at: now })
    .eq('id', documentId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`Failed to update document: ${error?.message ?? 'unknown error'}`);
  }
  return data as KnowledgeBaseDocument;
}

export async function deleteDocument(documentId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('knowledge_base_documents')
    .delete()
    .eq('id', documentId);

  if (error) throw new Error(`Failed to delete document: ${error.message}`);
}

export async function createDocumentVersion(params: {
  documentId: string;
  version: number;
  title: string;
  content: string;
}): Promise<void> {
  const { error } = await getSupabaseClient().from('document_versions').insert({
    document_id: params.documentId,
    version: params.version,
    title: params.title,
    content: params.content,
  });

  if (error) throw new Error(`Failed to create document version: ${error.message}`);
}

export async function listDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
  const { data, error } = await getSupabaseClient()
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .order('version', { ascending: false });

  if (error) throw new Error(`Failed to list document versions: ${error.message}`);
  return (data ?? []) as DocumentVersion[];
}

export async function getDocumentVersion(
  documentId: string,
  version: number
): Promise<DocumentVersion | null> {
  const { data, error } = await getSupabaseClient()
    .from('document_versions')
    .select('*')
    .eq('document_id', documentId)
    .eq('version', version)
    .single();

  if (error || !data) return null;
  return data as DocumentVersion;
}

export async function getLatestDocumentVersion(documentId: string): Promise<number> {
  const { data } = await getSupabaseClient()
    .from('document_versions')
    .select('version')
    .eq('document_id', documentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { version: number } | null)?.version ?? 0;
}

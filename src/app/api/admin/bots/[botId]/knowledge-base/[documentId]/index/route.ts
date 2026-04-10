import { NextResponse } from 'next/server';
import { getDocument, updateDocument } from '@/lib/supabase';
import { indexDocument } from '@/lib/rag';
import { getOptionalEnv } from '@/lib/env';

/**
 * POST — trigger (or retry) embedding indexing for a document.
 * Returns immediately if OPENAI_API_KEY is not configured.
 * Safe to call multiple times; always re-indexes from the current content.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ botId: string; documentId: string }> }
) {
  try {
    const { botId, documentId } = await params;

    const document = await getDocument(documentId);
    if (!document || document.bot_id !== botId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!getOptionalEnv('OPENAI_API_KEY')) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured — indexing unavailable' },
        { status: 503 }
      );
    }

    await updateDocument(documentId, { indexing_status: 'pending' });

    try {
      await indexDocument(botId, documentId, document.content);
      await updateDocument(documentId, { indexing_status: 'indexed' });
      return NextResponse.json({ indexing_status: 'indexed' });
    } catch (err) {
      await updateDocument(documentId, { indexing_status: 'failed' }).catch(() => {});
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Indexing failed', indexing_status: 'failed' },
        { status: 500 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

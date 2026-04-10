import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, createDocument, createDocumentVersion, getLatestDocumentVersion, updateDocument } from '@/lib/supabase';
import { indexDocument } from '@/lib/rag';
import { getOptionalEnv } from '@/lib/env';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const documents = await listDocuments(botId);
    return NextResponse.json({ documents });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const body = await request.json();
    const { title, content } = body as { title: string; content: string };

    if (!title || !content) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
    }

    // Create with indexing_status='pending' (set by createDocument default)
    const document = await createDocument({ botId, title, content });

    // Save initial version
    await createDocumentVersion({
      documentId: document.id,
      version: 1,
      title: document.title,
      content: document.content,
    });

    // Index if OpenAI is configured; update status when done
    if (getOptionalEnv('OPENAI_API_KEY')) {
      try {
        await indexDocument(botId, document.id, content);
        await updateDocument(document.id, { indexing_status: 'indexed' });
        document.indexing_status = 'indexed';
      } catch {
        await updateDocument(document.id, { indexing_status: 'failed' }).catch(() => {});
        document.indexing_status = 'failed';
      }
    }

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import {
  getDocument,
  updateDocument,
  deleteDocument,
  createDocumentVersion,
  getLatestDocumentVersion,
} from '@/lib/supabase';
import { indexDocument, deleteDocumentChunks } from '@/lib/rag';
import { getOptionalEnv } from '@/lib/env';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ botId: string; documentId: string }> }
) {
  try {
    const { botId, documentId } = await params;
    const document = await getDocument(documentId);
    if (!document || document.bot_id !== botId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ document });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string; documentId: string }> }
) {
  try {
    const { botId, documentId } = await params;
    const body = await request.json();
    const { title, content, is_active } = body as {
      title?: string;
      content?: string;
      is_active?: boolean;
    };

    const current = await getDocument(documentId);
    if (!current || current.bot_id !== botId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const contentChanged = content !== undefined;

    // Mark as pending before re-indexing so callers see the transition
    const updated = await updateDocument(documentId, {
      title,
      content,
      is_active,
      ...(contentChanged && getOptionalEnv('OPENAI_API_KEY') ? { indexing_status: 'pending' } : {}),
    });

    // Save new version if content or title changed
    if (contentChanged || title !== undefined) {
      const latestVersion = await getLatestDocumentVersion(documentId);
      await createDocumentVersion({
        documentId,
        version: latestVersion + 1,
        title: updated.title,
        content: updated.content,
      });

      if (getOptionalEnv('OPENAI_API_KEY') && contentChanged) {
        try {
          await indexDocument(botId, documentId, updated.content);
          await updateDocument(documentId, { indexing_status: 'indexed' });
          updated.indexing_status = 'indexed';
        } catch {
          await updateDocument(documentId, { indexing_status: 'failed' }).catch(() => {});
          updated.indexing_status = 'failed';
        }
      }
    }

    return NextResponse.json({ document: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ botId: string; documentId: string }> }
) {
  try {
    const { botId, documentId } = await params;
    const document = await getDocument(documentId);
    if (!document || document.bot_id !== botId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await deleteDocumentChunks(documentId);
    await deleteDocument(documentId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import {
  getDocument,
  updateDocument,
  deleteDocument,
  createDocumentVersion,
  getLatestDocumentVersion,
} from '@/lib/supabase';
import { deleteDocumentChunks } from '@/lib/rag';

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

    // If content changed, reset to pending — caller must trigger /index separately
    const updated = await updateDocument(documentId, {
      title,
      content,
      is_active,
      ...(contentChanged ? { indexing_status: 'pending' } : {}),
    });

    if (contentChanged || title !== undefined) {
      const latestVersion = await getLatestDocumentVersion(documentId);
      await createDocumentVersion({
        documentId,
        version: latestVersion + 1,
        title: updated.title,
        content: updated.content,
      });
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

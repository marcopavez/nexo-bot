import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, createDocument, createDocumentVersion } from '@/lib/supabase';

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

    if (typeof title !== 'string' || typeof content !== 'string' || !title.trim() || !content.trim()) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
    }
    if (title.length > 200) {
      return NextResponse.json({ error: 'title must be 200 characters or fewer' }, { status: 400 });
    }
    if (content.length > 100_000) {
      return NextResponse.json({ error: 'content must be 100,000 characters or fewer' }, { status: 400 });
    }

    // Create with indexing_status='pending' — indexing is triggered separately
    const document = await createDocument({ botId, title, content });

    await createDocumentVersion({
      documentId: document.id,
      version: 1,
      title: document.title,
      content: document.content,
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

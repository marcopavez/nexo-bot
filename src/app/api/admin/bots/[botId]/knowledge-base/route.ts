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

    if (!title || !content) {
      return NextResponse.json({ error: 'title and content are required' }, { status: 400 });
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

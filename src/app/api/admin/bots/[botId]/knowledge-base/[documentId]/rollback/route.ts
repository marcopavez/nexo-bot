import { NextRequest, NextResponse } from 'next/server';
import {
  getDocumentVersion,
  updateDocument,
  createDocumentVersion,
  getLatestDocumentVersion,
} from '@/lib/supabase';
import { indexDocument } from '@/lib/rag';
import { getOptionalEnv } from '@/lib/env';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string; documentId: string }> }
) {
  try {
    const { botId, documentId } = await params;
    const body = await request.json();
    const version = Number(body.version);

    if (!version) {
      return NextResponse.json({ error: 'version is required' }, { status: 400 });
    }

    const docVersion = await getDocumentVersion(documentId, version);
    if (!docVersion) {
      return NextResponse.json({ error: `Version ${version} not found` }, { status: 404 });
    }

    const updated = await updateDocument(documentId, {
      title: docVersion.title,
      content: docVersion.content,
    });

    const latestVersion = await getLatestDocumentVersion(documentId);
    await createDocumentVersion({
      documentId,
      version: latestVersion + 1,
      title: docVersion.title,
      content: docVersion.content,
    });

    if (getOptionalEnv('OPENAI_API_KEY')) {
      await indexDocument(botId, documentId, docVersion.content);
    }

    return NextResponse.json({ document: updated, rolledBackToVersion: version });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

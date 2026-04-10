import { NextResponse } from 'next/server';
import { listDocumentVersions } from '@/lib/supabase';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params;
    const versions = await listDocumentVersions(documentId);
    return NextResponse.json({ versions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

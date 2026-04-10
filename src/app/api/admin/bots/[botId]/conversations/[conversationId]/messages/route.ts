import { NextRequest, NextResponse } from 'next/server';
import { listMessages } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? 100), 500);
    const offset = Number(searchParams.get('offset') ?? 0);
    const messages = await listMessages(conversationId, limit, offset);
    return NextResponse.json({ messages }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

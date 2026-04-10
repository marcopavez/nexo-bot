import { NextRequest, NextResponse } from 'next/server';
import { listConversations } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const { searchParams } = new URL(request.url);
    const page = Number(searchParams.get('page') ?? '1');
    const pageSize = Number(searchParams.get('pageSize') ?? '20');

    const { conversations, total } = await listConversations(botId, page, pageSize);
    return NextResponse.json({ conversations, total, page, pageSize });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

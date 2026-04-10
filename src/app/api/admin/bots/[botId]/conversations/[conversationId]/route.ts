import { NextRequest, NextResponse } from 'next/server';
import { getConversation, updateConversationStatus } from '@/lib/supabase';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string; conversationId: string }> }
) {
  try {
    const { botId, conversationId } = await params;

    const conversation = await getConversation(conversationId);
    if (!conversation || conversation.bot_id !== botId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const status = body.status as string;

    if (status !== 'open' && status !== 'closed') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    await updateConversationStatus(conversationId, status);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

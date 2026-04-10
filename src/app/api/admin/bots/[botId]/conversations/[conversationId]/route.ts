import { NextRequest, NextResponse } from 'next/server';
import { updateConversationStatus } from '@/lib/supabase';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
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

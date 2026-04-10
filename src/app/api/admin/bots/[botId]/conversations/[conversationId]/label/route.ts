import { NextRequest, NextResponse } from 'next/server';
import { labelConversationIntent } from '@/lib/supabase';
import type { Intent } from '@/lib/types';

const VALID_INTENTS: Intent[] = ['faq', 'lead', 'booking', 'quote', 'handoff'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const body = await request.json();
    const intent = body.intent as Intent;

    if (!VALID_INTENTS.includes(intent)) {
      return NextResponse.json({ error: 'Invalid intent' }, { status: 400 });
    }

    await labelConversationIntent(conversationId, intent);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { listBotMemory, upsertBotMemory } from '@/lib/supabase';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const memories = await listBotMemory(botId);
    return NextResponse.json({ memories });
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
    const { key, value, source } = body as { key: string; value: string; source?: 'manual' | 'conversation' };

    if (typeof key !== 'string' || typeof value !== 'string' || !key.trim() || !value.trim()) {
      return NextResponse.json({ error: 'key and value are required strings' }, { status: 400 });
    }
    if (key.length > 100) {
      return NextResponse.json({ error: 'key must be 100 characters or fewer' }, { status: 400 });
    }
    if (value.length > 2000) {
      return NextResponse.json({ error: 'value must be 2,000 characters or fewer' }, { status: 400 });
    }

    const memory = await upsertBotMemory({ botId, key, value, source });
    return NextResponse.json({ memory }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

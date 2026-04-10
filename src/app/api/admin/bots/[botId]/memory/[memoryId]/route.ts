import { NextResponse } from 'next/server';
import { deleteBotMemory } from '@/lib/supabase';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ botId: string; memoryId: string }> }
) {
  try {
    const { botId, memoryId } = await params;
    await deleteBotMemory(memoryId, botId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

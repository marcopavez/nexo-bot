import { NextResponse } from 'next/server';
import { listBots } from '@/lib/supabase';

export async function GET() {
  try {
    const bots = await listBots();
    return NextResponse.json({ bots });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

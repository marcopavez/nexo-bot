import { NextRequest, NextResponse } from 'next/server';
import { getBotById, updateBotFlows } from '@/lib/supabase';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const bot = await getBotById(botId);
    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    return NextResponse.json({ enabled_flows: bot.enabled_flows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const body = await request.json();
    const { enabled_flows } = body as { enabled_flows: Record<string, boolean> };

    const VALID_FLOWS = ['faq', 'lead', 'booking', 'quote', 'handoff'];

    if (!enabled_flows || typeof enabled_flows !== 'object' || Array.isArray(enabled_flows)) {
      return NextResponse.json({ error: 'enabled_flows must be a plain object' }, { status: 400 });
    }
    for (const [key, val] of Object.entries(enabled_flows)) {
      if (!VALID_FLOWS.includes(key)) {
        return NextResponse.json({ error: `Invalid flow key: ${key}` }, { status: 400 });
      }
      if (typeof val !== 'boolean') {
        return NextResponse.json({ error: `Flow value for "${key}" must be a boolean` }, { status: 400 });
      }
    }

    await updateBotFlows(botId, enabled_flows);
    return NextResponse.json({ success: true, enabled_flows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

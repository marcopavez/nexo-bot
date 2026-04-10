import { NextRequest, NextResponse } from 'next/server';
import { getBotById, updateBot } from '@/lib/supabase';
import type { Bot } from '@/lib/types';

const VALID_TYPES: Bot['business_type'][] = ['shop', 'clinic', 'law_firm', 'other'];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const bot = await getBotById(botId);
    if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ bot });
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

    const existing = await getBotById(botId);
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const { businessName, businessType, ownerWhatsapp, systemPrompt, hours, address, services } = body;

    if (businessName !== undefined && (typeof businessName !== 'string' || !businessName.trim())) {
      return NextResponse.json({ error: 'businessName must be a non-empty string' }, { status: 400 });
    }
    if (businessType !== undefined && !VALID_TYPES.includes(businessType)) {
      return NextResponse.json({ error: 'Invalid businessType' }, { status: 400 });
    }

    const bot = await updateBot(botId, { businessName, businessType, ownerWhatsapp, systemPrompt, hours, address, services });
    return NextResponse.json({ bot });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

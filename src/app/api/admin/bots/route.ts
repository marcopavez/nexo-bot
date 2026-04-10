import { NextRequest, NextResponse } from 'next/server';
import { listBots, createBot } from '@/lib/supabase';
import type { Bot } from '@/lib/types';

const VALID_TYPES: Bot['business_type'][] = ['shop', 'clinic', 'law_firm', 'other'];

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumberId, businessName, businessType, ownerWhatsapp, systemPrompt, hours, address, services } = body;

    if (typeof phoneNumberId !== 'string' || !phoneNumberId.trim()) {
      return NextResponse.json({ error: 'phoneNumberId is required' }, { status: 400 });
    }
    if (typeof businessName !== 'string' || !businessName.trim()) {
      return NextResponse.json({ error: 'businessName is required' }, { status: 400 });
    }
    if (!VALID_TYPES.includes(businessType)) {
      return NextResponse.json({ error: 'Invalid businessType' }, { status: 400 });
    }

    const bot = await createBot({ phoneNumberId, businessName, businessType, ownerWhatsapp, systemPrompt, hours, address, services });
    return NextResponse.json({ bot }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { listBookingRequests } from '@/lib/supabase';
import type { BookingRequest } from '@/lib/types';

const VALID_STATUSES: BookingRequest['status'][] = [
  'collecting', 'pending_confirmation', 'confirmed', 'cancelled', 'handoff',
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  try {
    const { botId } = await params;
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');

    const statusFilter = statusParam
      ? statusParam.split(',').filter((s) => VALID_STATUSES.includes(s as BookingRequest['status'])) as BookingRequest['status'][]
      : undefined;

    const bookings = await listBookingRequests(botId, statusFilter);
    return NextResponse.json({ bookings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

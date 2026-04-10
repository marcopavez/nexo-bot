import { NextRequest, NextResponse } from 'next/server';
import { getBookingRequest, updateBookingStatus, getBotById } from '@/lib/supabase';
import { sendMessage } from '@/lib/whatsapp';
import type { BookingRequest } from '@/lib/types';

const ALLOWED_TRANSITIONS: BookingRequest['status'][] = ['confirmed', 'cancelled'];

function buildCustomerMessage(status: 'confirmed' | 'cancelled', booking: BookingRequest, businessName: string): string {
  if (status === 'confirmed') {
    const parts = [
      `¡Hola${booking.customer_name ? ` ${booking.customer_name}` : ''}! Tu agendamiento en ${businessName} ha sido *confirmado* ✅`,
    ];
    if (booking.requested_service) parts.push(`Servicio: ${booking.requested_service}`);
    if (booking.requested_date_text) parts.push(`Fecha: ${booking.requested_date_text}`);
    if (booking.requested_time_text) parts.push(`Hora: ${booking.requested_time_text}`);
    parts.push('Si necesitas cambiar o cancelar, escríbenos aquí.');
    return parts.join('\n');
  }

  return [
    `Hola${booking.customer_name ? ` ${booking.customer_name}` : ''}. Lamentablemente no pudimos confirmar tu agendamiento en ${businessName} ❌`,
    'Por favor contáctanos para buscar otra fecha disponible.',
  ].join('\n');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string; bookingId: string }> }
) {
  try {
    const { botId, bookingId } = await params;

    const booking = await getBookingRequest(bookingId);
    if (!booking || booking.bot_id !== botId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const { status } = body as { status: BookingRequest['status'] };

    if (!ALLOWED_TRANSITIONS.includes(status)) {
      return NextResponse.json(
        { error: `Status must be one of: ${ALLOWED_TRANSITIONS.join(', ')}` },
        { status: 400 }
      );
    }

    const narrowed = status as 'confirmed' | 'cancelled';
    const updated = await updateBookingStatus(bookingId, narrowed);

    // Notify the customer via WhatsApp
    const bot = await getBotById(botId);
    if (bot) {
      const message = buildCustomerMessage(narrowed, booking, bot.business_name);
      await sendMessage(bot.phone_number_id, booking.user_phone, message).catch(() => {
        // Non-fatal — booking is already updated, notification failure shouldn't roll back
      });
    }

    return NextResponse.json({ booking: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

'use client';

import { useState } from 'react';
import type { BookingRequest } from '@/lib/types';

export default function BookingActions({
  botId,
  booking,
}: {
  botId: string;
  booking: BookingRequest;
}) {
  const [status, setStatus] = useState(booking.status);
  const [loading, setLoading] = useState<'confirmed' | 'cancelled' | null>(null);
  const [error, setError] = useState('');

  const isDone = status === 'confirmed' || status === 'cancelled';

  async function handleAction(next: 'confirmed' | 'cancelled') {
    setLoading(next);
    setError('');
    const res = await fetch(`/api/admin/bots/${botId}/bookings/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      setStatus(next);
    } else {
      const data = await res.json();
      setError(data.error ?? 'Error');
    }
    setLoading(null);
  }

  if (isDone) {
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
        status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
      }`}>
        {status === 'confirmed' ? 'Confirmado' : 'Cancelado'}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={() => handleAction('confirmed')}
        disabled={!!loading}
        className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
      >
        {loading === 'confirmed' ? '…' : 'Confirmar'}
      </button>
      <button
        onClick={() => handleAction('cancelled')}
        disabled={!!loading}
        className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
      >
        {loading === 'cancelled' ? '…' : 'Cancelar'}
      </button>
    </div>
  );
}

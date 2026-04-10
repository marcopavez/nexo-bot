import { listBookingRequests } from '@/lib/supabase';
import BookingActions from './_booking-actions';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  collecting: 'Recopilando datos',
  pending_confirmation: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  handoff: 'Derivado',
};

const STATUS_BADGE: Record<string, string> = {
  collecting: 'bg-gray-100 text-gray-500',
  pending_confirmation: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
  handoff: 'bg-purple-100 text-purple-700',
};

export default async function BookingsPage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  const bookings = await listBookingRequests(botId);

  const pending = bookings.filter((b) => b.status === 'pending_confirmation');
  const rest = bookings.filter((b) => b.status !== 'pending_confirmation');

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Agendamientos</h1>

      {bookings.length === 0 && (
        <p className="text-sm text-gray-500">No hay agendamientos aún.</p>
      )}

      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pendientes de confirmación ({pending.length})
          </h2>
          <ul className="space-y-3">
            {pending.map((b) => (
              <BookingCard key={b.id} booking={b} botId={botId} />
            ))}
          </ul>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Historial
          </h2>
          <ul className="space-y-2">
            {rest.map((b) => (
              <BookingCard key={b.id} booking={b} botId={botId} compact />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BookingCard({
  booking: b,
  botId,
  compact = false,
}: {
  booking: Awaited<ReturnType<typeof listBookingRequests>>[number];
  botId: string;
  compact?: boolean;
}) {
  return (
    <li className={`bg-white border border-gray-200 rounded px-4 py-3 ${compact ? 'opacity-75' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium text-sm text-gray-800">
              {b.customer_name ?? `+${b.user_phone}`}
            </p>
            {b.customer_name && (
              <span className="text-xs text-gray-400">+{b.user_phone}</span>
            )}
            {compact && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[b.status] ?? 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABEL[b.status] ?? b.status}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600 space-y-0.5">
            {b.requested_service && <p>Servicio: {b.requested_service}</p>}
            {b.requested_date_text && <p>Fecha: {b.requested_date_text}</p>}
            {b.requested_time_text && <p>Hora: {b.requested_time_text}</p>}
            {b.notes && <p className="text-gray-400 italic">{b.notes}</p>}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(b.created_at).toLocaleString('es-CL')}
          </p>
        </div>
        {!compact && <BookingActions botId={botId} booking={b} />}
      </div>
    </li>
  );
}

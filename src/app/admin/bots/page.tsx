import Link from 'next/link';
import { listBots } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  shop: 'Tienda / Comercio',
  clinic: 'Clínica / Salud',
  law_firm: 'Estudio jurídico',
  other: 'Otro',
};

export default async function BotsPage() {
  const bots = await listBots();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Bots</h1>
        <Link
          href="/admin/bots/new"
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Nuevo bot
        </Link>
      </div>

      {bots.length === 0 ? (
        <p className="text-gray-500 text-sm">No hay bots configurados. Crea el primero.</p>
      ) : (
        <ul className="space-y-2">
          {bots.map((bot) => (
            <li key={bot.id}>
              <Link
                href={`/admin/bots/${bot.id}`}
                className="block bg-white border border-gray-200 rounded px-4 py-3 hover:bg-gray-50"
              >
                <p className="font-medium text-gray-800">{bot.business_name}</p>
                <p className="text-xs text-gray-500">
                  {BUSINESS_TYPE_LABELS[bot.business_type] ?? bot.business_type} · {bot.phone_number_id}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

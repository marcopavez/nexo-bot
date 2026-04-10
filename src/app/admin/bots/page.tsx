import Link from 'next/link';
import { listBots } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function BotsPage() {
  const bots = await listBots();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Bots</h1>
      {bots.length === 0 ? (
        <p className="text-gray-500 text-sm">No hay bots configurados.</p>
      ) : (
        <ul className="space-y-2">
          {bots.map((bot) => (
            <li key={bot.id}>
              <Link
                href={`/admin/bots/${bot.id}`}
                className="block bg-white border border-gray-200 rounded px-4 py-3 hover:bg-gray-50"
              >
                <p className="font-medium text-gray-800">{bot.business_name}</p>
                <p className="text-xs text-gray-500">{bot.business_type} · {bot.phone_number_id}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

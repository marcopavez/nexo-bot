import Link from 'next/link';
import { listConversations } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function ConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ botId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { botId } = await params;
  const { page: pageStr } = await searchParams;
  const page = Number(pageStr ?? '1');

  const { conversations, total } = await listConversations(botId, page, 20);
  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Conversaciones</h1>
        <p className="text-sm text-gray-500">{total} total</p>
      </div>

      {conversations.length === 0 ? (
        <p className="text-gray-500 text-sm">No hay conversaciones.</p>
      ) : (
        <ul className="space-y-2">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/bots/${botId}/conversations/${c.id}`}
                className="block bg-white border border-gray-200 rounded px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <p className="font-medium text-sm text-gray-800">+{c.user_phone}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Intent: {c.current_intent ?? '—'} · {new Date(c.last_message_at).toLocaleString('es-CL')}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 mt-4">
          {page > 1 && (
            <Link
              href={`/admin/bots/${botId}/conversations?page=${page - 1}`}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
            >
              Anterior
            </Link>
          )}
          <span className="px-3 py-1 text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/bots/${botId}/conversations?page=${page + 1}`}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
            >
              Siguiente
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

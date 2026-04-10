import Link from 'next/link';
import { getBotById } from '@/lib/supabase';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BotDetailPage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  const bot = await getBotById(botId);
  if (!bot) notFound();

  const nav = [
    { label: 'Conversaciones', href: `/admin/bots/${botId}/conversations` },
    { label: 'Base de conocimiento', href: `/admin/bots/${botId}/knowledge-base` },
    { label: 'Memoria', href: `/admin/bots/${botId}/memory` },
    { label: 'Flujos', href: `/admin/bots/${botId}/flows` },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold mb-1">{bot.business_name}</h1>
      <p className="text-sm text-gray-500 mb-6">{bot.business_type} · {bot.phone_number_id}</p>
      <ul className="space-y-2">
        {nav.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block bg-white border border-gray-200 rounded px-4 py-3 hover:bg-gray-50 text-sm text-gray-700"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

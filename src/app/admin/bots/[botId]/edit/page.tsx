import { getBotById } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import BotForm from '../../_bot-form';

export const dynamic = 'force-dynamic';

export default async function EditBotPage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  const bot = await getBotById(botId);
  if (!bot) notFound();

  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Editar bot — {bot.business_name}</h1>
      <BotForm initial={bot} />
    </div>
  );
}

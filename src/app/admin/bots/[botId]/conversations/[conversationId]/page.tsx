'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Message, Intent } from '@/lib/types';

const INTENTS: Intent[] = ['faq', 'lead', 'booking', 'quote', 'handoff'];

export default function ConversationPage() {
  const { botId, conversationId } = useParams<{ botId: string; conversationId: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [labelIntent, setLabelIntent] = useState<Intent>('faq');
  const [labeling, setLabeling] = useState(false);
  const [labelDone, setLabelDone] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/bots/${botId}/conversations/${conversationId}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .finally(() => setLoading(false));
  }, [botId, conversationId]);

  async function handleLabel() {
    setLabeling(true);
    await fetch(`/api/admin/bots/${botId}/conversations/${conversationId}/label`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: labelIntent }),
    });
    setLabeling(false);
    setLabelDone(true);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Hilo de mensajes</h1>

      <div className="flex items-center gap-2 mb-6">
        <select
          value={labelIntent}
          onChange={(e) => { setLabelIntent(e.target.value as Intent); setLabelDone(false); }}
          className="border rounded px-2 py-1 text-sm"
        >
          {INTENTS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <button
          onClick={handleLabel}
          disabled={labeling}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {labeling ? 'Guardando…' : 'Etiquetar intent'}
        </button>
        {labelDone && <span className="text-sm text-green-600">Guardado</span>}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-gray-500">Sin mensajes.</p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-lg px-4 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                  m.direction === 'outbound'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                <p>{m.content}</p>
                <p className={`text-xs mt-1 ${m.direction === 'outbound' ? 'text-blue-200' : 'text-gray-400'}`}>
                  {m.role} · {m.intent ?? '—'} · {new Date(m.created_at).toLocaleString('es-CL')}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

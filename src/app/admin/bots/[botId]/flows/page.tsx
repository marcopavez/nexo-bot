'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { Intent } from '@/lib/types';

const FLOWS: Intent[] = ['faq', 'lead', 'booking', 'quote', 'handoff'];

export default function FlowsPage() {
  const { botId } = useParams<{ botId: string }>();
  const [flows, setFlows] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`/api/admin/bots/${botId}/flows`)
      .then((r) => r.json())
      .then((d) => setFlows(d.enabled_flows ?? {}))
      .finally(() => setLoading(false));
  }, [botId]);

  async function toggle(flow: string) {
    const updated = { ...flows, [flow]: !flows[flow] };
    setFlows(updated);
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/admin/bots/${botId}/flows`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled_flows: updated }),
    });
    if (res.ok) {
      setMessage('Guardado');
    } else {
      setFlows((prev) => ({ ...prev, [flow]: !updated[flow] }));
      setMessage('Error al guardar');
    }
    setSaving(false);
  }

  if (loading) return <p className="text-sm text-gray-500">Cargando…</p>;

  return (
    <div className="max-w-sm">
      <h1 className="text-xl font-semibold mb-4">Flujos habilitados</h1>
      <ul className="space-y-3">
        {FLOWS.map((flow) => (
          <li key={flow} className="flex items-center justify-between bg-white border border-gray-200 rounded px-4 py-3">
            <span className="text-sm font-medium text-gray-700">{flow}</span>
            <button
              onClick={() => toggle(flow)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                flows[flow] !== false ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  flows[flow] !== false ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
      {message && (
        <p className={`mt-3 text-sm ${message === 'Guardado' ? 'text-green-600' : 'text-red-600'}`}>
          {message}
        </p>
      )}
    </div>
  );
}

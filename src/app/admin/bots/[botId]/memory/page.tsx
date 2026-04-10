'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { BotMemory } from '@/lib/types';

export default function MemoryPage() {
  const { botId } = useParams<{ botId: string }>();
  const [memories, setMemories] = useState<BotMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function fetchMemories() {
    fetch(`/api/admin/bots/${botId}/memory`)
      .then((r) => r.json())
      .then((d) => setMemories(d.memories ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchMemories(); }, [botId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await fetch(`/api/admin/bots/${botId}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    if (res.ok) {
      setKey('');
      setValue('');
      fetchMemories();
    } else {
      const data = await res.json();
      setError(data.error ?? 'Error al guardar');
    }
    setSaving(false);
  }

  async function handleDelete(memoryId: string) {
    await fetch(`/api/admin/bots/${botId}/memory/${memoryId}`, { method: 'DELETE' });
    setMemories((prev) => prev.filter((m) => m.id !== memoryId));
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Memoria del bot</h1>

      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="clave"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
          className="border rounded px-2 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="valor"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          className="border rounded px-2 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '…' : 'Agregar'}
        </button>
      </form>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : memories.length === 0 ? (
        <p className="text-sm text-gray-500">Sin entradas de memoria.</p>
      ) : (
        <ul className="space-y-2">
          {memories.map((m) => (
            <li key={m.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded px-4 py-2 text-sm">
              <span className="font-medium text-gray-700 w-40 shrink-0 truncate">{m.key}</span>
              <span className="flex-1 text-gray-600 truncate">{m.value}</span>
              <span className="text-xs text-gray-400 shrink-0">{m.source}</span>
              <button
                onClick={() => handleDelete(m.id)}
                className="text-xs text-red-500 hover:underline shrink-0"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

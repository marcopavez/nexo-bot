'use client';

import { useState } from 'react';

export default function ToggleActive({
  botId,
  documentId,
  initialActive,
}: {
  botId: string;
  documentId: string;
  initialActive: boolean;
}) {
  const [active, setActive] = useState(initialActive);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const res = await fetch(`/api/admin/bots/${botId}/knowledge-base/${documentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !active }),
    });
    if (res.ok) setActive((v) => !v);
    setLoading(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`text-xs px-2 py-1 rounded-full border ${
        active
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-gray-50 text-gray-500 border-gray-200'
      } disabled:opacity-50`}
    >
      {active ? 'Activo' : 'Inactivo'}
    </button>
  );
}

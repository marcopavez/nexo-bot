'use client';

import { useState } from 'react';

export default function RetryIndex({
  botId,
  documentId,
}: {
  botId: string;
  documentId: string;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  async function handleRetry() {
    setStatus('loading');
    const res = await fetch(`/api/admin/bots/${botId}/knowledge-base/${documentId}/index`, {
      method: 'POST',
    });
    setStatus(res.ok ? 'done' : 'error');
  }

  if (status === 'done') return <span className="text-xs text-green-600">Indexado</span>;
  if (status === 'error') return <span className="text-xs text-red-600">Error</span>;

  return (
    <button
      onClick={handleRetry}
      disabled={status === 'loading'}
      className="text-xs text-orange-600 hover:underline disabled:opacity-50"
    >
      {status === 'loading' ? 'Indexando…' : 'Reintentar'}
    </button>
  );
}

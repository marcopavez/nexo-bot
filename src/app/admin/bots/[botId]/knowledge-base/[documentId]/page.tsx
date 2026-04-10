'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { KnowledgeBaseDocument, DocumentVersion } from '@/lib/types';

export default function DocumentDetailPage() {
  const { botId, documentId } = useParams<{ botId: string; documentId: string }>();
  const router = useRouter();

  const [doc, setDoc] = useState<KnowledgeBaseDocument | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/bots/${botId}/knowledge-base/${documentId}`).then((r) => r.json()),
      fetch(`/api/admin/bots/${botId}/knowledge-base/${documentId}/versions`).then((r) =>
        r.json().catch(() => ({ versions: [] }))
      ),
    ]).then(([docData, versData]) => {
      setDoc(docData.document);
      setTitle(docData.document?.title ?? '');
      setContent(docData.document?.content ?? '');
      setVersions(versData.versions ?? []);
    });
  }, [botId, documentId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    const res = await fetch(`/api/admin/bots/${botId}/knowledge-base/${documentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content }),
    });
    const data = await res.json();
    if (res.ok) {
      setDoc(data.document);
      setMessage('Guardado correctamente');
    } else {
      setMessage(data.error ?? 'Error al guardar');
    }
    setSaving(false);
  }

  async function handleRollback(version: number) {
    setRolling(true);
    setMessage('');
    const res = await fetch(`/api/admin/bots/${botId}/knowledge-base/${documentId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    });
    const data = await res.json();
    if (res.ok) {
      setTitle(data.document.title);
      setContent(data.document.content);
      setDoc(data.document);
      setMessage(`Rollback a v${version} completado`);
    } else {
      setMessage(data.error ?? 'Error en rollback');
    }
    setRolling(false);
  }

  if (!doc) return <p className="text-sm text-gray-500">Cargando…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Editar documento</h1>
      <form onSubmit={handleSave} className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contenido</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={12}
            className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {message && (
          <p className={`text-sm ${message.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 border text-sm rounded hover:bg-gray-50"
          >
            Volver
          </button>
        </div>
      </form>

      {versions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Versiones anteriores</h2>
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">v{v.version}</span>
                  <span className="text-gray-500 ml-2">{v.title}</span>
                  <span className="text-gray-400 ml-2">{new Date(v.created_at).toLocaleString('es-CL')}</span>
                </div>
                <button
                  onClick={() => handleRollback(v.version)}
                  disabled={rolling}
                  className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                >
                  Restaurar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

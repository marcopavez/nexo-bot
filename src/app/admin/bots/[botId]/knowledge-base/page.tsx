import Link from 'next/link';
import { listDocuments } from '@/lib/supabase';
import ToggleActive from './_toggle-active';

export const dynamic = 'force-dynamic';

export default async function KnowledgeBasePage({
  params,
}: {
  params: Promise<{ botId: string }>;
}) {
  const { botId } = await params;
  const documents = await listDocuments(botId);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Base de conocimiento</h1>
        <Link
          href={`/admin/bots/${botId}/knowledge-base/new`}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Nuevo documento
        </Link>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-gray-500">Sin documentos.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded px-4 py-3">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/admin/bots/${botId}/knowledge-base/${doc.id}`}
                  className="font-medium text-sm text-gray-800 hover:underline"
                >
                  {doc.title}
                </Link>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(doc.updated_at).toLocaleDateString('es-CL')}
                </p>
              </div>
              <ToggleActive
                botId={botId}
                documentId={doc.id}
                initialActive={doc.is_active}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

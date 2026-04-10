import Link from 'next/link';
import { listDocuments } from '@/lib/supabase';
import ToggleActive from './_toggle-active';
import RetryIndex from './_retry-index';

export const dynamic = 'force-dynamic';

const STATUS_BADGE: Record<string, string> = {
  indexed: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

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
              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[doc.indexing_status] ?? 'bg-gray-100 text-gray-500'}`}>
                {doc.indexing_status}
              </span>
              {doc.indexing_status === 'failed' && (
                <RetryIndex botId={botId} documentId={doc.id} />
              )}
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

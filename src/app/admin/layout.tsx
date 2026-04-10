import Link from 'next/link';
import LogoutButton from './_logout-button';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-56 shrink-0 bg-white border-r border-gray-200 p-4 flex flex-col gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Nexo Admin
        </p>
        <Link
          href="/admin"
          className="block px-3 py-2 rounded text-sm text-gray-700 hover:bg-gray-100"
        >
          Dashboard
        </Link>
        <Link
          href="/admin/bots"
          className="block px-3 py-2 rounded text-sm text-gray-700 hover:bg-gray-100"
        >
          Bots
        </Link>
        <div className="mt-auto pt-4 border-t border-gray-100">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}

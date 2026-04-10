'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  return (
    <button
      onClick={handleLogout}
      className="block w-full text-left px-3 py-2 rounded text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
    >
      Cerrar sesión
    </button>
  );
}

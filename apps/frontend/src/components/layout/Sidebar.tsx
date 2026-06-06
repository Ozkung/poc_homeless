'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { clsx } from 'clsx';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/patients', label: 'ผู้ป่วย', icon: '🏥' },
  { href: '/events', label: 'แผนการเยี่ยม', icon: '📅' },
  { href: '/forms', label: 'แบบฟอร์ม', icon: '📋' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-gray-900 flex flex-col border-r border-gray-800">
      <div className="p-5 border-b border-gray-800">
        <p className="text-xs font-mono text-purple-400 tracking-widest uppercase">HomeMed</p>
        <p className="font-display text-lg font-bold text-white mt-0.5">Connect</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href} href={item.href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith(item.href)
                ? 'bg-purple-600/20 text-purple-300 border border-purple-600/30'
                : 'text-gray-400 hover:text-white hover:bg-gray-800',
            )}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-800">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <span>🚪</span>
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}

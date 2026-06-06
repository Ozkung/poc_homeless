import Link from 'next/link';

export default function FormsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Forms</p>
          <h1 className="font-display text-2xl font-bold text-gray-900">แบบฟอร์ม</h1>
        </div>
        <Link href="/forms/new" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          + สร้างแบบฟอร์ม
        </Link>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
        <p className="text-4xl mb-3">📋</p>
        <p className="font-mono text-sm">ยังไม่มีแบบฟอร์ม</p>
      </div>
    </div>
  );
}

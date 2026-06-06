import Link from 'next/link';

export default function EventsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Planning</p>
          <h1 className="font-display text-2xl font-bold text-gray-900">แผนการเยี่ยม</h1>
        </div>
        <Link href="/events/new" className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
          + สร้าง Event
        </Link>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
        <p className="text-4xl mb-3">📅</p>
        <p className="font-mono text-sm">ปฏิทินจะแสดงที่นี่</p>
        <p className="text-xs mt-1">ต้องการ @fullcalendar/react</p>
      </div>
    </div>
  );
}

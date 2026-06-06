export default function DashboardPage() {
  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Overview</p>
        <h1 className="font-display text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'ผู้ป่วยทั้งหมด', value: '—', color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
          { label: 'วิกฤต', value: '—', color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
          { label: 'งานวันนี้', value: '—', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
          { label: 'รอดำเนินการ', value: '—', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
        ].map((card) => (
          <div key={card.label} className={`border rounded-xl p-5 ${card.bg}`}>
            <p className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">{card.label}</p>
            <p className={`text-4xl font-display font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>
      <p className="text-gray-400 text-sm font-mono">เชื่อมต่อ API แล้วข้อมูลจะแสดงที่นี่</p>
    </div>
  );
}

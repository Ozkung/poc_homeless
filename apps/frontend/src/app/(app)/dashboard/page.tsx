export const dynamic = 'force-dynamic';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type PatientStatus = 'CRITICAL' | 'PENDING' | 'STABLE';

interface Patient {
  id: string;
  name: string;
  status: PatientStatus;
  hn: string;
  age: number;
  gender: string;
  conditions: string[];
  locationText: string;
}

async function fetchPatients(token: string): Promise<Patient[]> {
  try {
    const res = await fetch(`${API_URL}/patients`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return res.json() as Promise<Patient[]>;
  } catch {
    return [];
  }
}

async function fetchEventCount(token: string): Promise<number> {
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const res = await fetch(`${API_URL}/events?month=${month}&year=${year}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

const STATUS_LABELS: Record<PatientStatus, string> = {
  CRITICAL: 'วิกฤต',
  PENDING: 'รอดำเนินการ',
  STABLE: 'ปกติ',
};

const STATUS_BADGE: Record<PatientStatus, string> = {
  CRITICAL: 'bg-red-100 text-red-700 border border-red-200',
  PENDING: 'bg-amber-100 text-amber-700 border border-amber-200',
  STABLE: 'bg-green-100 text-green-700 border border-green-200',
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';

  const [patients, eventCount] = await Promise.all([
    fetchPatients(token),
    fetchEventCount(token),
  ]);

  const totalPatients = patients.length;
  const criticalCount = patients.filter((p) => p.status === 'CRITICAL').length;
  const stableCount = patients.filter((p) => p.status === 'STABLE').length;
  const recentPatients = patients.slice(-5).reverse();

  const stats = [
    {
      label: 'ผู้ป่วยทั้งหมด',
      value: totalPatients > 0 ? String(totalPatients) : '—',
      color: 'text-primary',
      bg: 'bg-primary/10 border-primary/20',
    },
    {
      label: 'วิกฤต',
      value: totalPatients > 0 ? String(criticalCount) : '—',
      color: 'text-danger',
      bg: 'bg-red-50 border-red-200',
    },
    {
      label: 'ปกติ',
      value: totalPatients > 0 ? String(stableCount) : '—',
      color: 'text-success',
      bg: 'bg-green-50 border-green-200',
    },
    {
      label: 'กิจกรรมเดือนนี้',
      value: eventCount > 0 ? String(eventCount) : '—',
      color: 'text-warning',
      bg: 'bg-amber-50 border-amber-200',
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-mono text-primary tracking-widest uppercase mb-1">Overview</p>
        <h1 className="font-display text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((card) => (
          <div key={card.label} className={`border rounded-xl p-5 ${card.bg}`}>
            <p className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-2">
              {card.label}
            </p>
            <p className={`text-4xl font-display font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent patients table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-display font-semibold text-gray-900 text-base">ผู้ป่วยล่าสุด</h2>
        </div>
        {recentPatients.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-gray-400 text-sm font-mono">ไม่มีข้อมูลผู้ป่วย</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-mono text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="px-5 py-3 font-medium">ชื่อ</th>
                <th className="px-5 py-3 font-medium">HN</th>
                <th className="px-5 py-3 font-medium">สถานะ</th>
                <th className="px-5 py-3 font-medium">สถานที่</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentPatients.map((patient) => (
                <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-sans text-gray-900">{patient.name}</td>
                  <td className="px-5 py-3 font-mono text-gray-500 text-xs">{patient.hn}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium ${STATUS_BADGE[patient.status]}`}
                    >
                      {STATUS_LABELS[patient.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-sans text-gray-500 text-xs">
                    {patient.locationText}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

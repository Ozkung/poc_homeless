'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Patient {
  id: string;
  name: string;
  hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE';
  age?: number;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  conditions: string[];
  locationText?: string;
}

type StatusFilter = 'ALL' | 'CRITICAL' | 'PENDING' | 'STABLE';

const STATUS_LABELS: Record<string, string> = {
  CRITICAL: 'วิกฤต',
  PENDING: 'รอดำเนินการ',
  STABLE: 'ปกติ',
};

const STATUS_BADGE: Record<string, string> = {
  CRITICAL: 'bg-danger/10 text-danger border border-danger/30',
  PENDING: 'bg-amber-100 text-warning border border-amber-200',
  STABLE: 'bg-green-100 text-success border border-green-200',
};

const FILTER_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'ทั้งหมด', value: 'ALL' },
  { label: 'วิกฤต', value: 'CRITICAL' },
  { label: 'รอดำเนินการ', value: 'PENDING' },
  { label: 'ปกติ', value: 'STABLE' },
];

export default function PatientsPage() {
  const { data: session } = useSession();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  useEffect(() => {
    if (!session?.accessToken) return;
    setLoading(true);
    fetch(`${API_URL}/patients`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Patient[]) => setPatients(data))
      .catch(() => setPatients([]))
      .finally(() => setLoading(false));
  }, [session?.accessToken]);

  const filtered = patients.filter((p) => {
    const q = query.trim().toLowerCase();
    const matchesQuery =
      q === '' || p.name.toLowerCase().includes(q) || p.hn.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'ALL' || p.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-mono text-primary tracking-widest uppercase mb-1">Patients</p>
          <h1 className="font-display text-2xl font-bold text-gray-900">รายชื่อผู้ป่วย</h1>
        </div>
        <Link
          href="/patients/new"
          className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + เพิ่มผู้ป่วย
        </Link>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="ค้นหาชื่อ หรือ HN..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-sans text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 bg-white"
        />
        <div className="flex gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-2 rounded-lg text-xs font-mono font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-primary text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-primary/50 hover:text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center">
            <p className="font-mono text-sm text-gray-400 animate-pulse">กำลังโหลด...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-4xl mb-3">🏥</p>
            <p className="font-mono text-sm text-gray-400">ไม่พบข้อมูลผู้ป่วย</p>
            <p className="text-xs text-gray-300 mt-1">ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-mono text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 font-medium">ชื่อ</th>
                <th className="px-5 py-3 font-medium">HN</th>
                <th className="px-5 py-3 font-medium">สถานะ</th>
                <th className="px-5 py-3 font-medium">สถานที่</th>
                <th className="px-5 py-3 font-medium">อายุ</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((patient) => (
                <tr key={patient.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-sans text-gray-900 font-medium">{patient.name}</td>
                  <td className="px-5 py-3 font-mono text-gray-500 text-xs">{patient.hn}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium ${STATUS_BADGE[patient.status]}`}
                    >
                      {STATUS_LABELS[patient.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-sans text-gray-500 text-xs">
                    {patient.locationText ?? '—'}
                  </td>
                  <td className="px-5 py-3 font-mono text-gray-500 text-xs">
                    {patient.age != null ? `${patient.age} ปี` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/patients/${patient.id}`}
                      className="text-xs font-mono text-primary hover:underline"
                    >
                      ดูโปรไฟล์ →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && (
        <p className="text-xs font-mono text-gray-400 mt-3">
          แสดง {filtered.length} จาก {patients.length} ราย
        </p>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface FormTemplate {
  id: string;
  title: string;
  description?: string;
  isActive: boolean;
  fields: unknown[];
  createdBy?: { displayName: string };
  updatedAt: string;
}

export default function FormsPage() {
  const { data: session } = useSession();
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.accessToken) return;
    setLoading(true);
    fetch(`${API_URL}/forms`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: FormTemplate[]) => setForms(data))
      .catch(() => setForms([]))
      .finally(() => setLoading(false));
  }, [session?.accessToken]);

  async function handleDelete(id: string) {
    if (!confirm('ยืนยันการลบแบบฟอร์มนี้?')) return;
    setDeletingId(id);
    try {
      await fetch(`${API_URL}/forms/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      setForms((prev) => prev.filter((f) => f.id !== id));
    } catch {
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-mono text-purple-400 tracking-widest uppercase mb-1">Forms</p>
          <h1 className="font-display text-2xl font-bold text-gray-900">แบบฟอร์ม</h1>
        </div>
        <Link
          href="/forms/new"
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + สร้างแบบฟอร์ม
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center">
            <p className="font-mono text-sm text-gray-400 animate-pulse">กำลังโหลด...</p>
          </div>
        ) : forms.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-mono text-sm text-gray-400">ยังไม่มีแบบฟอร์ม</p>
            <p className="text-xs text-gray-300 mt-1">กดปุ่ม + สร้างแบบฟอร์ม เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-mono text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 font-medium">ชื่อแบบฟอร์ม</th>
                <th className="px-5 py-3 font-medium">จำนวนฟิลด์</th>
                <th className="px-5 py-3 font-medium">สร้างโดย</th>
                <th className="px-5 py-3 font-medium">อัปเดตล่าสุด</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {forms.map((form) => (
                <tr key={form.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-sans text-gray-900 font-medium">{form.title}</td>
                  <td className="px-5 py-3 font-mono text-gray-500 text-xs">{form.fields.length} ฟิลด์</td>
                  <td className="px-5 py-3 font-sans text-gray-500 text-xs">
                    {form.createdBy?.displayName ?? '—'}
                  </td>
                  <td className="px-5 py-3 font-mono text-gray-400 text-xs">
                    {new Date(form.updatedAt).toLocaleDateString('th-TH')}
                  </td>
                  <td className="px-5 py-3 text-right flex items-center justify-end gap-3">
                    <Link
                      href={`/forms/${form.id}/builder`}
                      className="text-xs font-mono text-purple-500 hover:underline"
                    >
                      แก้ไข
                    </Link>
                    <button
                      onClick={() => handleDelete(form.id)}
                      disabled={deletingId === form.id}
                      className="text-xs font-mono text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                    >
                      {deletingId === form.id ? '...' : 'ลบ'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && forms.length > 0 && (
        <p className="text-xs font-mono text-gray-400 mt-3">
          แบบฟอร์มทั้งหมด {forms.length} รายการ
        </p>
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
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

interface Activity {
  id: string;
  type: string;
  createdAt: string;
  payload?: Record<string, string>;
  actor: { displayName: string };
}

interface Submission {
  id: string;
  submittedAt: string;
  formTemplate: { title: string };
  submittedBy: { displayName: string };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
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

const GENDER_LABELS: Record<string, string> = {
  MALE: 'ชาย',
  FEMALE: 'หญิง',
  OTHER: 'อื่น ๆ',
};

const ACTIVITY_TYPE_BADGE: Record<string, string> = {
  VISIT: 'bg-primary/10 text-primary border border-primary/30',
  NOTE: 'bg-gray-100 text-gray-600 border border-gray-200',
  ALERT: 'bg-danger/10 text-danger border border-danger/30',
  UPDATE: 'bg-amber-100 text-warning border border-amber-200',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ──────────────────────────────────────────────
// Data fetching
// ──────────────────────────────────────────────
async function fetchPatient(token: string, id: string): Promise<Patient | null> {
  try {
    const res = await fetch(`${API_URL}/patients/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.json() as Promise<Patient>;
  } catch {
    return null;
  }
}

async function fetchActivities(token: string, id: string): Promise<Activity[]> {
  try {
    const res = await fetch(`${API_URL}/patients/${id}/activities`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return res.json() as Promise<Activity[]>;
  } catch {
    return [];
  }
}

async function fetchSubmissions(token: string, id: string): Promise<Submission[]> {
  try {
    const res = await fetch(`${API_URL}/patients/${id}/submissions`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return [];
    return res.json() as Promise<Submission[]>;
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────
export default async function PatientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';

  const [patient, activities, submissions] = await Promise.all([
    fetchPatient(token, id),
    fetchActivities(token, id),
    fetchSubmissions(token, id),
  ]);

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-5xl mb-4">🏥</p>
        <p className="font-display text-xl font-bold text-gray-700 mb-1">ไม่พบข้อมูลผู้ป่วย</p>
        <p className="font-mono text-sm text-gray-400 mb-6">ไม่พบผู้ป่วยรหัส {id}</p>
        <Link
          href="/patients"
          className="text-sm font-mono text-primary hover:underline"
        >
          ← กลับไปรายชื่อผู้ป่วย
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/patients" className="text-xs font-mono text-gray-400 hover:text-primary transition-colors">
          ← รายชื่อผู้ป่วย
        </Link>
      </div>

      {/* Patient header card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-display text-2xl font-bold text-gray-900">{patient.name}</h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-medium ${STATUS_BADGE[patient.status]}`}
              >
                {STATUS_LABELS[patient.status]}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-mono text-gray-500 mb-4">
              <span>
                <span className="text-gray-400">HN:</span>{' '}
                <span className="text-gray-700">{patient.hn}</span>
              </span>
              {patient.age != null && (
                <span>
                  <span className="text-gray-400">อายุ:</span>{' '}
                  <span className="text-gray-700">{patient.age} ปี</span>
                </span>
              )}
              {patient.gender && (
                <span>
                  <span className="text-gray-400">เพศ:</span>{' '}
                  <span className="text-gray-700">{GENDER_LABELS[patient.gender] ?? patient.gender}</span>
                </span>
              )}
              {patient.locationText && (
                <span>
                  <span className="text-gray-400">สถานที่:</span>{' '}
                  <span className="text-gray-700">{patient.locationText}</span>
                </span>
              )}
            </div>

            {/* Conditions */}
            {patient.conditions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {patient.conditions.map((cond) => (
                  <span
                    key={cond}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-sans bg-primary/10 text-primary border border-primary/30"
                  >
                    {cond}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout for timeline + submissions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity timeline */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-display font-semibold text-gray-900 text-base">ประวัติกิจกรรม</h2>
            <p className="text-xs font-mono text-gray-400 mt-0.5">{activities.length} รายการ</p>
          </div>

          {activities.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="font-mono text-sm text-gray-400">ยังไม่มีกิจกรรม</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {activities.map((activity) => (
                <li key={activity.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium ${
                            ACTIVITY_TYPE_BADGE[activity.type] ?? 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}
                        >
                          {activity.type}
                        </span>
                      </div>
                      <p className="text-sm font-sans text-gray-700">
                        โดย{' '}
                        <span className="font-medium">{activity.actor.displayName}</span>
                      </p>
                    </div>
                    <time className="text-xs font-mono text-gray-400 shrink-0 mt-0.5">
                      {formatDate(activity.createdAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Form submissions */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-display font-semibold text-gray-900 text-base">การบันทึกแบบฟอร์ม</h2>
            <p className="text-xs font-mono text-gray-400 mt-0.5">{submissions.length} รายการ</p>
          </div>

          {submissions.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="font-mono text-sm text-gray-400">ยังไม่มีการบันทึกแบบฟอร์ม</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {submissions.map((sub) => (
                <li key={sub.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-sans font-medium text-gray-800 truncate">
                        {sub.formTemplate.title}
                      </p>
                      <p className="text-xs font-sans text-gray-500 mt-0.5">
                        บันทึกโดย{' '}
                        <span className="font-medium">{sub.submittedBy.displayName}</span>
                      </p>
                    </div>
                    <time className="text-xs font-mono text-gray-400 shrink-0 mt-0.5">
                      {formatDate(sub.submittedAt)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import { Card, Descriptions, Tag, Timeline, List, Typography } from 'antd';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Patient {
  id: string; name: string; hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE';
  age?: number; gender?: 'MALE' | 'FEMALE' | 'OTHER';
  conditions: string[]; locationText?: string;
}
interface Activity {
  id: string; type: string; createdAt: string;
  payload?: Record<string, string>;
  actor: { displayName: string };
}
interface Submission {
  id: string; submittedAt: string;
  formTemplate: { title: string };
  submittedBy: { displayName: string };
}

const STATUS_COLOR: Record<string, string> = { CRITICAL: 'error', PENDING: 'warning', STABLE: 'success' };
const STATUS_LABEL: Record<string, string> = { CRITICAL: 'วิกฤต', PENDING: 'รอดำเนินการ', STABLE: 'ปกติ' };
const GENDER_LABEL: Record<string, string> = { MALE: 'ชาย', FEMALE: 'หญิง', OTHER: 'อื่นๆ' };
const ACTIVITY_COLOR: Record<string, string> = {
  CHECK_IN: '#1677ff', NOTE: '#722ed1', FORM_SUBMIT: '#13c2c2',
  ASSIGN: '#faad14', STATUS_CHANGE: '#ff4d4f',
};

async function get<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

export default async function PatientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? '';
  const { id } = await params;

  const [patient, activities, submissions] = await Promise.all([
    get<Patient>(`${API_URL}/patients/${id}`, token),
    get<Activity[]>(`${API_URL}/patients/${id}/activities`, token),
    get<Submission[]>(`${API_URL}/patients/${id}/submissions`, token),
  ]);

  if (!patient) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Text type="secondary">ไม่พบข้อมูลผู้ป่วย</Text>
        <div style={{ marginTop: 12 }}>
          <Link href="/patients">← กลับรายชื่อผู้ป่วย</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/patients" style={{ fontSize: 12, color: '#aaa' }}>← ผู้ป่วย</Link>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            Patient Profile
          </div>
          <Title level={2} style={{ margin: 0, fontFamily: "'Sarabun',sans-serif", fontWeight: 800, letterSpacing: -1 }}>
            {patient.name}
          </Title>
        </div>
        <Tag color={STATUS_COLOR[patient.status]} style={{ fontSize: 13, padding: '4px 14px' }}>
          {STATUS_LABEL[patient.status]}
        </Tag>
      </div>

      {/* Bento grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>

        {/* Demographics — span 3 */}
        <Card style={{ gridColumn: 'span 3' }} styles={{ body: { padding: 24 } }}>
          <Descriptions
            column={3}
            size="small"
            labelStyle={{ color: '#aaa', fontSize: 11, fontFamily: "'Sarabun',sans-serif" }}
          >
            <Descriptions.Item label="HN">{patient.hn}</Descriptions.Item>
            <Descriptions.Item label="อายุ">{patient.age ? `${patient.age} ปี` : '—'}</Descriptions.Item>
            <Descriptions.Item label="เพศ">{patient.gender ? GENDER_LABEL[patient.gender] : '—'}</Descriptions.Item>
            <Descriptions.Item label="สถานที่" span={2}>{patient.locationText ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="สถานะ">
              <Tag color={STATUS_COLOR[patient.status]}>{STATUS_LABEL[patient.status]}</Tag>
            </Descriptions.Item>
            {patient.conditions.length > 0 && (
              <Descriptions.Item label="โรคประจำตัว" span={3}>
                {patient.conditions.map((c) => <Tag key={c} style={{ marginRight: 4 }}>{c}</Tag>)}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        {/* Activity timeline — span 2 */}
        <Card
          title={
            <Text style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
              กิจกรรม
            </Text>
          }
          style={{ gridColumn: 'span 2' }}
          styles={{ body: { padding: '16px 24px' } }}
        >
          {!activities?.length ? (
            <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มีกิจกรรม</Text>
          ) : (
            <Timeline
              items={activities.slice(0, 10).map((a) => ({
                color: ACTIVITY_COLOR[a.type] ?? '#d9d9d9',
                children: (
                  <div>
                    <Text style={{ fontSize: 13 }}>{a.actor.displayName}</Text>
                    <Tag style={{ marginLeft: 8, fontSize: 10 }}>{a.type}</Tag>
                    <div style={{ fontSize: 11, color: '#aaa', fontFamily: "'Sarabun',sans-serif", marginTop: 2 }}>
                      {new Date(a.createdAt).toLocaleString('th-TH')}
                    </div>
                    {a.payload?.note && (
                      <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{a.payload.note}</div>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </Card>

        {/* Submissions — span 1 */}
        <Card
          title={
            <Text style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
              แบบฟอร์มที่ส่ง
            </Text>
          }
          styles={{ body: { padding: '16px 24px' } }}
        >
          {!submissions?.length ? (
            <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มีการส่งแบบฟอร์ม</Text>
          ) : (
            <List
              size="small"
              dataSource={submissions.slice(0, 8)}
              renderItem={(s) => (
                <List.Item style={{ padding: '8px 0' }}>
                  <List.Item.Meta
                    title={<Text style={{ fontSize: 13, fontWeight: 600 }}>{s.formTemplate.title}</Text>}
                    description={
                      <div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{s.submittedBy.displayName}</div>
                        <div style={{ fontSize: 10, color: '#ccc', fontFamily: "'Sarabun',sans-serif" }}>
                          {new Date(s.submittedAt).toLocaleDateString('th-TH')}
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

      </div>
    </div>
  );
}

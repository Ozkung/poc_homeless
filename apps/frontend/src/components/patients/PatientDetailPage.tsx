import Link from 'next/link';
import { Card, Collapse, Descriptions, Tag, Tabs, Timeline } from 'antd';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

interface Patient {
  id: string; name: string; hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE' | 'MISSING';
  age?: number; gender?: 'MALE' | 'FEMALE' | 'OTHER';
  conditions: string[]; locationText?: string;
}
interface Activity {
  id: string; type: string; createdAt: string;
  payload?: Record<string, string>;
  actor: { displayName: string };
}
interface Submission {
  id: string; submittedAt: string; answers?: any[];
  formTemplate: { title: string };
  submittedBy: { displayName: string };
}

const STATUS_COLOR: Record<string, string> = { CRITICAL: 'error', PENDING: 'warning', STABLE: 'success', MISSING: 'default' };
const STATUS_LABEL: Record<string, string> = { CRITICAL: 'วิกฤต', PENDING: 'รอดำเนินการ', STABLE: 'ปกติ', MISSING: 'หายตัว' };
const GENDER_LABEL: Record<string, string> = { MALE: 'ชาย', FEMALE: 'หญิง', OTHER: 'อื่นๆ' };
const ACTIVITY_COLOR: Record<string, string> = {
  CHECK_IN: '#1677ff', NOTE: '#722ed1', FORM_SUBMIT: '#13c2c2',
  ASSIGN: '#faad14', STATUS_CHANGE: '#ff4d4f', SOS: '#ff0000',
};

async function get<T>(url: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

interface Props {
  id: string;
  token: string;
  backHref: string;
  backLabel?: string;
  /** แสดง Care Plan tab หรือไม่ */
  showCarePlan?: boolean;
  CarePlanTabComponent?: React.ComponentType<{ patientId: string }>;
}

export default async function PatientDetailPage({
  id, token, backHref, backLabel = '← ผู้ป่วย', showCarePlan = false, CarePlanTabComponent,
}: Props) {
  const [patient, activities, submissions] = await Promise.all([
    get<Patient>(`${API_URL}/patients/${id}`, token),
    get<Activity[]>(`${API_URL}/patients/${id}/activities`, token),
    get<Submission[]>(`${API_URL}/patients/${id}/submissions`, token),
  ]);

  if (!patient) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <span style={{ color: '#888' }}>ไม่พบข้อมูลผู้ป่วย</span>
        <div style={{ marginTop: 12 }}>
          <Link href={backHref}>{backLabel}</Link>
        </div>
      </div>
    );
  }

  const checkInCount = activities?.filter((a) => a.type === 'CHECK_IN').length ?? 0;
  const thisMonth = new Date().getMonth();
  const formsThisMonth = submissions?.filter((s) => new Date(s.submittedAt).getMonth() === thisMonth).length ?? 0;

  const heroStats = [
    { label: 'Check-in ทั้งหมด', value: checkInCount, color: '#1677ff' },
    { label: 'Form เดือนนี้', value: formsThisMonth, color: '#52c41a' },
    { label: 'กิจกรรมทั้งหมด', value: activities?.length ?? 0, color: '#faad14' },
    { label: 'Form ส่งแล้ว', value: submissions?.length ?? 0, color: '#722ed1' },
  ];

  const tabs = [
    {
      key: 'info',
      label: 'ข้อมูล',
      children: (
        <Descriptions column={3} size="small" labelStyle={{ color: '#aaa', fontSize: 11 }}>
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
      ),
    },
    {
      key: 'timeline',
      label: 'Timeline',
      children: !activities?.length ? (
        <span style={{ color: '#888', fontSize: 12 }}>ยังไม่มีกิจกรรม</span>
      ) : (
        <Timeline items={activities.slice(0, 20).map((a) => ({
          color: ACTIVITY_COLOR[a.type] ?? '#d9d9d9',
          children: (
            <div>
              <span style={{ fontSize: 13 }}>{a.actor.displayName}</span>
              <Tag style={{ marginLeft: 8, fontSize: 10 }}>{a.type}</Tag>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                {new Date(a.createdAt).toLocaleString('th-TH')}
              </div>
              {a.payload?.note && (
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{a.payload.note}</div>
              )}
            </div>
          ),
        }))} />
      ),
    },
    {
      key: 'formhistory',
      label: 'Form History',
      children: !submissions?.length ? (
        <span style={{ color: '#888', fontSize: 12 }}>ยังไม่มีการส่งแบบฟอร์ม</span>
      ) : (
        <Collapse
          items={submissions.slice(0, 10).map((s) => ({
            key: s.id,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', flexShrink: 0 }}>
                  {new Date(s.submittedAt).toLocaleDateString('th-TH')}
                </span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{s.formTemplate.title}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{s.submittedBy.displayName}</span>
              </div>
            ),
            children: (
              <div style={{ display: 'grid', gap: 8 }}>
                {Array.isArray(s.answers) && (s.answers as any[]).map((ans: any, i: number) => (
                  <div key={i}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{ans.fieldId}</div>
                    <div style={{ fontSize: 12, padding: '3px 8px', background: '#f5f5f5', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>
                      {String(ans.value)}
                    </div>
                  </div>
                ))}
              </div>
            ),
          }))}
        />
      ),
    },
    ...(showCarePlan && CarePlanTabComponent ? [{
      key: 'careplan',
      label: 'Care Plan',
      children: <CarePlanTabComponent patientId={patient.id} />,
    }] : []),
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link href={backHref} style={{ fontSize: 12, color: '#aaa' }}>{backLabel}</Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            Patient Profile
          </div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -1, color: '#111' }}>
            {patient.name}
          </h2>
        </div>
        <Tag color={STATUS_COLOR[patient.status]} style={{ fontSize: 13, padding: '4px 14px' }}>
          {STATUS_LABEL[patient.status]}
        </Tag>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {heroStats.map((stat) => (
          <Card key={stat.label} styles={{ body: { padding: '14px 16px', textAlign: 'center' } }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: stat.color, fontFamily: 'monospace' }}>{stat.value}</div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{stat.label}</div>
          </Card>
        ))}
      </div>
      <Card>
        <Tabs defaultActiveKey="info" items={tabs} />
      </Card>
    </div>
  );
}

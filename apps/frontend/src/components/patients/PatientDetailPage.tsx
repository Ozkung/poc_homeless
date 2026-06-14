import Link from 'next/link';
import { Card, Col, Collapse, Descriptions, Row, Tag, Tabs, Timeline } from 'antd';
import StatusUpdateButton from './StatusUpdateButton';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/patientStatus';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

interface Patient {
  id: string; name: string; hn: string;
  status: 'CRITICAL' | 'PENDING' | 'STABLE' | 'MISSING';
  age?: number; gender?: 'MALE' | 'FEMALE' | 'OTHER';
  conditions: string[]; initialComplaint?: string; locationText?: string;
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

const GENDER_LABEL: Record<string, string> = { MALE: 'ชาย', FEMALE: 'หญิง', OTHER: 'อื่นๆ' };
const ACTIVITY_COLOR: Record<string, string> = {
  CHECK_IN: '#1677ff', NOTE: '#722ed1', FORM_SUBMIT: '#13c2c2',
  ASSIGN: '#faad14', STATUS_CHANGE: '#ff4d4f', SOS: '#ff0000',
  DIAGNOSIS: '#0ea5e9', PRESCRIPTION: '#7c3aed', DISPENSE: '#059669',
};

const ACTIVITY_LABEL: Record<string, string> = {
  CHECK_IN: 'เช็คอิน', NOTE: 'บันทึก', FORM_SUBMIT: 'ส่งแบบฟอร์ม',
  ASSIGN: 'มอบหมาย', STATUS_CHANGE: 'เปลี่ยนสถานะ', SOS: 'SOS',
  DIAGNOSIS: 'วินิจฉัย', PRESCRIPTION: 'สั่งยา', DISPENSE: 'จ่ายยา',
};

function activityDetail(a: Activity): string | null {
  const p = a.payload ?? {};
  if (a.type === 'DIAGNOSIS' && p.title) return `🩺 ${p.title}${p.severity ? ` (${p.severity})` : ''}`;
  if (a.type === 'PRESCRIPTION' && p.medications) return `💊 ${p.medications}`;
  if (a.type === 'DISPENSE' && p.itemName) return `📦 ${p.itemName}${p.quantity ? ` × ${p.quantity}` : ''}`;
  if (a.type === 'STATUS_CHANGE' && p.status) return `→ ${p.status}`;
  if (p.note) return p.note;
  return null;
}

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
  showCarePlan?: boolean;
  CarePlanTabComponent?: React.ComponentType<{ patientId: string }>;
  showStatusUpdate?: boolean;
}

export default async function PatientDetailPage({
  id, token, backHref, backLabel = '← ผู้ป่วย', showCarePlan = false, CarePlanTabComponent, showStatusUpdate = false,
}: Props) {
  const [patient, activities, submissions, assessmentRes] = await Promise.all([
    get<Patient>(`${API_URL}/patients/${id}`, token),
    get<Activity[]>(`${API_URL}/patients/${id}/activities`, token),
    get<Submission[]>(`${API_URL}/patients/${id}/submissions`, token),
    get<{ data: { healthcareRight?: string }[] }>(`${API_URL}/patients/${id}/assessment?skip=0&limit=1`, token),
  ]);
  const healthcareRight = assessmentRes?.data?.[0]?.healthcareRight ?? null;

  if (!patient) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <span style={{ color: '#888' }}>ไม่พบข้อมูลผู้ป่วย</span>
        <div style={{ marginTop: 12 }}><Link href={backHref}>{backLabel}</Link></div>
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
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" styles={{ label: { color: '#aaa', fontSize: 11 } }}>
          <Descriptions.Item label="HN">{patient.hn}</Descriptions.Item>
          <Descriptions.Item label="อายุ">{patient.age ? `${patient.age} ปี` : '—'}</Descriptions.Item>
          <Descriptions.Item label="เพศ">{patient.gender ? GENDER_LABEL[patient.gender] : '—'}</Descriptions.Item>
          <Descriptions.Item label="สถานที่" span={2}>{patient.locationText ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="สถานะ">
            <Tag color={STATUS_COLOR[patient.status]}>{STATUS_LABEL[patient.status]}</Tag>
          </Descriptions.Item>
          {healthcareRight && <Descriptions.Item label="สิทธิรักษาพยาบาล">{healthcareRight}</Descriptions.Item>}
          {patient.conditions.length > 0 && (
            <Descriptions.Item label="โรคประจำตัว" span={3}>
              {patient.conditions.map((c) => <Tag key={c} style={{ marginRight: 4 }}>{c}</Tag>)}
            </Descriptions.Item>
          )}
          {patient.initialComplaint && (
            <Descriptions.Item label="อาการเบื้องต้น" span={3}>
              {patient.initialComplaint}
            </Descriptions.Item>
          )}
        </Descriptions>
      ),
    },
    {
      key: 'timeline',
      label: 'Timeline',
      children: !activities?.length
        ? <span style={{ color: '#888', fontSize: 12 }}>ยังไม่มีกิจกรรม</span>
        : <Timeline items={activities.slice(0, 20).map((a) => ({
            color: ACTIVITY_COLOR[a.type] ?? '#d9d9d9',
            children: (
              <div>
                <span style={{ fontSize: 13 }}>{a.actor.displayName}</span>
                <Tag style={{ marginLeft: 8, fontSize: 10 }}>{ACTIVITY_LABEL[a.type] ?? a.type}</Tag>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{new Date(a.createdAt).toLocaleString('th-TH')}</div>
                {activityDetail(a) && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{activityDetail(a)}</div>}
              </div>
            ),
          }))} />,
    },
    {
      key: 'formhistory',
      label: 'Form History',
      children: !submissions?.length
        ? <span style={{ color: '#888', fontSize: 12 }}>ยังไม่มีการส่งแบบฟอร์ม</span>
        : <Collapse items={submissions.slice(0, 10).map((s) => ({
            key: s.id,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', flexShrink: 0 }}>
                  {new Date(s.submittedAt).toLocaleDateString('th-TH')}
                </span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13, minWidth: 120 }}>{s.formTemplate.title}</span>
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
          }))} />,
    },
    ...(showCarePlan && CarePlanTabComponent ? [{
      key: 'careplan',
      label: 'Care Plan',
      children: <CarePlanTabComponent patientId={patient.id} />,
    }] : []),
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href={backHref} style={{ fontSize: 12, color: '#aaa' }}>{backLabel}</Link>
      </div>

      {/* Header — responsive */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            Patient Profile
          </div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: '#111', lineHeight: 1.2 }}>
            {patient.name}
          </h2>
          <div style={{ marginTop: 4, fontSize: 12, color: '#8c8c8c' }}>HN: {patient.hn}</div>
        </div>
        {showStatusUpdate
          ? <StatusUpdateButton patientId={patient.id} currentStatus={patient.status} token={token} />
          : <Tag color={STATUS_COLOR[patient.status]} style={{ fontSize: 13, padding: '4px 14px', alignSelf: 'flex-start' }}>
              {STATUS_LABEL[patient.status]}
            </Tag>
        }
      </div>

      {/* Stats — 2 cols on mobile, 4 on desktop */}
      <Row gutter={[10, 10]} style={{ marginBottom: 20 }}>
        {heroStats.map((stat) => (
          <Col key={stat.label} xs={12} sm={6}>
            <Card styles={{ body: { padding: '14px 16px', textAlign: 'center' } }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: stat.color, fontFamily: 'monospace' }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{stat.label}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Card>
        <Tabs defaultActiveKey="info" items={tabs} />
      </Card>
    </div>
  );
}

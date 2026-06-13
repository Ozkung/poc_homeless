'use client';
import { useEffect, useState } from 'react';
import { Badge, Card, Collapse, Empty, Spin, Tag, Typography } from 'antd';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CalendarDays, MapPin, User, ClipboardList, AlertCircle } from 'lucide-react';
import { STATUS_COLOR as PATIENT_STATUS_COLOR, STATUS_LABEL as PATIENT_STATUS_LABEL } from '@/lib/patientStatus';

const { Text, Title } = Typography;

const STATUS_COLOR: Record<string, string> = { PENDING: 'orange', IN_PROGRESS: 'blue', DONE: 'green', NOT_FOUND: 'red' };
const STATUS_LABEL: Record<string, string> = { PENDING: 'รอดำเนินการ', IN_PROGRESS: 'กำลังดำเนินการ', DONE: 'เสร็จแล้ว', NOT_FOUND: 'ไม่พบผู้ป่วย' };
const PRIORITY_COLOR: Record<string, string> = { HIGH: 'red', MEDIUM: 'orange', LOW: 'green' };

export default function FWTasksPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch('/api/tasks/my', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setTasks(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  // Group tasks by event
  const eventGroups = tasks.reduce((acc: Record<string, any>, t: any) => {
    const eid = t.event?.id ?? 'no-event';
    if (!acc[eid]) acc[eid] = { event: t.event, tasks: [] };
    acc[eid].tasks.push(t);
    return acc;
  }, {});

  if (loading) return <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin size="large" /></div>;

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase' }}>Care Giver</Text>
        <Title level={3} style={{ margin: 0, fontWeight: 800 }}>งานของฉัน</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>{tasks.length} งานที่ยังค้างอยู่</Text>
      </div>

      {tasks.length === 0 ? (
        <Empty description="ยังไม่มีงานที่ได้รับมอบหมาย" />
      ) : (
        Object.values(eventGroups).map((group: any) => (
          <Card
            key={group.event?.id ?? 'no-event'}
            style={{ marginBottom: 16, borderRadius: 12 }}
            styles={{ body: { padding: '16px 20px' } }}
          >
            {/* Event header */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text strong style={{ fontSize: 16 }}>{group.event?.title ?? 'งานไม่มีชื่อ'}</Text>
                {group.event?.priority && (
                  <Tag color={PRIORITY_COLOR[group.event.priority] ?? 'default'} style={{ fontSize: 11 }}>
                    {group.event.priority}
                  </Tag>
                )}
                <Badge count={group.tasks.length} color="#1677ff" style={{ fontSize: 11 }} />
              </div>

              {group.event?.note && (
                <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
                  {group.event.note}
                </Text>
              )}

              <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                {group.event?.startDate && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#888' }}>
                    <CalendarDays size={12} />
                    {new Date(group.event.startDate).toLocaleDateString('th-TH')}
                    {group.event.endDate && ` – ${new Date(group.event.endDate).toLocaleDateString('th-TH')}`}
                  </span>
                )}
              </div>
            </div>

            {/* Patient list */}
            <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              รายชื่อผู้ป่วย ({group.tasks.length} คน)
            </div>

            <Collapse
              size="small"
              ghost
              items={group.tasks.map((task: any) => ({
                key: task.id,
                label: (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <User size={13} color="#888" />
                    <Text strong style={{ fontSize: 13 }}>{task.patient?.name ?? '—'}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>HN {task.patient?.hn ?? '—'}</Text>
                    {task.patient?.status && (
                      <Tag color={PATIENT_STATUS_COLOR[task.patient.status] ?? 'default'} style={{ fontSize: 10, margin: 0 }}>
                        {PATIENT_STATUS_LABEL[task.patient.status] ?? task.patient.status}
                      </Tag>
                    )}
                    <Tag color={STATUS_COLOR[task.status] ?? 'default'} style={{ fontSize: 10, margin: 0 }}>
                      {STATUS_LABEL[task.status] ?? task.status}
                    </Tag>
                  </div>
                ),
                children: (
                  <div style={{ paddingLeft: 20, display: 'grid', gap: 8 }}>
                    {task.patient?.locationText && (
                      <div style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                        <MapPin size={13} color="#888" style={{ flexShrink: 0, marginTop: 2 }} />
                        <Text>{task.patient.locationText}</Text>
                      </div>
                    )}
                    {task.patient?.initialComplaint && (
                      <div style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                        <AlertCircle size={13} color="#fa8c16" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>อาการเบื้องต้น</Text>
                          <Text>{task.patient.initialComplaint}</Text>
                        </div>
                      </div>
                    )}
                    {task.patient?.conditions?.length > 0 && (
                      <div style={{ fontSize: 12 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>โรคประจำตัว: </Text>
                        {task.patient.conditions.map((c: string) => <Tag key={c} style={{ fontSize: 11 }}>{c}</Tag>)}
                      </div>
                    )}
                    {task.formTemplate && (
                      <div style={{ display: 'flex', gap: 6, fontSize: 13 }}>
                        <ClipboardList size={13} color="#888" style={{ flexShrink: 0, marginTop: 2 }} />
                        <Text>แบบฟอร์ม: <strong>{task.formTemplate.title}</strong></Text>
                      </div>
                    )}
                    <div style={{ marginTop: 4 }}>
                      <span
                        onClick={() => router.push(`/fw/patients/${task.patient?.id}`)}
                        style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        ดูข้อมูลผู้ป่วย →
                      </span>
                    </div>
                  </div>
                ),
              }))}
            />
          </Card>
        ))
      )}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, Collapse, Empty, Form, Modal, Spin, Tag, Timeline, Typography, message } from 'antd';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { CalendarDays, MapPin, User, ClipboardList, AlertCircle, History } from 'lucide-react';
import { STATUS_COLOR as PATIENT_STATUS_COLOR, STATUS_LABEL as PATIENT_STATUS_LABEL } from '@/lib/patientStatus';
import { FormFieldRenderer } from '@/components/FormFieldRenderer';
import type { FormField } from '@homemed/shared-types';

const { Text, Title } = Typography;

const STATUS_COLOR: Record<string, string> = { PENDING: 'orange', IN_PROGRESS: 'blue', DONE: 'green', NOT_FOUND: 'red' };
const STATUS_LABEL: Record<string, string> = { PENDING: 'รอดำเนินการ', IN_PROGRESS: 'กำลังดำเนินการ', DONE: 'เสร็จแล้ว', NOT_FOUND: 'ไม่พบผู้ป่วย' };
const PRIORITY_COLOR: Record<string, string> = { CRITICAL: 'red', URGENT: 'orange', NORMAL: 'blue' };

interface FormState {
  taskId: string;
  liffToken: string;
  formTitle: string;
  patientName: string;
  patientHn: string;
  fields: FormField[];
}

interface CheckinActivity {
  id: string;
  createdAt: string;
  actor: { displayName: string; role: string };
}

export default function FWTasksPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const userId = (session as any)?.user?.id;
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal state
  const [formState, setFormState] = useState<FormState | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  // Check-in history per task: taskId → activities | 'loading'
  const [checkinHistory, setCheckinHistory] = useState<Record<string, CheckinActivity[] | 'loading'>>({});

  const loadTasks = () => {
    if (!token) return;
    fetch('/api/tasks/zone', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setTasks(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadTasks(); }, [token]);

  const loadCheckinHistory = (taskId: string) => {
    if (checkinHistory[taskId]) return;
    setCheckinHistory((prev) => ({ ...prev, [taskId]: 'loading' }));
    fetch(`/api/tasks/${taskId}/activities`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setCheckinHistory((prev) => ({ ...prev, [taskId]: Array.isArray(d) ? d : [] })))
      .catch(() => setCheckinHistory((prev) => ({ ...prev, [taskId]: [] })));
  };

  const openForm = (task: any) => {
    setAnswers({});
    setFormState({
      taskId: task.id,
      liffToken: task.liffToken ?? '',
      formTitle: task.formTemplate.title,
      patientName: task.patient?.name ?? '—',
      patientHn: task.patient?.hn ?? '—',
      fields: (task.formTemplate.fields as FormField[]).slice().sort((a, b) => a.order - b.order),
    });
  };

  const handleSubmit = async () => {
    if (!formState) return;

    const missing = formState.fields.filter((f) => f.required && !answers[f.id]);
    if (missing.length > 0) {
      message.warning(`กรุณากรอกข้อมูล: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const answerArray = Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value }));
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: formState.taskId, token: formState.liffToken, answers: answerArray }),
      });
      if (res.ok) {
        message.success('ส่งแบบฟอร์มสำเร็จ');
        setFormState(null);
        setLoading(true);
        loadTasks();
      } else {
        const err = await res.json().catch(() => ({}));
        message.error(err.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Group tasks by event
  const eventGroups = tasks.reduce((acc: Record<string, any>, t: any) => {
    const eid = t.event?.id ?? 'no-event';
    if (!acc[eid]) acc[eid] = { event: t.event, tasks: [] };
    acc[eid].tasks.push(t);
    return acc;
  }, {});

  if (loading) return <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin size="large" /></div>;

  const pendingCount = tasks.filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase' }}>Care Giver</Text>
        <Title level={3} style={{ margin: 0, fontWeight: 800 }}>งานในโซน</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>{pendingCount} งานที่ยังค้างอยู่ · ทั้งหมด {tasks.length} งาน</Text>
      </div>

      {tasks.length === 0 ? (
        <Empty description="ยังไม่มีงานในโซนของคุณ" />
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

            <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              รายชื่อผู้ป่วย ({group.tasks.length} คน)
            </div>

            <Collapse
              size="small"
              ghost
              onChange={(keys) => {
                const opened = Array.isArray(keys) ? keys : [keys];
                opened.forEach((taskId) => loadCheckinHistory(taskId as string));
              }}
              items={group.tasks.map((task: any) => {
                const isAssignedToMe = task.assigneeId === userId;
                const history = checkinHistory[task.id];

                return {
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
                      {!isAssignedToMe && (
                        <Tag style={{ fontSize: 10, margin: 0, color: '#888', borderColor: '#d9d9d9' }}>ไม่ได้มอบหมายให้คุณ</Tag>
                      )}
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
                      {task.formTemplate && isAssignedToMe && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <ClipboardList size={13} color="#888" style={{ flexShrink: 0 }} />
                          <Text style={{ flex: 1 }}>แบบฟอร์ม: <strong>{task.formTemplate.title}</strong></Text>
                          {task.status !== 'DONE' && task.status !== 'NOT_FOUND' && (
                            <Button
                              size="small"
                              type="primary"
                              icon={<ClipboardList size={11} />}
                              onClick={() => openForm(task)}
                            >
                              กรอกแบบฟอร์ม
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Check-in history */}
                      <div style={{ marginTop: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <History size={13} color="#888" />
                          <Text style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>ประวัติ Check-in</Text>
                        </div>

                        {history === 'loading' ? (
                          <Spin size="small" />
                        ) : !history || history.length === 0 ? (
                          <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มีการ Check-in</Text>
                        ) : (
                          <Timeline
                            style={{ marginTop: 4 }}
                            items={history.map((act) => ({
                              color: '#1677ff',
                              children: (
                                <div>
                                  <Text style={{ fontSize: 12 }}>{act.actor.displayName}</Text>
                                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>
                                    {new Date(act.createdAt).toLocaleString('th-TH')}
                                  </div>
                                </div>
                              ),
                            }))}
                          />
                        )}
                      </div>

                      <span
                        onClick={() => router.push(`/fw/patients/${task.patient?.id}`)}
                        style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer', textDecoration: 'underline' }}
                      >
                        ดูข้อมูลผู้ป่วย →
                      </span>
                    </div>
                  ),
                };
              })}
            />
          </Card>
        ))
      )}

      {/* Form fill modal */}
      <Modal
        open={!!formState}
        title={
          formState && (
            <div>
              <div style={{ fontWeight: 700 }}>{formState.formTitle}</div>
              <div style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>
                ผู้ป่วย: {formState.patientName} (HN {formState.patientHn})
              </div>
            </div>
          )
        }
        onCancel={() => { setFormState(null); setAnswers({}); }}
        footer={[
          <Button key="cancel" onClick={() => { setFormState(null); setAnswers({}); }}>ยกเลิก</Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit}>ส่งแบบฟอร์ม</Button>,
        ]}
        width={520}
        destroyOnClose
      >
        {formState && (
          <Form layout="vertical" style={{ marginTop: 8 }}>
            {formState.fields.map((field) => (
              <Form.Item
                key={field.id}
                label={
                  <span>
                    {field.label}
                    {field.required && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>*</span>}
                  </span>
                }
                style={{ marginBottom: 16 }}
              >
                <FormFieldRenderer
                  field={field}
                  value={answers[field.id]}
                  onChange={(id, val) => setAnswers((prev) => ({ ...prev, [id]: val }))}
                />
              </Form.Item>
            ))}
          </Form>
        )}
      </Modal>
    </div>
  );
}

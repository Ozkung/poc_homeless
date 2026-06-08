'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  format, getDay, addMonths, subMonths,
} from 'date-fns';
import { th } from 'date-fns/locale';
import { Button, Card, Drawer, Form, Input, Select, DatePicker, Tag, Typography, message } from 'antd';
import { useIsMobile } from '@/hooks/useIsMobile';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { User } from 'lucide-react';
import dayjs from 'dayjs';

const { Text, Title } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Priority = 'CRITICAL' | 'URGENT' | 'NORMAL';

interface TaskItem {
  id: string;
  assignee: { displayName: string };
  patient: { hn: string };
}

interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  priority: Priority;
  note?: string;
  tasks: TaskItem[];
}

const THAI_DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const PRIORITY_COLOR: Record<Priority, string> = {
  CRITICAL: '#ff4d4f',
  URGENT:   '#faad14',
  NORMAL:   '#1677ff',
};

const PRIORITY_TAG_COLOR: Record<Priority, string> = {
  CRITICAL: 'error',
  URGENT:   'warning',
  NORMAL:   'processing',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  CRITICAL: 'วิกฤต',
  URGENT:   'เร่งด่วน',
  NORMAL:   'ปกติ',
};

function eventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return events.filter((ev) => {
    const start = new Date(ev.startDate);
    const end = new Date(ev.endDate);
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return d >= s && d <= e;
  });
}

function priorityDotsForDay(evs: CalendarEvent[]): Priority[] {
  const seen = new Set<Priority>();
  const result: Priority[] = [];
  for (const ev of evs) {
    if (!seen.has(ev.priority)) { seen.add(ev.priority); result.push(ev.priority); }
  }
  return result;
}

function CreateEventForm({
  patients,
  users,
  formTemplates,
  saving,
  form,
  onFinish,
  onCancel,
}: {
  patients: { id: string; name: string; status: string }[];
  users: { id: string; displayName: string }[];
  formTemplates: { id: string; title: string }[];
  saving: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  onFinish: (v: any) => void;
  onCancel: () => void;
}) {
  return (
    <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ priority: 'NORMAL' }}>
      <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f5f5f5' }}>
        ข้อมูล Event
      </div>

      <Form.Item name="title" label="ชื่อ Event" rules={[{ required: true, message: 'กรุณาใส่ชื่อ Event' }]}>
        <Input placeholder="เช่น Follow-up รายสัปดาห์" />
      </Form.Item>

      <Form.Item name="dateRange" label="วันเริ่ม – สิ้นสุด" rules={[{ required: true, message: 'กรุณาเลือกวันที่' }]}>
        <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
      </Form.Item>

      <Form.Item name="priority" label="ความเร่งด่วน">
        <Select options={[
          { value: 'NORMAL',   label: '📅 ปกติ' },
          { value: 'URGENT',   label: '⚠️ เร่งด่วน' },
          { value: 'CRITICAL', label: '🚨 วิกฤต' },
        ]} />
      </Form.Item>

      <Form.Item name="patientIds" label="ผู้ป่วย" rules={[{ required: true, message: 'เลือกผู้ป่วยอย่างน้อย 1 คน' }]}>
        <Select
          mode="multiple"
          placeholder="เลือกผู้ป่วย..."
          options={patients.map((p) => ({ value: p.id, label: p.name }))}
          filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
        />
      </Form.Item>

      <Form.Item name="formTemplateId" label="Form Template">
        <Select
          allowClear
          placeholder="เลือก Form (ถ้ามี)..."
          options={formTemplates.map((f) => ({ value: f.id, label: f.title }))}
        />
      </Form.Item>

      <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, margin: '12px 0 12px', paddingBottom: 8, borderBottom: '1px solid #f5f5f5' }}>
        มอบหมายงาน
      </div>

      <Form.Item name="assigneeId" label="มอบหมายให้" rules={[{ required: true, message: 'เลือกผู้รับผิดชอบ' }]}>
        <Select
          placeholder="เลือกผู้ช่วย CM..."
          options={users.map((u) => ({ value: u.id, label: u.displayName }))}
        />
      </Form.Item>

      <Form.Item name="note" label="หมายเหตุ">
        <Input.TextArea rows={3} placeholder="คำแนะนำพิเศษถึงผู้ช่วย CM..." />
      </Form.Item>

      <div style={{ display: 'flex', gap: 8 }}>
        <Button type="primary" htmlType="submit" loading={saving} block>💾 บันทึก Event</Button>
        <Button onClick={onCancel}>ยกเลิก</Button>
      </div>
    </Form>
  );
}

export default function EventsPage() {
  const { data: session } = useSession();
  const isMobile = useIsMobile();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [drawerMode, setDrawerMode] = useState<'view' | 'create'>('view');
  const [createForm] = Form.useForm();
  const [users, setUsers] = useState<{ id: string; displayName: string }[]>([]);
  const [formTemplates, setFormTemplates] = useState<{ id: string; title: string }[]>([]);
  const [allPatients, setAllPatients] = useState<{ id: string; name: string; status: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    const month = currentMonth.getMonth() + 1;
    const year = currentMonth.getFullYear();
    const controller = new AbortController();

    async function fetchEvents() {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/events?month=${month}&year=${year}`, {
          headers: { Authorization: `Bearer ${session!.accessToken}` },
          signal: controller.signal,
        });
        if (!res.ok) { setEvents([]); return; }
        const data: CalendarEvent[] = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setEvents([]);
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
    return () => controller.abort();
  }, [currentMonth, session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) return;
    const headers = { Authorization: `Bearer ${session.accessToken}` };
    Promise.all([
      fetch(`${API_URL}/users`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${API_URL}/forms`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${API_URL}/patients`, { headers }).then((r) => r.ok ? r.json() : []),
    ]).then(([u, f, p]) => {
      setUsers(Array.isArray(u) ? u : []);
      setFormTemplates(Array.isArray(f) ? f : []);
      setAllPatients(Array.isArray(p) ? p : []);
    }).catch(() => {});
  }, [session?.accessToken]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd   = endOfMonth(currentMonth);
  const daysInMonth  = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  function goPrev() { setCurrentMonth((m) => subMonths(m, 1)); setSelectedDate(null); }
  function goNext() { setCurrentMonth((m) => addMonths(m, 1)); setSelectedDate(null); }

  const selectedDayEvents = selectedDate ? eventsForDate(events, selectedDate) : [];
  const monthTitle = format(currentMonth, 'MMMM yyyy', { locale: th });

  async function handleCreateEvent(values: {
    title: string;
    dateRange: [dayjs.Dayjs, dayjs.Dayjs];
    priority: 'NORMAL' | 'URGENT' | 'CRITICAL';
    patientIds: string[];
    assigneeId: string;
    formTemplateId?: string;
    note?: string;
  }) {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.accessToken}`,
        },
        body: JSON.stringify({
          title: values.title,
          startDate: values.dateRange[0].toISOString(),
          endDate: values.dateRange[1].toISOString(),
          priority: values.priority,
          patientIds: values.patientIds,
          assigneeId: values.assigneeId,
          formTemplateId: values.formTemplateId,
          note: values.note,
        }),
      });
      if (res.ok) {
        message.success('สร้าง Event เรียบร้อย');
        createForm.resetFields();
        setDrawerMode('view');
        setSelectedDate(null);
        setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth(), 1));
      } else {
        message.error('บันทึกไม่สำเร็จ กรุณาลองใหม่');
      }
    } catch {
      message.error('เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            Planning
          </div>
          <Title level={2} style={{ margin: 0, fontFamily: "'Sarabun',sans-serif", fontWeight: 800, letterSpacing: -1 }}>
            แผนการเยี่ยม
          </Title>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {loading && <Text type="secondary" style={{ fontSize: 11 }}>กำลังโหลด...</Text>}
          <Button type="primary" onClick={() => { createForm.resetFields(); setDrawerMode('create'); }}>
            + สร้าง Event
          </Button>
        </div>
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Button icon={<LeftOutlined />} onClick={goPrev} aria-label="เดือนก่อน" />
        <span style={{
          fontFamily: "'Sarabun',sans-serif", fontWeight: 700, fontSize: 15, color: '#111',
          minWidth: 160, textAlign: 'center', textTransform: 'capitalize',
        }}>
          {monthTitle}
        </span>
        <Button icon={<RightOutlined />} onClick={goNext} aria-label="เดือนถัดไป" />
      </div>

      {/* Calendar card */}
      <Card styles={{ body: { padding: 0 } }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #f0f0f0' }}>
          {THAI_DAY_NAMES.map((day) => (
            <div key={day} style={{
              padding: isMobile ? '6px 0' : '8px 0', textAlign: 'center',
              fontFamily: "'Sarabun',sans-serif",
              fontSize: isMobile ? 9 : 11,
              color: '#aaa', textTransform: 'uppercase', letterSpacing: 1,
            }}>
              {isMobile ? day.slice(0, 2) : day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`pad-${i}`} style={{ minHeight: isMobile ? 48 : 80, borderBottom: '1px solid #fafafa', borderRight: '1px solid #fafafa' }} />
          ))}

          {daysInMonth.map((day) => {
            const dayEvents = eventsForDate(events, day);
            const dots = priorityDotsForDay(dayEvents);
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate((prev) => prev && isSameDay(prev, day) ? null : day)}
                style={{
                  minHeight: isMobile ? 48 : 80,
                  borderBottom: '1px solid #f5f5f5',
                  borderRight: '1px solid #f5f5f5',
                  padding: isMobile ? 4 : 8,
                  textAlign: 'left',
                  background: isSelected ? '#e6f4ff' : 'transparent',
                  outline: isSelected ? '2px solid #1677ff' : 'none',
                  outlineOffset: -2,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  border: 'none',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: '50%', marginBottom: 2,
                  fontFamily: "'Sarabun',sans-serif", fontSize: 11, fontWeight: 500,
                  background: isToday ? '#1677ff' : 'transparent',
                  color: isToday ? '#fff' : '#555',
                }}>
                  {format(day, 'd')}
                </span>

                {dayEvents.length > 0 && (
                  <p style={{ fontSize: 10, fontFamily: "'Sarabun',sans-serif", color: '#aaa', margin: '0 0 2px' }}>
                    {dayEvents.length} กิจกรรม
                  </p>
                )}

                {dots.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {dots.map((priority) => (
                      <span
                        key={priority}
                        title={PRIORITY_LABEL[priority]}
                        style={{
                          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                          background: PRIORITY_COLOR[priority],
                        }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Event detail / create drawer */}
      <Drawer
        title={
          drawerMode === 'create' ? (
            <span style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 12 }}>สร้าง Event ใหม่</span>
          ) : selectedDate ? (
            <span style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 12 }}>
              {format(selectedDate, 'd MMMM yyyy', { locale: th })}
            </span>
          ) : 'กิจกรรม'
        }
        placement="right"
        width={isMobile ? '100%' : 400}
        open={selectedDate !== null || drawerMode === 'create'}
        onClose={() => { setSelectedDate(null); setDrawerMode('view'); createForm.resetFields(); }}
        extra={
          <Button type="primary" size="small" onClick={() => {
            createForm.resetFields();
            setDrawerMode('create');
          }}>
            + สร้าง Event
          </Button>
        }
      >
        {drawerMode === 'create' ? (
          <CreateEventForm
            patients={allPatients}
            users={users}
            formTemplates={formTemplates}
            saving={saving}
            form={createForm}
            onFinish={handleCreateEvent}
            onCancel={() => { setDrawerMode('view'); createForm.resetFields(); }}
          />
        ) : (
          <>
            {loading && (
              <div style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>กำลังโหลด...</div>
            )}
            {!loading && selectedDayEvents.length === 0 && (
              <div style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>ไม่มีกิจกรรม</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {selectedDayEvents.map((ev) => {
                const uniqueAssignees = ev.tasks
                  .map((t) => t.assignee.displayName)
                  .filter((v, i, a) => a.indexOf(v) === i);
                const uniquePatients = ev.tasks
                  .map((t) => t.patient.hn)
                  .filter((v, i, a) => a.indexOf(v) === i);

                return (
                  <Card key={ev.id} size="small" style={{ borderLeft: `3px solid ${PRIORITY_COLOR[ev.priority]}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontWeight: 600, fontSize: 13 }}>{ev.title}</Text>
                      <Tag color={PRIORITY_TAG_COLOR[ev.priority]} style={{ fontSize: 10, flexShrink: 0 }}>
                        {PRIORITY_LABEL[ev.priority]}
                      </Tag>
                    </div>
                    <Text type="secondary" style={{ fontSize: 11, fontFamily: "'Sarabun',sans-serif", display: 'block', marginBottom: 6 }}>
                      {format(new Date(ev.startDate), 'd MMM', { locale: th })}
                      {ev.startDate !== ev.endDate && ` – ${format(new Date(ev.endDate), 'd MMM', { locale: th })}`}
                      {' · '}{ev.tasks.length} งาน
                    </Text>
                    {uniqueAssignees.length > 0 && (
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                        <User size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{uniqueAssignees.slice(0, 2).join(', ')}{uniqueAssignees.length > 2 && ` +${uniqueAssignees.length - 2}`}
                      </Text>
                    )}
                    {uniquePatients.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                        {uniquePatients.map((hn) => (
                          <Tag key={hn} color="blue" style={{ fontSize: 10, fontFamily: "'Sarabun',sans-serif" }}>HN {hn}</Tag>
                        ))}
                      </div>
                    )}
                    {ev.note && (
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6, fontStyle: 'italic' }}>{ev.note}</Text>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  format, getDay, addMonths, subMonths,
} from 'date-fns';
import { th } from 'date-fns/locale';
import { Button, Card, Drawer, Form, Input, Select, DatePicker, Tag, Typography, Popconfirm, message } from 'antd';
import { useIsMobile } from '@/hooks/useIsMobile';
import { LeftOutlined, RightOutlined, EditOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
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

const PRIORITY_BG: Record<Priority, string> = { CRITICAL: '#ff4d4f', URGENT: '#fa8c16', NORMAL: '#1677ff' };
const PRIORITY_LIGHT: Record<Priority, string> = { CRITICAL: '#fff1f0', URGENT: '#fff7e6', NORMAL: '#e6f4ff' };
const PRIORITY_TEXT: Record<Priority, string> = { CRITICAL: '#cf1322', URGENT: '#d46b08', NORMAL: '#0958d9' };

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getEventBarsForWeek(weekDays: (Date | null)[], events: CalendarEvent[]) {
  type Bar = { ev: CalendarEvent; startCol: number; span: number; startsHere: boolean; endsHere: boolean };
  const bars: Bar[] = [];
  for (const ev of events) {
    const evStartStr = toDateStr(new Date(ev.startDate));
    const evEndStr   = toDateStr(new Date(ev.endDate));
    let firstCol = -1, lastCol = -1;
    for (let i = 0; i < 7; i++) {
      const d = weekDays[i];
      if (!d) continue;
      const ds = toDateStr(d);
      if (ds >= evStartStr && ds <= evEndStr) {
        if (firstCol === -1) firstCol = i;
        lastCol = i;
      }
    }
    if (firstCol === -1) continue;
    const weekFirstStr = toDateStr(weekDays[firstCol]!);
    const weekLastStr  = toDateStr(weekDays[lastCol]!);
    bars.push({ ev, startCol: firstCol + 1, span: lastCol - firstCol + 1, startsHere: weekFirstStr === evStartStr, endsHere: weekLastStr === evEndStr });
  }
  return bars;
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
          { value: 'NORMAL',   label: 'ปกติ' },
          { value: 'URGENT',   label: 'เร่งด่วน' },
          { value: 'CRITICAL', label: 'วิกฤต' },
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
        <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />} block>บันทึก Event</Button>
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
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editForm] = Form.useForm();

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
      fetch(`${API_URL}/users/my-fw`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${API_URL}/forms`, { headers }).then((r) => r.ok ? r.json() : []),
      fetch(`${API_URL}/patients`, { headers }).then((r) => r.ok ? r.json() : []),
    ]).then(([fw, f, p]) => {
      // decode sub จาก JWT เพื่อ prepend ตัว CM เอง (CM ทำงานเหมือน FW ได้)
      let cmId = '';
      try { cmId = JSON.parse(atob(session!.accessToken!.split('.')[1])).sub; } catch { /* noop */ }
      const cmSelf = cmId
        ? [{ id: cmId, displayName: `${(session as any).displayName ?? session?.user?.name ?? 'ฉัน'} (ฉัน)` }]
        : [];
      setUsers([...cmSelf, ...(Array.isArray(fw) ? fw : [])]);
      setFormTemplates(Array.isArray(f) ? f : []);
      setAllPatients(Array.isArray(p) ? p : []);
    }).catch(() => {});
  }, [session?.accessToken]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd   = endOfMonth(currentMonth);
  const daysInMonth  = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  function openEdit(ev: CalendarEvent) {
    setEditingEvent(ev);
    editForm.setFieldsValue({
      title: ev.title,
      dateRange: [dayjs(ev.startDate), dayjs(ev.endDate)],
      priority: ev.priority,
      note: ev.note ?? '',
    });
  }

  async function handleUpdateEvent(values: any) {
    if (!editingEvent) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/events/${editingEvent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.accessToken}` },
        body: JSON.stringify({
          title: values.title,
          startDate: values.dateRange[0].toISOString(),
          endDate: values.dateRange[1].toISOString(),
          priority: values.priority,
          note: values.note || null,
        }),
      });
      if (res.ok) {
        message.success('แก้ไข Event แล้ว');
        setEditingEvent(null);
        editForm.resetFields();
        setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth(), 1));
      } else {
        const errBody = await res.json().catch(() => ({}));
        message.error(`แก้ไขไม่สำเร็จ: ${errBody?.message ?? `HTTP ${res.status}`}`);
      }
    } catch (e: any) {
      message.error(`เกิดข้อผิดพลาด: ${e?.message ?? 'unknown'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEvent(eventId: string) {
    try {
      const res = await fetch(`${API_URL}/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.accessToken}` },
      });
      if (res.ok) {
        message.success('ลบ Event แล้ว');
        setSelectedDate(null);
        setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth(), 1));
      } else {
        message.error('ลบไม่สำเร็จ');
      }
    } catch {
      message.error('เกิดข้อผิดพลาด');
    }
  }

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
          formIds: values.formTemplateId ? [values.formTemplateId] : undefined,
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
        const errBody = await res.json().catch(() => ({}));
        const errMsg = errBody?.message ?? `HTTP ${res.status}`;
        message.error(`บันทึกไม่สำเร็จ: ${Array.isArray(errMsg) ? errMsg.join(', ') : errMsg}`);
      }
    } catch (e: any) {
      message.error(`เกิดข้อผิดพลาด: ${e?.message ?? 'unknown'}`);
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

        {/* Week rows */}
        {(() => {
          const allCells: (Date | null)[] = [...Array(startPadding).fill(null), ...daysInMonth];
          while (allCells.length % 7 !== 0) allCells.push(null);
          const weeks: (Date | null)[][] = [];
          for (let i = 0; i < allCells.length; i += 7) weeks.push(allCells.slice(i, i + 7));

          return weeks.map((weekDays, wi) => {
            const bars = getEventBarsForWeek(weekDays, events);
            return (
              <div key={wi} style={{ borderBottom: '1px solid #f0f0f0' }}>
                {/* Day number row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                  {weekDays.map((day, di) => {
                    if (!day) return <div key={`e-${di}`} style={{ minHeight: isMobile ? 28 : 32, borderRight: '1px solid #fafafa' }} />;
                    const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                    const isToday = isSameDay(day, new Date());
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate((prev) => prev && isSameDay(prev, day) ? null : day)}
                        style={{
                          minHeight: isMobile ? 28 : 32,
                          borderRight: '1px solid #f5f5f5',
                          padding: isMobile ? '4px 4px 2px' : '6px 8px 2px',
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
                          width: 22, height: 22, borderRadius: '50%',
                          fontFamily: "'Sarabun',sans-serif", fontSize: 11, fontWeight: 500,
                          background: isToday ? '#1677ff' : 'transparent',
                          color: isToday ? '#fff' : '#555',
                        }}>
                          {format(day, 'd')}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Event bars row */}
                {bars.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '2px 0 4px', rowGap: 2 }}>
                    {bars.map(({ ev, startCol, span, startsHere, endsHere }) => (
                      <div
                        key={ev.id}
                        title={ev.title}
                        onClick={() => setSelectedDate(new Date(ev.startDate))}
                        style={{
                          gridColumn: `${startCol} / ${startCol + span}`,
                          background: PRIORITY_LIGHT[ev.priority],
                          color: PRIORITY_TEXT[ev.priority],
                          borderLeft: startsHere ? `3px solid ${PRIORITY_BG[ev.priority]}` : '3px solid transparent',
                          borderRadius: `${startsHere ? 4 : 0}px ${endsHere ? 4 : 0}px ${endsHere ? 4 : 0}px ${startsHere ? 4 : 0}px`,
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 6px',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          marginLeft: startsHere ? 2 : 0,
                          marginRight: endsHere ? 2 : 0,
                          fontFamily: "'Sarabun',sans-serif",
                        }}
                      >
                        {startsHere ? ev.title : ''}
                      </div>
                    ))}
                  </div>
                )}
                {bars.length === 0 && <div style={{ height: isMobile ? 8 : 12 }} />}
              </div>
            );
          });
        })()}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <Tag color={PRIORITY_TAG_COLOR[ev.priority]} style={{ fontSize: 10, margin: 0 }}>
                          {PRIORITY_LABEL[ev.priority]}
                        </Tag>
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(ev)} />
                        <Popconfirm
                          title="ลบ Event นี้และงานทั้งหมด?"
                          onConfirm={() => handleDeleteEvent(ev.id)}
                          okText="ลบ" cancelText="ยกเลิก" okButtonProps={{ danger: true }}
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </div>
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

      {/* Edit Event Drawer */}
      <Drawer
        title={<span style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 12 }}>แก้ไข Event</span>}
        placement="right"
        width={isMobile ? '100%' : 400}
        open={!!editingEvent}
        onClose={() => { setEditingEvent(null); editForm.resetFields(); }}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdateEvent}>
          <Form.Item name="title" label="ชื่อ Event" rules={[{ required: true }]}>
            <Input placeholder="เช่น Follow-up รายสัปดาห์" />
          </Form.Item>
          <Form.Item name="dateRange" label="วันเริ่ม – สิ้นสุด" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item name="priority" label="ความเร่งด่วน">
            <Select options={[
              { value: 'NORMAL', label: '📅 ปกติ' },
              { value: 'URGENT', label: '⚠️ เร่งด่วน' },
              { value: 'CRITICAL', label: '🚨 วิกฤต' },
            ]} />
          </Form.Item>
          <Form.Item name="note" label="หมายเหตุ">
            <Input.TextArea rows={3} placeholder="คำแนะนำพิเศษถึงผู้ช่วย CM..." />
          </Form.Item>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />} block>บันทึก</Button>
            <Button onClick={() => { setEditingEvent(null); editForm.resetFields(); }}>ยกเลิก</Button>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}

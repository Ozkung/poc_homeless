'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  format, getDay, addMonths, subMonths,
} from 'date-fns';
import { th } from 'date-fns/locale';
import { Button, Card, Drawer, Tag, Typography, message } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { User } from 'lucide-react';

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

export default function EventsPage() {
  const { data: session } = useSession();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

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

  const monthStart = startOfMonth(currentMonth);
  const monthEnd   = endOfMonth(currentMonth);
  const daysInMonth  = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);

  function goPrev() { setCurrentMonth((m) => subMonths(m, 1)); setSelectedDate(null); }
  function goNext() { setCurrentMonth((m) => addMonths(m, 1)); setSelectedDate(null); }

  const selectedDayEvents = selectedDate ? eventsForDate(events, selectedDate) : [];
  const monthTitle = format(currentMonth, 'MMMM yyyy', { locale: th });

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
        {loading && (
          <Text type="secondary" style={{ fontSize: 11, fontFamily: "'Sarabun',sans-serif" }}>
            กำลังโหลด...
          </Text>
        )}
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
              padding: '8px 0', textAlign: 'center',
              fontFamily: "'Sarabun',sans-serif", fontSize: 11, color: '#aaa',
              textTransform: 'uppercase', letterSpacing: 1,
            }}>
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`pad-${i}`} style={{ minHeight: 80, borderBottom: '1px solid #fafafa', borderRight: '1px solid #fafafa' }} />
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
                  minHeight: 80,
                  borderBottom: '1px solid #f5f5f5',
                  borderRight: '1px solid #f5f5f5',
                  padding: 8,
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

      {/* Event detail drawer */}
      <Drawer
        title={
          selectedDate
            ? <span style={{ fontFamily: "'Sarabun',sans-serif", fontSize: 12 }}>
                {format(selectedDate, 'd MMMM yyyy', { locale: th })}
              </span>
            : 'กิจกรรม'
        }
        placement="right"
        width={400}
        open={selectedDate !== null}
        onClose={() => setSelectedDate(null)}
        extra={
          <Button type="primary" size="small" onClick={() => message.info('ฟีเจอร์นี้กำลังพัฒนา')}>
            + เพิ่มกิจกรรม
          </Button>
        }
      >
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
      </Drawer>
    </div>
  );
}

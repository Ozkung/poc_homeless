'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  format,
  getDay,
  addMonths,
  subMonths,
} from 'date-fns';
import { th } from 'date-fns/locale';
import { Drawer, Card, Tag, Button, Typography } from 'antd';
const { Text } = Typography;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = 'CRITICAL' | 'URGENT' | 'NORMAL';

interface TaskItem {
  id: string;
  assignee: { displayName: string };
  patient: { hn: string };
}

interface CalendarEvent {
  id: string;
  title: string;
  startDate: string; // ISO string
  endDate: string;   // ISO string
  priority: Priority;
  note?: string;
  tasks: TaskItem[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const THAI_DAY_NAMES = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const PRIORITY_DOT: Record<Priority, string> = {
  CRITICAL: 'bg-danger',
  URGENT: 'bg-warning',
  NORMAL: 'bg-primary',
};

const PRIORITY_BADGE: Record<Priority, string> = {
  CRITICAL: 'bg-danger/10 text-danger border border-danger/30',
  URGENT: 'bg-amber-50 text-warning border border-amber-200',
  NORMAL: 'bg-primary/10 text-primary border border-primary/30',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  CRITICAL: 'วิกฤต',
  URGENT: 'เร่งด่วน',
  NORMAL: 'ปกติ',
};

const PRIORITY_COLOR: Record<Priority, string> = {
  CRITICAL: 'error',
  URGENT: 'warning',
  NORMAL: 'processing',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Events that span a given calendar date */
function eventsForDate(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return events.filter((ev) => {
    const start = new Date(ev.startDate);
    const end = new Date(ev.endDate);
    // Normalise to date-only comparison (midnight)
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    return d >= s && d <= e;
  });
}

/** Deduplicated short list of priority dots for a day cell */
function priorityDotsForDay(events: CalendarEvent[]): Priority[] {
  const seen = new Set<Priority>();
  const result: Priority[] = [];
  for (const ev of events) {
    if (!seen.has(ev.priority)) {
      seen.add(ev.priority);
      result.push(ev.priority);
    }
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const { data: session } = useSession();
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // ── Fetch events whenever month/year changes ──────────────────────────────
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
        if (!res.ok) {
          setEvents([]);
          return;
        }
        const data: CalendarEvent[] = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setEvents([]);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
    return () => controller.abort();
  }, [currentMonth, session?.accessToken]);

  // ── Calendar grid calculation ─────────────────────────────────────────────
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Sunday = 0 in getDay(); our grid starts on Sunday (index 0 in THAI_DAY_NAMES)
  const startPadding = getDay(monthStart); // 0–6 empty leading cells

  // ── Navigation ───────────────────────────────────────────────────────────
  function goPrev() {
    setCurrentMonth((m) => subMonths(m, 1));
    setSelectedDate(null);
  }
  function goNext() {
    setCurrentMonth((m) => addMonths(m, 1));
    setSelectedDate(null);
  }

  // ── Selected day events ───────────────────────────────────────────────────
  const selectedDayEvents = selectedDate ? eventsForDate(events, selectedDate) : [];

  // ── Formatted month title (Thai locale) ──────────────────────────────────
  const monthTitle = format(currentMonth, 'MMMM yyyy', { locale: th });

  return (
    <div>
      {/* ── Left: Calendar ─────────────────────────────────────────────────── */}
      <div>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
              Planning
            </div>
            <h1 style={{ margin: 0, fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: -1 }}>แผนการเยี่ยม</h1>
          </div>
          {loading && <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: '#aaa' }}>กำลังโหลด...</span>}
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
            aria-label="เดือนก่อน"
          >
            ←
          </button>
          <span className="font-display font-semibold text-gray-900 min-w-[140px] text-center capitalize">
            {monthTitle}
          </span>
          <button
            onClick={goNext}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
            aria-label="เดือนถัดไป"
          >
            →
          </button>
        </div>

        {/* Calendar grid */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex-1">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {THAI_DAY_NAMES.map((day) => (
              <div
                key={day}
                className="py-2 text-center text-xs font-mono font-medium text-gray-400 uppercase tracking-wider"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 auto-rows-fr">
            {/* Leading empty cells */}
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="border-b border-r border-gray-50 min-h-[80px]" />
            ))}

            {/* Actual days */}
            {daysInMonth.map((day) => {
              const dayEvents = eventsForDate(events, day);
              const dots = priorityDotsForDay(dayEvents);
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
              const isToday = isSameDay(day, new Date());

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => {
                    setSelectedDate((prev) =>
                      prev && isSameDay(prev, day) ? null : day,
                    );
                    setExpandedEventId(null);
                  }}
                  className={[
                    'min-h-[80px] border-b border-r border-gray-100 p-2 text-left',
                    'transition-colors hover:bg-gray-50 focus:outline-none',
                    isSelected
                      ? 'ring-2 ring-inset ring-primary bg-primary/5'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {/* Day number */}
                  <span
                    className={[
                      'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono font-medium mb-1',
                      isToday
                        ? 'bg-primary text-white'
                        : 'text-gray-700',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {format(day, 'd')}
                  </span>

                  {/* Event count label (when many) */}
                  {dayEvents.length > 0 && (
                    <p className="text-[10px] font-mono text-gray-400 mb-1">
                      {dayEvents.length} กิจกรรม
                    </p>
                  )}

                  {/* Priority dots */}
                  {dots.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {dots.map((priority) => (
                        <span
                          key={priority}
                          className={`inline-block w-2 h-2 rounded-full ${PRIORITY_DOT[priority]}`}
                          title={PRIORITY_LABEL[priority]}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Drawer
        title={
          selectedDate
            ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
                {format(selectedDate, 'd MMMM yyyy', { locale: th })}
              </span>
            : 'กิจกรรม'
        }
        placement="right"
        width={400}
        open={selectedDate !== null}
        onClose={() => { setSelectedDate(null); setExpandedEventId(null); }}
        extra={<Button type="primary" size="small">+ เพิ่มกิจกรรม</Button>}
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
              <Card
                key={ev.id}
                size="small"
                style={{
                  borderLeft: `3px solid ${
                    ev.priority === 'CRITICAL' ? '#ff4d4f'
                    : ev.priority === 'URGENT' ? '#faad14'
                    : '#1677ff'
                  }`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <Text style={{ fontWeight: 600, fontSize: 13 }}>{ev.title}</Text>
                  <Tag color={PRIORITY_COLOR[ev.priority]} style={{ fontSize: 10, flexShrink: 0 }}>
                    {PRIORITY_LABEL[ev.priority]}
                  </Tag>
                </div>
                <Text type="secondary" style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", display: 'block', marginBottom: 6 }}>
                  {format(new Date(ev.startDate), 'd MMM', { locale: th })}
                  {ev.startDate !== ev.endDate && ` – ${format(new Date(ev.endDate), 'd MMM', { locale: th })}`}
                  {' · '}{ev.tasks.length} งาน
                </Text>
                {uniqueAssignees.length > 0 && (
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                    👤 {uniqueAssignees.slice(0, 2).join(', ')}{uniqueAssignees.length > 2 && ` +${uniqueAssignees.length - 2}`}
                  </Text>
                )}
                {uniquePatients.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {uniquePatients.map((hn) => (
                      <Tag key={hn} color="blue" style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace" }}>HN {hn}</Tag>
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

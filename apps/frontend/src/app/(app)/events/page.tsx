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
    <div className="flex gap-4 h-full min-h-0">
      {/* ── Left: Calendar ─────────────────────────────────────────────────── */}
      <div className="flex-[2] flex flex-col min-w-0">
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-mono text-primary tracking-widest uppercase mb-0.5">
              Planning
            </p>
            <h1 className="font-display text-2xl font-bold text-gray-900">แผนการเยี่ยม</h1>
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <span className="text-xs font-mono text-gray-400 animate-pulse">กำลังโหลด...</span>
            )}
          </div>
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

      {/* ── Right: Side panel ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Panel header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-mono text-gray-400 tracking-widest uppercase mb-0.5">
              Detail
            </p>
            <h2 className="font-display text-lg font-bold text-gray-900">
              {selectedDate
                ? format(selectedDate, 'd MMM yyyy', { locale: th })
                : 'กิจกรรม'}
            </h2>
          </div>
          <button
            className="bg-primary hover:bg-primary/80 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            onClick={() => {
              /* TODO: navigate to /events/new with date prefilled */
            }}
          >
            + เพิ่มกิจกรรม
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto">
          {!selectedDate ? (
            /* No date selected */
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400 h-full flex flex-col items-center justify-center">
              <p className="text-3xl mb-3">📅</p>
              <p className="font-mono text-sm">เลือกวันเพื่อดูกิจกรรม</p>
            </div>
          ) : loading ? (
            /* Loading skeleton */
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-white border border-gray-100 rounded-xl p-4 animate-pulse"
                >
                  <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : selectedDayEvents.length === 0 ? (
            /* Empty day */
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
              <p className="text-3xl mb-3">✅</p>
              <p className="font-mono text-sm">ไม่มีกิจกรรม</p>
              <p className="text-xs mt-1">
                {format(selectedDate, 'd MMM yyyy', { locale: th })}
              </p>
            </div>
          ) : (
            /* Event list */
            <div className="space-y-3">
              <p className="text-xs font-mono text-gray-400 mb-1">
                {selectedDate
                  ? `${format(selectedDate, 'd MMMM yyyy', { locale: th })} — กิจกรรม`
                  : ''}
              </p>
              {selectedDayEvents.map((ev) => {
                const isExpanded = expandedEventId === ev.id;
                const uniqueAssignees = ev.tasks
                  .map((t) => t.assignee.displayName)
                  .filter((v, i, a) => a.indexOf(v) === i);
                const uniquePatients = ev.tasks
                  .map((t) => t.patient.hn)
                  .filter((v, i, a) => a.indexOf(v) === i);

                return (
                  <div
                    key={ev.id}
                    className={[
                      'bg-white border rounded-xl overflow-hidden transition-shadow',
                      isExpanded
                        ? 'border-primary/30 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300',
                    ].join(' ')}
                  >
                    {/* Card header — always visible */}
                    <button
                      className="w-full text-left p-4"
                      onClick={() =>
                        setExpandedEventId((prev) =>
                          prev === ev.id ? null : ev.id,
                        )
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">
                            {ev.title}
                          </p>
                          <p className="text-xs font-mono text-gray-400 mt-0.5">
                            {format(new Date(ev.startDate), 'd MMM', { locale: th })}
                            {ev.startDate !== ev.endDate &&
                              ` – ${format(new Date(ev.endDate), 'd MMM', { locale: th })}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${PRIORITY_BADGE[ev.priority]}`}
                          >
                            {PRIORITY_LABEL[ev.priority]}
                          </span>
                          <span className="text-gray-300 text-xs">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>

                      {/* Summary row */}
                      <div className="flex gap-3 mt-2">
                        <span className="text-[10px] font-mono text-gray-400">
                          {ev.tasks.length} งาน
                        </span>
                        {uniqueAssignees.length > 0 && (
                          <span className="text-[10px] font-mono text-gray-400 truncate">
                            👤 {uniqueAssignees.slice(0, 2).join(', ')}
                            {uniqueAssignees.length > 2 && ` +${uniqueAssignees.length - 2}`}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3">
                        {/* Note */}
                        {ev.note && (
                          <div>
                            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">
                              หมายเหตุ
                            </p>
                            <p className="text-xs text-gray-700 leading-relaxed">{ev.note}</p>
                          </div>
                        )}

                        {/* Assignees */}
                        {uniqueAssignees.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">
                              ผู้รับผิดชอบ
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {uniqueAssignees.map((name) => (
                                <span
                                  key={name}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-600 font-mono"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Patients */}
                        {uniquePatients.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">
                              ผู้ป่วย (HN)
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {uniquePatients.map((hn) => (
                                <span
                                  key={hn}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary font-mono border border-primary/20"
                                >
                                  {hn}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Task list */}
                        {ev.tasks.length > 0 && (
                          <div>
                            <p className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">
                              รายการงาน ({ev.tasks.length})
                            </p>
                            <div className="space-y-1">
                              {ev.tasks.map((task) => (
                                <div
                                  key={task.id}
                                  className="flex items-center justify-between text-[10px] font-mono bg-gray-50 rounded-lg px-2 py-1.5"
                                >
                                  <span className="text-gray-600">
                                    👤 {task.assignee.displayName}
                                  </span>
                                  <span className="text-primary">HN {task.patient.hn}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

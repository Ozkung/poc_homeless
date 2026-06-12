export const dynamic = 'force-dynamic';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import { Card, Progress, Statistic, Tag } from 'antd';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

interface MonthlyReport {
  followUpRate:    number;
  medicationRate:  number;
  completionRate:  number;
  totalTasks:      number;
  completedTasks:  number;
  patients: {
    id: string; hn: string; status: string;
    conditions: string[];
    followUpDone: number; followUpTotal: number;
  }[];
}

const STATUS_COLOR: Record<string, string> = { CRITICAL: 'error', PENDING: 'warning', STABLE: 'success', MISSING: 'default' };
const STATUS_LABEL: Record<string, string> = { CRITICAL: 'Emergency', PENDING: 'Urgency', STABLE: 'Semi-urgency', MISSING: 'Missing' };

async function fetchReport(token: string): Promise<MonthlyReport | null> {
  const now = new Date();
  try {
    const res = await fetch(
      `${API_URL}/reports/monthly?month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' },
    );
    return res.ok ? res.json() : null;
  } catch { return null; }
}

function kpiColor(rate: number, target: number): string {
  if (rate >= target) return '#52c41a';
  if (rate >= target - 10) return '#faad14';
  return '#ff4d4f';
}

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  const token   = (session as any)?.accessToken ?? '';
  const report  = await fetchReport(token);

  const kpis = [
    { label: 'Follow-up Rate',       value: report?.followUpRate ?? 0,    target: 80 },
    { label: 'อัตรารับยาต่อเนื่อง', value: report?.medicationRate ?? 0,  target: 75 },
    { label: 'งาน Assigned เสร็จ',  value: report?.completionRate ?? 0,  target: 0  },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Analytics
        </div>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -1, color: '#111' }}>
          รายงานและสถิติ
        </h2>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
          {new Date().toLocaleString('th-TH', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label} styles={{ body: { padding: 24 } }}>
            <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              {kpi.label}
            </div>
            <Statistic
              value={kpi.value}
              suffix="%"
              valueStyle={{ fontSize: 40, fontWeight: 700, color: kpiColor(kpi.value, kpi.target) }}
            />
            <Progress
              percent={kpi.value}
              strokeColor={kpiColor(kpi.value, kpi.target)}
              showInfo={false}
              style={{ marginTop: 8 }}
            />
            {kpi.target > 0 && (
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                เป้าหมาย {kpi.target}%
                {kpi.value >= kpi.target
                  ? <span style={{ color: '#52c41a', marginLeft: 6 }}>ผ่านเป้า</span>
                  : <span style={{ color: '#ff4d4f', marginLeft: 6 }}>ต่ำกว่าเป้า {kpi.target - kpi.value}%</span>
                }
              </div>
            )}
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
              {report?.completedTasks ?? 0}/{report?.totalTasks ?? 0} งาน
            </div>
          </Card>
        ))}
      </div>

      {/* Per-patient table */}
      <Card styles={{ body: { padding: 0 } }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 13 }}>
          ผลรวมรายบุคคล — {new Date().toLocaleString('th-TH', { month: 'long', year: 'numeric' })}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['ผู้ป่วย (HN)', 'โรคประจำตัว', 'Follow-up', 'สถานะ'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11,
                    fontWeight: 600, color: '#aaa', textTransform: 'uppercase',
                    borderBottom: '1px solid #f0f0f0' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(report?.patients ?? []).filter(p => p.followUpTotal > 0).map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #fafafa' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'monospace', color: '#555' }}>
                    {p.hn}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.conditions.slice(0, 2).map((c) => (
                        <Tag key={c} style={{ fontSize: 10 }}>{c}</Tag>
                      ))}
                      {p.conditions.length === 0 && <span style={{ color: '#d9d9d9', fontSize: 12 }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color: p.followUpDone === p.followUpTotal ? '#52c41a' : '#faad14' }}>
                      {p.followUpDone}
                    </span>
                    <span style={{ color: '#aaa' }}>/{p.followUpTotal} ครั้ง</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Tag color={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status] ?? p.status}</Tag>
                  </td>
                </tr>
              ))}
              {(!report || report.patients.filter(p => p.followUpTotal > 0).length === 0) && (
                <tr>
                  <td colSpan={4} style={{ padding: '32px 0', textAlign: 'center', color: '#bbb', fontSize: 12 }}>
                    ไม่มีข้อมูลในเดือนนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Progress, Modal, InputNumber, Button } from 'antd';
import { Settings2 } from 'lucide-react';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/patientStatus';
import { DatePicker } from 'antd';
import { useSession } from 'next-auth/react';
import dynamic from 'next/dynamic';
import dayjs, { Dayjs } from 'dayjs';

const KPI_KEY = 'cm_kpi_targets';
const DEFAULT_TARGETS = { followUp: 80, medication: 75, completion: 70 };

const { RangePicker } = DatePicker;

const TaskStreamgraph = dynamic(
  () => import('@/components/charts/TaskStreamgraph'),
  { ssr: false, loading: () => <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 12 }}>กำลังโหลดกราฟ...</div> },
);

interface CMStats {
  myPatientsCount: number;
  myFWCount: number;
  taskSuccessRate: number;
  statusImproved: number;
  zoneCards: { zoneId: string; zoneName: string; count: number }[];
  recentActions: { createdAt: string; type: string; actor: { displayName: string }; patient: { hn: string } | null }[];
  monthlyTaskStatus: { months: string[]; series: { name: string; data: number[] }[] };
}

export default function CMDashboard() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [stats, setStats] = useState<CMStats | null>(null);
  const [report, setReport] = useState<any>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [kpiModal, setKpiModal] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_TARGETS);
  const [editingPt, setEditingPt] = useState<{ id: string; hn: string } | null>(null);
  const [ptDraft, setPtDraft] = useState<number>(4);

  useEffect(() => {
    if (!token) return;
    const [from, to] = dateRange;
    fetch(`/api/dashboard/cm?from=${from.toISOString()}&to=${to.toISOString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()).then(setStats);
    const now = new Date();
    fetch(`/api/reports/monthly?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.ok ? r.json() : null).then(setReport);
    fetch('/api/dashboard/kpi', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setTargets({ followUp: d.followUp ?? 80, medication: d.medication ?? 75, completion: d.completion ?? 70 }); });
  }, [token, dateRange]);

  const saveKpi = async (t: typeof DEFAULT_TARGETS) => {
    await fetch('/api/dashboard/kpi', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(t),
    });
    setTargets(t);
  };

  const savePatientTarget = async (patientId: string, target: number) => {
    await fetch(`/api/patients/${patientId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ followUpTarget: target }),
    });
    setReport((r: any) => r ? {
      ...r,
      patients: r.patients.map((p: any) => p.id === patientId ? { ...p, followUpTarget: target } : p),
    } : r);
    setEditingPt(null);
  };

  const activityTypeColor: Record<string, string> = {
    FORM_SUBMIT: 'blue', CHECK_IN: 'green', SOS: 'red', STATUS_CHANGE: 'orange', NOTE: 'default',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Dashboard ของฉัน</h1>
        <RangePicker
          value={dateRange}
          onChange={(v) => v && setDateRange(v as [Dayjs, Dayjs])}
          format="DD MMM YYYY"
        />
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="ผู้ป่วยในมือ" value={stats?.myPatientsCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="CARE_GIVER" value={stats?.myFWCount ?? '-'} suffix="คน" /></Card></Col>
        <Col span={6}><Card><Statistic title="Task Success" value={stats ? `${stats.taskSuccessRate}%` : '-'} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Status Improved" value={stats?.statusImproved ?? '-'} suffix="คน" valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="ผู้ป่วยแยกตาม Zone">
            {(stats?.zoneCards ?? []).map((z) => (
              <div key={z.zoneId} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontWeight: 600 }}>{z.zoneName}</span>
                <span>{z.count} คน</span>
              </div>
            ))}
            {!stats?.zoneCards?.length && <div style={{ color: '#999', padding: '16px 0' }}>ยังไม่มีผู้ป่วยใน Zone</div>}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Task Status" styles={{ body: { paddingBottom: 8 } }}>
            {stats?.monthlyTaskStatus ? (
              <TaskStreamgraph
                months={stats.monthlyTaskStatus.months}
                series={stats.monthlyTaskStatus.series}
              />
            ) : (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                กำลังโหลด...
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* KPI Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>KPI ประจำเดือน</span>
        <Button size="small" icon={<Settings2 size={13} />} onClick={() => { setDraft({ ...targets }); setKpiModal(true); }}>
          ตั้งเป้าหมาย
        </Button>
      </div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {[
          { label: 'Follow-up Rate',       value: report?.followUpRate ?? 0,    target: targets.followUp,   key: 'followUp' },
          { label: 'อัตรารับยาต่อเนื่อง', value: report?.medicationRate ?? 0,  target: targets.medication, key: 'medication' },
          { label: 'งาน Assigned เสร็จ',  value: report?.completionRate ?? 0,  target: targets.completion, key: 'completion' },
        ].map((kpi) => {
          const color = kpi.value >= kpi.target ? '#52c41a' : kpi.value >= kpi.target - 10 ? '#faad14' : '#ff4d4f';
          return (
          <Col span={8} key={kpi.label}>
            <Card styles={{ body: { padding: 20 } }}>
              <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{kpi.label}</div>
              <Statistic value={kpi.value} suffix="%" valueStyle={{ fontSize: 32, fontWeight: 700, color }} />
              <Progress percent={kpi.value} strokeColor={color} showInfo={false} style={{ marginTop: 6 }} />
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                เป้าหมาย <strong style={{ color: '#555' }}>{kpi.target}%</strong>
                {kpi.value >= kpi.target
                  ? <span style={{ color: '#52c41a', marginLeft: 6 }}>✓ ผ่านเป้า</span>
                  : <span style={{ color: '#ff4d4f', marginLeft: 6 }}>ต่ำกว่าเป้า {kpi.target - kpi.value}%</span>
                }
              </div>
            </Card>
          </Col>
          );
        })}
      </Row>

      <Card styles={{ body: { padding: 0 } }} style={{ marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 13 }}>
          ผลรวมรายบุคคล — {new Date().toLocaleString('th-TH', { month: 'long', year: 'numeric' })}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['ผู้ป่วย (HN)', 'โรคประจำตัว', 'Follow-up / เป้า', 'สถานะ', ''].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', borderBottom: '1px solid #f0f0f0' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {(report?.patients ?? []).map((p: any) => {
                const ptTarget = p.followUpTarget ?? null;
                const done = p.followUpDone;
                const hit = ptTarget ? done >= ptTarget : p.followUpDone === p.followUpTotal;
                const color = hit ? '#52c41a' : '#faad14';
                return (
                <tr key={p.id} style={{ borderBottom: '1px solid #fafafa' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontFamily: 'monospace', color: '#555' }}>{p.hn}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.conditions.slice(0, 2).map((c: string) => <Tag key={c} style={{ fontSize: 10 }}>{c}</Tag>)}
                      {p.conditions.length === 0 && <span style={{ color: '#d9d9d9', fontSize: 12 }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13 }}>
                    <span style={{ fontWeight: 700, color }}>{done}</span>
                    <span style={{ color: '#aaa' }}>/{ptTarget ?? p.followUpTotal} ครั้ง</span>
                    {ptTarget && <span style={{ fontSize: 10, marginLeft: 6, color: hit ? '#52c41a' : '#ff4d4f' }}>{hit ? '✓' : `ขาด ${ptTarget - done}`}</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Tag color={STATUS_COLOR[p.status]}>{STATUS_LABEL[p.status] ?? p.status}</Tag>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Button size="small" type="text" icon={<Settings2 size={12} />}
                      onClick={() => { setEditingPt({ id: p.id, hn: p.hn }); setPtDraft(p.followUpTarget ?? p.followUpTotal ?? 4); }}>
                      เป้าหมาย
                    </Button>
                  </td>
                </tr>
                );
              })}
              {(!report || report.patients.length === 0) && (
                <tr><td colSpan={5} style={{ padding: '32px 0', textAlign: 'center', color: '#bbb', fontSize: 12 }}>ไม่มีข้อมูลในเดือนนี้</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Recent Actions — ทีมของฉัน">
        <Table
          dataSource={stats?.recentActions ?? []}
          rowKey={(_, i) => String(i)}
          size="small"
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'เวลา', dataIndex: 'createdAt', render: (v) => new Date(v).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) },
            { title: 'FW', render: (_, r) => r.actor.displayName },
            { title: 'HN', render: (_, r) => r.patient?.hn ?? '-' },
            { title: 'Action', dataIndex: 'type', render: (t) => <Tag color={activityTypeColor[t] ?? 'default'}>{t}</Tag> },
          ]}
        />
      </Card>

      <Modal
        title={`ตั้งเป้า Follow-up — ${editingPt?.hn}`}
        open={!!editingPt}
        onOk={() => editingPt && savePatientTarget(editingPt.id, ptDraft)}
        onCancel={() => setEditingPt(null)}
        okText="บันทึก"
      >
        <div style={{ padding: '12px 0' }}>
          <div style={{ marginBottom: 8, fontSize: 13 }}>จำนวน Follow-up เป้าหมายต่อเดือน</div>
          <InputNumber min={1} max={30} value={ptDraft} onChange={(v) => setPtDraft(v ?? 1)} addonAfter="ครั้ง" style={{ width: 140 }} />
        </div>
      </Modal>

      <Modal
        title="ตั้งเป้าหมาย KPI"
        open={kpiModal}
        onOk={() => { saveKpi(draft); setKpiModal(false); }}
        onCancel={() => setKpiModal(false)}
        okText="บันทึก"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
          {[
            { label: 'Follow-up Rate (%)', key: 'followUp' as const },
            { label: 'อัตรารับยาต่อเนื่อง (%)', key: 'medication' as const },
            { label: 'งาน Assigned เสร็จ (%)', key: 'completion' as const },
          ].map(({ label, key }) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>{label}</span>
              <InputNumber
                min={0} max={100} value={draft[key]}
                onChange={(v) => setDraft((d) => ({ ...d, [key]: v ?? 0 }))}
                style={{ width: 90 }}
                addonAfter="%"
              />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

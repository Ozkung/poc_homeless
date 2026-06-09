'use client';
import { useEffect, useState } from 'react';
import { Tabs, DatePicker, Card, Row, Col, Statistic, Table, Tag, Select, Button, Modal, message } from 'antd';
import { useSession } from 'next-auth/react';
import dayjs, { Dayjs } from 'dayjs';

const { RangePicker } = DatePicker;

interface AdminStats {
  patients: { total: number; critical: number; pending: number; stable: number };
  taskSuccessRate: number;
  activeCM: number;
  activeFW: number;
  zoneBreakdown: { name: string; count: number }[];
}

export default function AdminDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);
  const [users, setUsers] = useState<any[]>([]);
  const [invItems, setInvItems] = useState<any[]>([]);
  const [transferModal, setTransferModal] = useState(false);
  const [selectedFW, setSelectedFW] = useState<string>('');
  const [targetCM, setTargetCM] = useState<string>('');

  const token = (session as any)?.accessToken;

  const loadStats = () => {
    if (!token) return;
    const [from, to] = dateRange;
    fetch(`/api/dashboard/admin?from=${from.toISOString()}&to=${to.toISOString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json()).then(setStats);
  };

  useEffect(() => { loadStats(); }, [token, dateRange]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((d) => setUsers(Array.isArray(d) ? d : []));
    fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((d) => setInvItems(Array.isArray(d) ? d : []));
  }, [token]);

  const cms = users.filter((u) => u.role === 'CASE_MANAGER');
  const fws = users.filter((u) => u.role === 'CARE_GIVER');

  const handleTransfer = async () => {
    if (!selectedFW || !targetCM) return;
    const res = await fetch(`/api/users/${selectedFW}/transfer`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ supervisorId: targetCM }),
    });
    if (res.ok) {
      message.success('โยกย้าย CARE_GIVER สำเร็จ');
      setTransferModal(false);
      fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json()).then((d) => setUsers(Array.isArray(d) ? d : []));
    } else {
      message.error('เกิดข้อผิดพลาด');
    }
  };

  const invStockColor = (item: any) =>
    item.currentStock <= item.lowStockThreshold ? 'red' :
    item.currentStock <= item.lowStockThreshold * 2 ? 'orange' : 'green';

  const overviewTab = (
    <>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="ผู้ป่วยทั้งหมด" value={stats?.patients.total ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="CRITICAL" value={stats?.patients.critical ?? '-'} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Task Completion" value={stats ? `${stats.taskSuccessRate}%` : '-'} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Active CM / FW" value={stats ? `${stats.activeCM} / ${stats.activeFW}` : '-'} /></Card></Col>
      </Row>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="ผู้ป่วยแยกตาม Zone">
            {(stats?.zoneBreakdown ?? []).map((z) => (
              <div key={z.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span>{z.name}</span><strong>{z.count}</strong>
              </div>
            ))}
            {!stats?.zoneBreakdown?.length && <div style={{ color: '#999', padding: 12 }}>ยังไม่มีข้อมูล Zone</div>}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Patient Status">
            <Row gutter={8}>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#52c41a' }}>{stats?.patients.stable ?? '-'}</div><div>STABLE</div></Card></Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#faad14' }}>{stats?.patients.pending ?? '-'}</div><div>PENDING</div></Card></Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700, color: '#ff4d4f' }}>{stats?.patients.critical ?? '-'}</div><div>CRITICAL</div></Card></Col>
            </Row>
          </Card>
        </Col>
      </Row>
      <Card title="⇄ โยกย้าย CARE_GIVER" extra={<Button type="primary" onClick={() => setTransferModal(true)}>เลือก & โยกย้าย</Button>}>
        <Table
          dataSource={fws} rowKey="id" size="small" pagination={{ pageSize: 5 }}
          columns={[
            { title: 'CARE_GIVER', dataIndex: 'displayName' },
            { title: 'สังกัด CM', dataIndex: 'supervisorId', render: (id) => cms.find((c) => c.id === id)?.displayName ?? '-' },
          ]}
        />
      </Card>
      <Modal title="โยกย้าย CARE_GIVER" open={transferModal} onOk={handleTransfer} onCancel={() => setTransferModal(false)} okText="ยืนยัน">
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 4 }}>เลือก CARE_GIVER</div>
          <Select style={{ width: '100%' }} placeholder="เลือก FW" onChange={setSelectedFW} options={fws.map((f) => ({ value: f.id, label: f.displayName }))} />
        </div>
        <div>
          <div style={{ marginBottom: 4 }}>ย้ายไปยัง CASE_MANAGER</div>
          <Select style={{ width: '100%' }} placeholder="เลือก CM" onChange={setTargetCM} options={cms.map((c) => ({ value: c.id, label: c.displayName }))} />
        </div>
      </Modal>
    </>
  );

  const clusterTab = (
    <Card title="Zone Overview">
      <Table
        dataSource={stats?.zoneBreakdown ?? []} rowKey="name" size="small"
        columns={[
          { title: 'Zone', dataIndex: 'name' },
          { title: 'ผู้ป่วย', dataIndex: 'count' },
        ]}
      />
    </Card>
  );

  const inventoryTab = (
    <Card title="Stock Overview">
      <Table
        dataSource={invItems} rowKey="id" size="small" pagination={{ pageSize: 10 }}
        columns={[
          { title: 'สินค้า', dataIndex: 'name' },
          { title: 'หน่วย', dataIndex: 'unit' },
          { title: 'Stock', dataIndex: 'currentStock', render: (v, r) => <Tag color={invStockColor(r)}>{v}</Tag> },
          { title: 'เกณฑ์', dataIndex: 'lowStockThreshold' },
        ]}
      />
    </Card>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Admin Dashboard</h1>
        <RangePicker
          value={dateRange}
          onChange={(v) => v && setDateRange(v as [Dayjs, Dayjs])}
          format="DD MMM YYYY"
        />
      </div>
      <Tabs items={[
        { key: 'overview',  label: 'Overview',  children: overviewTab },
        { key: 'cluster',   label: 'Cluster',   children: clusterTab },
        { key: 'inventory', label: 'Inventory', children: inventoryTab },
      ]} />
    </div>
  );
}

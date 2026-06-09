'use client';
import { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, List, Button, Tag, message } from 'antd';
import { useSession } from 'next-auth/react';

interface MedVolStats {
  itemCount: number;
  lowStockCount: number;
  pendingRequestCount: number;
  totalPatients: number;
  stockLevels: { id: string; name: string; unit: string; currentStock: number; lowStockThreshold: number; pct: number }[];
  patientStatus: { stable: number; pending: number; critical: number };
  pendingRequestsList: { id: string; quantity: number; reason: string; item: { name: string; unit: string }; requester: { displayName: string } }[];
}

export default function MedVolDashboard() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [stats, setStats] = useState<MedVolStats | null>(null);

  const load = () => {
    if (!token) return;
    fetch('/api/dashboard/medvol', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then(setStats);
  };

  useEffect(() => { load(); }, [token]);

  const handleApprove = async (id: string, approved: boolean) => {
    const res = await fetch(`/api/inventory/adj-requests/${id}/review`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: approved ? 'APPROVED' : 'REJECTED' }),
    });
    if (res.ok) { message.success(approved ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว'); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const stockColor = (pct: number) => pct >= 70 ? '#52c41a' : pct >= 30 ? '#faad14' : '#ff4d4f';

  return (
    <div>
      <h1 style={{ marginBottom: 24, fontSize: 22, fontWeight: 700 }}>Medical Volunteer Dashboard</h1>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="รายการสินค้า" value={stats?.itemCount ?? '-'} suffix="ชนิด" /></Card></Col>
        <Col span={6}><Card><Statistic title="Stock ใกล้หมด" value={stats?.lowStockCount ?? '-'} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Request รออนุมัติ" value={stats?.pendingRequestCount ?? '-'} valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={6}><Card><Statistic title="ผู้ป่วยทั้งหมด" value={stats?.totalPatients ?? '-'} /></Card></Col>
      </Row>

      <Row gutter={16}>
        <Col span={14}>
          <Card title="Stock Level" extra={<Button type="primary" size="small" href="/medvol/inventory">จัดการ Inventory</Button>}>
            {(stats?.stockLevels ?? []).map((item) => (
              <div key={item.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                  <span style={{ color: stockColor(item.pct) }}>{item.currentStock} {item.unit}</span>
                </div>
                <div style={{ background: '#f0f0f0', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{ background: stockColor(item.pct), height: '100%', width: `${Math.min(item.pct, 100)}%`, transition: 'width 0.3s' }} />
                </div>
              </div>
            ))}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="Patient Status" style={{ marginBottom: 16 }}>
            <Row gutter={8}>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#52c41a' }}>{stats?.patientStatus.stable ?? '-'}</div><div style={{ fontSize: 11 }}>STABLE</div></Card></Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#faad14' }}>{stats?.patientStatus.pending ?? '-'}</div><div style={{ fontSize: 11 }}>PENDING</div></Card></Col>
              <Col span={8}><Card size="small" style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700, color: '#ff4d4f' }}>{stats?.patientStatus.critical ?? '-'}</div><div style={{ fontSize: 11 }}>CRITICAL</div></Card></Col>
            </Row>
          </Card>
          <Card title="Request รออนุมัติ">
            <List
              size="small"
              dataSource={stats?.pendingRequestsList ?? []}
              renderItem={(req) => (
                <List.Item
                  actions={[
                    <Button key="a" size="small" type="primary" onClick={() => handleApprove(req.id, true)}>อนุมัติ</Button>,
                    <Button key="r" size="small" danger onClick={() => handleApprove(req.id, false)}>ปฏิเสธ</Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={`${req.item.name} × ${req.quantity} ${req.item.unit}`}
                    description={req.requester.displayName}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

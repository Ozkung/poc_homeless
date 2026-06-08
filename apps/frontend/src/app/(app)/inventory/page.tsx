'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Button, Card, Drawer, Form, Input, InputNumber,
  Modal, Segmented, Select, Table, Tag, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface InventoryItem {
  id: string; name: string; unit: string;
  category: 'DRUG' | 'SUPPLY';
  currentStock: number; lowStockThreshold: number; isActive: boolean;
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<'DRUG' | 'SUPPLY'>('DRUG');
  const [stockInOpen, setStockInOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [stockInType, setStockInType] = useState<'IN_PURCHASE' | 'IN_DONATION'>('IN_PURCHASE');
  const [stockInForm] = Form.useForm();
  const [adjForm] = Form.useForm();
  const [addForm] = Form.useForm();

  const headers = useCallback(() => ({
    Authorization: `Bearer ${(session as any)?.accessToken ?? ''}`,
    'Content-Type': 'application/json',
  }), [(session as any)?.accessToken]);

  const load = useCallback(() => {
    if (!(session as any)?.accessToken) return;
    setLoading(true);
    fetch(`${API_URL}/inventory`, { headers: headers() })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [(session as any)?.accessToken, headers]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((i) => i.category === category);

  const columns: ColumnsType<InventoryItem> = [
    {
      title: 'ชื่อรายการ', dataIndex: 'name', key: 'name',
      render: (name, r) => (
        <div>
          <span style={{ fontWeight: 600 }}>{name}</span>
          {r.currentStock <= r.lowStockThreshold && (
            <Tag color="error" style={{ marginLeft: 8, fontSize: 10 }}>ใกล้หมด</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'คงเหลือ', dataIndex: 'currentStock', key: 'currentStock', width: 100,
      render: (n, r) => (
        <span style={{ fontWeight: 700, color: n <= r.lowStockThreshold ? '#ff4d4f' : '#52c41a' }}>
          {n}
        </span>
      ),
    },
    { title: 'หน่วย', dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: '', key: 'actions', width: 200,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" onClick={() => { setSelectedItem(r); setStockInOpen(true); }}>รับเข้า</Button>
          <Button size="small" danger onClick={() => { setSelectedItem(r); setAdjOpen(true); }}>ADJ</Button>
        </div>
      ),
    },
  ];

  async function handleStockIn(values: any) {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/inventory/${selectedItem.id}/stock-in`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...values, type: stockInType, quantity: Number(values.quantity) }),
      });
      if (res.ok) {
        message.success('บันทึกการรับเข้าแล้ว');
        setStockInOpen(false); stockInForm.resetFields(); load();
      } else { message.error('เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  async function handleAdj(values: any) {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/inventory/${selectedItem.id}/adj-request`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...values, quantity: Number(values.quantity) }),
      });
      if (res.ok) {
        const data = await res.json();
        message.success(data.autoApproved ? 'ปรับสต็อกแล้ว (auto-approve)' : 'ส่งคำขออนุมัติแล้ว');
        setAdjOpen(false); adjForm.resetFields(); load();
      } else { message.error('เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  async function handleAddItem(values: any) {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/inventory`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...values, category }),
      });
      if (res.ok) {
        message.success('เพิ่มรายการแล้ว');
        setAddOpen(false); addForm.resetFields(); load();
      } else { message.error('เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            Inventory
          </div>
          <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>
            คลังยา & เวชภัณฑ์
          </Title>
        </div>
        <Button type="primary" style={{ background: '#722ed1', borderColor: '#722ed1' }}
          onClick={() => setAddOpen(true)}>
          + เพิ่มรายการใหม่
        </Button>
      </div>

      <Card styles={{ body: { padding: '16px 24px' } }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <Segmented
            options={[{ label: 'ยา (Drug)', value: 'DRUG' }, { label: 'เวชภัณฑ์ (Supply)', value: 'SUPPLY' }]}
            value={category}
            onChange={(v) => setCategory(v as 'DRUG' | 'SUPPLY')}
          />
        </div>
        <Table
          columns={columns} dataSource={filtered} rowKey="id"
          loading={loading} size="middle"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: 'ยังไม่มีรายการ' }}
          rowClassName={(r) => r.currentStock <= r.lowStockThreshold ? 'bg-red-50' : ''}
        />
      </Card>

      {/* Stock IN Drawer */}
      <Drawer title={`รับเข้า: ${selectedItem?.name}`} open={stockInOpen}
        onClose={() => { setStockInOpen(false); stockInForm.resetFields(); }} styles={{ wrapper: { width: 400 } }}>
        <div style={{ marginBottom: 12 }}>
          <Segmented
            options={[{ label: '🛒 ซื้อ', value: 'IN_PURCHASE' }, { label: '💝 บริจาค', value: 'IN_DONATION' }]}
            value={stockInType}
            onChange={(v) => setStockInType(v as 'IN_PURCHASE' | 'IN_DONATION')}
          />
        </div>
        <Form form={stockInForm} layout="vertical" onFinish={handleStockIn}>
          <Form.Item name="quantity" label="จำนวน" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} addonAfter={selectedItem?.unit} />
          </Form.Item>
          {stockInType === 'IN_PURCHASE' && (
            <>
              <Form.Item name="receiptNo" label="เลขใบเสร็จ">
                <Input placeholder="RX-2568-001" />
              </Form.Item>
              <Form.Item name="unitCost" label="ราคาต่อหน่วย (บาท)">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
          {stockInType === 'IN_DONATION' && (
            <Form.Item name="donorName" label="ชื่อผู้บริจาค">
              <Input placeholder="บุคคล / องค์กร" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" loading={saving} block>บันทึก</Button>
        </Form>
      </Drawer>

      {/* ADJ Modal */}
      <Modal title={`ปรับสต็อก: ${selectedItem?.name}`} open={adjOpen}
        onCancel={() => { setAdjOpen(false); adjForm.resetFields(); }} footer={null}>
        <Form form={adjForm} layout="vertical" onFinish={handleAdj}>
          <Form.Item name="quantity" label="จำนวน (บวก = เพิ่ม, ลบ = ลด)"
            rules={[{ required: true }, { validator: (_, v) => v !== 0 ? Promise.resolve() : Promise.reject('ต้องไม่เป็น 0') }]}>
            <InputNumber style={{ width: '100%' }} addonAfter={selectedItem?.unit} />
          </Form.Item>
          <Form.Item name="reason" label="เหตุผล" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="เช่น ยาหมดอายุ, สต็อกผิดพลาด" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>ส่งคำขอ</Button>
        </Form>
      </Modal>

      {/* Add Item Modal */}
      <Modal title="เพิ่มรายการใหม่" open={addOpen}
        onCancel={() => { setAddOpen(false); addForm.resetFields(); }} footer={null}>
        <Form form={addForm} layout="vertical" onFinish={handleAddItem}
          initialValues={{ category, lowStockThreshold: 10 }}>
          <Form.Item name="name" label="ชื่อรายการ" rules={[{ required: true }]}>
            <Input placeholder="เช่น Metformin 500mg" />
          </Form.Item>
          <Form.Item name="unit" label="หน่วย" rules={[{ required: true }]}>
            <Input placeholder="เม็ด / ขวด / ชิ้น" />
          </Form.Item>
          <Form.Item name="category" label="ประเภท">
            <Select options={[{ value: 'DRUG', label: 'ยา (Drug)' }, { value: 'SUPPLY', label: 'เวชภัณฑ์ (Supply)' }]} />
          </Form.Item>
          <Form.Item name="lowStockThreshold" label="แจ้งเตือนเมื่อสต็อกต่ำกว่า">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>เพิ่มรายการ</Button>
        </Form>
      </Modal>
    </div>
  );
}

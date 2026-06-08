'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  App, Alert, Button, Card, DatePicker, Drawer, Form, Input, InputNumber,
  Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useIsMobile } from '@/hooks/useIsMobile';
import dayjs from 'dayjs';
import { AlertTriangle, Clock, PackageX } from 'lucide-react';

const { Title } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface InventoryItem {
  id: string; name: string; unit: string;
  category: 'DRUG' | 'SUPPLY';
  currentStock: number; lowStockThreshold: number; isActive: boolean;
}

interface ExpiringLot {
  lotId: string;
  itemId: string;
  itemName: string;
  unit: string;
  remaining: number;
  expiryDate: string;
  daysLeft: number;
  unitCost: number | null;
}

interface StockTx {
  id: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  createdAt: string;
  actor: { displayName: string };
  lot: { expiryDate: string } | null;
  reason: string | null;
  patientId: string | null;
}

export default function InventoryPage() {
  const { message } = App.useApp();
  const { data: session } = useSession();
  const isMobile = useIsMobile();
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
  const [expiringLots, setExpiringLots] = useState<ExpiringLot[]>([]);
  const [expiryModalOpen, setExpiryModalOpen] = useState(false);
  const [expiring, setExpiring] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [txItem, setTxItem] = useState<InventoryItem | null>(null);
  const [txList, setTxList] = useState<StockTx[]>([]);
  const [txLoading, setTxLoading] = useState(false);

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

  const loadExpiring = useCallback(() => {
    if (!(session as any)?.accessToken) return;
    fetch(`${API_URL}/inventory/expiring`, { headers: headers() })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setExpiringLots(Array.isArray(d) ? d : []));
  }, [(session as any)?.accessToken, headers]);

  useEffect(() => { loadExpiring(); }, [loadExpiring]);

  const filtered = items.filter((i) => i.category === category);

  const columns: ColumnsType<InventoryItem> = [
    {
      title: 'ชื่อรายการ', dataIndex: 'name', key: 'name',
      render: (name, r) => {
        const nearExpiry = expiringLots.filter((l) => l.itemId === r.id).length;
        return (
          <div>
            <span style={{ fontWeight: 600 }}>{name}</span>
            {r.currentStock <= r.lowStockThreshold && (
              <Tag color="error" style={{ marginLeft: 8, fontSize: 10 }}>ใกล้หมด</Tag>
            )}
            {nearExpiry > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Clock size={11} color="#ff4d4f" />
                <span style={{ fontSize: 11, color: '#ff4d4f' }}>{nearExpiry} lots ใกล้หมดอายุ</span>
              </div>
            )}
          </div>
        );
      },
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
      title: '', key: 'actions', width: 260,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" onClick={() => openTransactions(r)}>ประวัติ</Button>
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
        body: JSON.stringify({
          ...values,
          type: stockInType,
          quantity: Number(values.quantity),
          expiryDate: values.expiryDate?.toISOString(),
        }),
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

  async function handleExpireLot(lotId: string) {
    setExpiring(true);
    try {
      const res = await fetch(`${API_URL}/inventory/lots/${lotId}/expire`, {
        method: 'POST', headers: headers(),
      });
      if (res.ok) {
        message.success('นำยาออกจากสต็อกแล้ว');
        loadExpiring();
        load();
      } else {
        const e = await res.json();
        message.error(e.message ?? 'เกิดข้อผิดพลาด');
      }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setExpiring(false); }
  }

  async function openTransactions(item: InventoryItem) {
    setTxItem(item);
    setTxOpen(true);
    setTxLoading(true);
    try {
      const res = await fetch(`${API_URL}/inventory/${item.id}/transactions`, { headers: headers() });
      const d = res.ok ? await res.json() : [];
      setTxList(Array.isArray(d) ? d : []);
    } catch { setTxList([]); }
    finally { setTxLoading(false); }
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

      {expiringLots.length > 0 && (
        <Alert
          type="warning"
          style={{ marginBottom: 16 }}
          icon={<AlertTriangle size={16} />}
          showIcon
          message={`มียาใกล้หมดอายุ ${expiringLots.length} lots`}
          description="กรุณาตรวจสอบและนำยาที่หมดอายุออกจากสต็อก"
          action={
            <Button size="small" onClick={() => setExpiryModalOpen(true)}>
              ดูรายละเอียด
            </Button>
          }
        />
      )}

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
          scroll={{ x: 600 }}
        />
      </Card>

      {/* Stock IN Drawer */}
      <Drawer title={`รับเข้า: ${selectedItem?.name}`} open={stockInOpen}
        onClose={() => { setStockInOpen(false); stockInForm.resetFields(); }} styles={{ wrapper: { width: isMobile ? '100%' : 400 } }}>
        <div style={{ marginBottom: 12 }}>
          <Segmented
            options={[{ label: '🛒 ซื้อ', value: 'IN_PURCHASE' }, { label: '💝 บริจาค', value: 'IN_DONATION' }]}
            value={stockInType}
            onChange={(v) => setStockInType(v as 'IN_PURCHASE' | 'IN_DONATION')}
          />
        </div>
        <Form form={stockInForm} layout="vertical" onFinish={handleStockIn}>
          <Form.Item name="quantity" label="จำนวน" rules={[{ required: true }]}>
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber min={1} style={{ flex: 1 }} />
              <Button disabled style={{ pointerEvents: 'none', minWidth: 56 }}>{selectedItem?.unit}</Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item
            name="expiryDate"
            label="วันหมดอายุ"
            rules={[{ required: true, message: 'กรุณาระบุวันหมดอายุ' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              disabledDate={(d) => d <= dayjs()}
              format="DD/MM/YYYY"
              placeholder="เลือกวันหมดอายุ"
            />
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
            <Space.Compact style={{ width: '100%' }}>
              <InputNumber style={{ flex: 1 }} />
              <Button disabled style={{ pointerEvents: 'none', minWidth: 56 }}>{selectedItem?.unit}</Button>
            </Space.Compact>
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

      {/* Expiring Lots Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color="#faad14" />
            <span>ยาใกล้หมดอายุ</span>
          </div>
        }
        open={expiryModalOpen}
        onCancel={() => setExpiryModalOpen(false)}
        footer={null}
        width={isMobile ? '100%' : 700}
      >
        <Table
          dataSource={expiringLots}
          rowKey="lotId"
          size="small"
          pagination={false}
          scroll={{ x: 500 }}
          columns={[
            { title: 'ชื่อยา', dataIndex: 'itemName', key: 'itemName', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
            { title: 'คงเหลือ', dataIndex: 'remaining', key: 'remaining', width: 90,
              render: (v, r) => `${v} ${r.unit}` },
            { title: 'วันหมดอายุ', dataIndex: 'expiryDate', key: 'expiryDate', width: 130,
              render: (v) => new Date(v).toLocaleDateString('th-TH') },
            { title: 'เหลือ (วัน)', dataIndex: 'daysLeft', key: 'daysLeft', width: 100,
              render: (v) => (
                <Tag color={v <= 0 ? 'error' : v <= 7 ? 'warning' : 'orange'}>{v <= 0 ? 'หมดแล้ว' : `${v} วัน`}</Tag>
              ) },
            {
              title: '', key: 'action', width: 90,
              render: (_, r) => (
                <Popconfirm
                  title="นำ lot นี้ออกจากสต็อก?"
                  description={`จะลบ ${r.remaining} ${r.unit} ออกจากระบบ (soft delete)`}
                  okText="ยืนยัน" cancelText="ยกเลิก" okButtonProps={{ danger: true }}
                  onConfirm={() => handleExpireLot(r.lotId)}
                >
                  <Button size="small" danger icon={<PackageX size={13} />} loading={expiring}>
                    นำออก
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Modal>

      {/* Transaction History Drawer */}
      <Drawer
        title={`ประวัติรายการ: ${txItem?.name}`}
        open={txOpen}
        onClose={() => setTxOpen(false)}
        width={isMobile ? '100%' : 640}
      >
        <Table
          dataSource={txList}
          rowKey="id"
          size="small"
          loading={txLoading}
          scroll={{ x: 550 }}
          pagination={{ pageSize: 20 }}
          columns={[
            {
              title: 'ประเภท', dataIndex: 'type', key: 'type', width: 140,
              render: (t) => {
                const map: Record<string, [string, string]> = {
                  IN_PURCHASE:      ['green',    'ซื้อเข้า'],
                  IN_DONATION:      ['cyan',     'บริจาค'],
                  OUT_PRESCRIPTION: ['blue',     'จ่ายยา'],
                  OUT_SUPPLY:       ['geekblue', 'จ่ายวัสดุ'],
                  ADJ_APPROVED:     ['orange',   'ปรับสต็อก'],
                  OUT_EXPIRED:      ['red',      'หมดอายุ'],
                };
                const [color, label] = map[t] ?? ['default', t];
                return (
                  <Tag color={color} icon={t === 'OUT_EXPIRED' ? <PackageX size={11} /> : undefined}>
                    {label}
                  </Tag>
                );
              },
            },
            {
              title: 'จำนวน', dataIndex: 'quantity', key: 'quantity', width: 80,
              render: (v) => (
                <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>
                  {v > 0 ? `+${v}` : v}
                </span>
              ),
            },
            { title: 'คงเหลือ', dataIndex: 'balanceAfter', key: 'balanceAfter', width: 80 },
            {
              title: 'วันหมดอายุ (lot)', key: 'expiry', width: 130,
              render: (_, r) => r.lot?.expiryDate
                ? <span style={{ fontSize: 12 }}>{new Date(r.lot.expiryDate).toLocaleDateString('th-TH')}</span>
                : <span style={{ color: '#d9d9d9' }}>—</span>,
            },
            { title: 'โดย', key: 'actor', render: (_, r) => r.actor.displayName, width: 120 },
            {
              title: 'วันที่', dataIndex: 'createdAt', key: 'createdAt',
              render: (v) => new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
            },
          ]}
        />
      </Drawer>
    </div>
  );
}

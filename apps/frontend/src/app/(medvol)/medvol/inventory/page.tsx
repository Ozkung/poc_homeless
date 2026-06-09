'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Form, Input, InputNumber, Select, Tabs, message } from 'antd';
import { useSession } from 'next-auth/react';

export default function MedVolInventoryPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [items, setItems] = useState<any[]>([]);
  const [adjRequests, setAdjRequests] = useState<any[]>([]);
  const [stockInModal, setStockInModal] = useState<string | null>(null);
  const [adjModal, setAdjModal] = useState<string | null>(null);
  const [stockForm] = Form.useForm();
  const [adjForm] = Form.useForm();

  const load = async () => {
    if (!token) return;
    const [itemsRes, adjRes] = await Promise.all([
      fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/inventory/adj-requests', { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (itemsRes.ok) setItems(await itemsRes.json());
    if (adjRes.ok) setAdjRequests(await adjRes.json());
  };

  useEffect(() => { load(); }, [token]);

  const handleStockIn = async () => {
    const values = await stockForm.validateFields();
    const res = await fetch(`/api/inventory/${stockInModal}/stock-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('รับ stock เข้าสำเร็จ'); setStockInModal(null); stockForm.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const handleAdj = async () => {
    const values = await adjForm.validateFields();
    const res = await fetch(`/api/inventory/${adjModal}/adj-request`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('ส่ง ADJ request สำเร็จ'); setAdjModal(null); adjForm.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const handleReviewAdj = async (id: string, approved: boolean) => {
    const res = await fetch(`/api/inventory/adj-requests/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: approved ? 'APPROVED' : 'REJECTED' }),
    });
    if (res.ok) { message.success(approved ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว'); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const stockColor = (item: any) =>
    item.currentStock <= item.lowStockThreshold ? 'red' :
    item.currentStock <= item.lowStockThreshold * 2 ? 'orange' : 'green';

  const adjStatusColor: Record<string, string> = { PENDING: 'orange', APPROVED: 'green', REJECTED: 'red' };

  const stockTab = (
    <>
      <Table
        dataSource={items} rowKey="id" size="small" style={{ marginBottom: 0 }}
        columns={[
          { title: 'ชื่อสินค้า', dataIndex: 'name' },
          { title: 'หน่วย', dataIndex: 'unit' },
          { title: 'หมวดหมู่', dataIndex: 'category', render: (v) => <Tag>{v}</Tag> },
          { title: 'Stock', dataIndex: 'currentStock', render: (v, r) => <Tag color={stockColor(r)}>{v}</Tag> },
          { title: 'เกณฑ์', dataIndex: 'lowStockThreshold' },
          {
            title: 'Actions',
            render: (_, r) => (
              <span>
                <Button size="small" type="primary" onClick={() => setStockInModal(r.id)} style={{ marginRight: 8 }}>
                  รับเข้า
                </Button>
                <Button size="small" onClick={() => { setAdjModal(r.id); }}>
                  ADJ
                </Button>
              </span>
            ),
          },
        ]}
      />
    </>
  );

  const adjTab = (
    <Table
      dataSource={adjRequests} rowKey="id" size="small"
      columns={[
        { title: 'สินค้า', render: (_, r) => r.item?.name ?? '-' },
        { title: 'จำนวน', dataIndex: 'quantity' },
        { title: 'เหตุผล', dataIndex: 'reason' },
        { title: 'ผู้ขอ', render: (_, r) => r.requester?.displayName ?? '-' },
        { title: 'สถานะ', dataIndex: 'status', render: (s) => <Tag color={adjStatusColor[s] ?? 'default'}>{s}</Tag> },
        {
          title: '',
          render: (_, r) =>
            r.status === 'PENDING' ? (
              <span>
                <Button size="small" type="primary" onClick={() => handleReviewAdj(r.id, true)} style={{ marginRight: 6 }}>อนุมัติ</Button>
                <Button size="small" danger onClick={() => handleReviewAdj(r.id, false)}>ปฏิเสธ</Button>
              </span>
            ) : null,
        },
      ]}
    />
  );

  return (
    <div>
      <h1 style={{ marginBottom: 20, fontSize: 22, fontWeight: 700 }}>Inventory</h1>

      <Tabs
        items={[
          { key: 'stock', label: `Stock (${items.length})`, children: stockTab },
          { key: 'adj', label: `ADJ Requests (${adjRequests.filter((r) => r.status === 'PENDING').length} pending)`, children: adjTab },
        ]}
      />

      <Modal title="รับ Stock เข้า" open={!!stockInModal} onOk={handleStockIn} onCancel={() => { setStockInModal(null); stockForm.resetFields(); }} okText="บันทึก">
        <Form form={stockForm} layout="vertical">
          <Form.Item name="quantity" label="จำนวนที่รับเข้า" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expiryDate" label="วันหมดอายุ" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="receiptNo" label="เลขที่ใบเสร็จ">
            <Input placeholder="RX-2026-xxx" />
          </Form.Item>
          <Form.Item name="unitCost" label="ราคาต่อหน่วย (บาท)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="ส่งคำขอปรับ Stock (ADJ)" open={!!adjModal} onOk={handleAdj} onCancel={() => { setAdjModal(null); adjForm.resetFields(); }} okText="ส่งคำขอ">
        <Form form={adjForm} layout="vertical">
          <Form.Item name="quantity" label="จำนวน (ลบ = ตัดออก, บวก = เพิ่ม)" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label="เหตุผล" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="เช่น ยาหมดอายุ, ชำรุด, ตรวจนับผิดพลาด" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

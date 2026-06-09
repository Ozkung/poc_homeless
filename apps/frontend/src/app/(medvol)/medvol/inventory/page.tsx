'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Button, Modal, Form, Input, InputNumber, Select, message } from 'antd';
import { useSession } from 'next-auth/react';

export default function MedVolInventoryPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [items, setItems] = useState<any[]>([]);
  const [createModal, setCreateModal] = useState(false);
  const [stockInModal, setStockInModal] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [stockForm] = Form.useForm();

  const load = async () => {
    if (!token) return;
    const res = await fetch('/api/inventory', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setItems(await res.json());
  };

  useEffect(() => { load(); }, [token]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const res = await fetch('/api/inventory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('เพิ่มสินค้าสำเร็จ'); setCreateModal(false); form.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const handleStockIn = async () => {
    const values = await stockForm.validateFields();
    const res = await fetch(`/api/inventory/${stockInModal}/stock-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (res.ok) { message.success('เพิ่ม stock สำเร็จ'); setStockInModal(null); stockForm.resetFields(); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  const stockColor = (item: any) =>
    item.currentStock <= item.lowStockThreshold ? 'red' :
    item.currentStock <= item.lowStockThreshold * 2 ? 'orange' : 'green';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Inventory</h1>
        <Button type="primary" onClick={() => setCreateModal(true)}>+ เพิ่มสินค้า</Button>
      </div>
      <Table
        dataSource={items} rowKey="id" size="small"
        columns={[
          { title: 'ชื่อสินค้า', dataIndex: 'name' },
          { title: 'หน่วย', dataIndex: 'unit' },
          { title: 'หมวดหมู่', dataIndex: 'category', render: (v) => <Tag>{v}</Tag> },
          { title: 'Stock', dataIndex: 'currentStock', render: (v, r) => <Tag color={stockColor(r)}>{v}</Tag> },
          { title: 'เกณฑ์ต่ำสุด', dataIndex: 'lowStockThreshold' },
          { title: '', render: (_, r) => <Button size="small" onClick={() => setStockInModal(r.id)}>รับเข้า</Button> },
        ]}
      />
      <Modal title="เพิ่มสินค้าใหม่" open={createModal} onOk={handleCreate} onCancel={() => setCreateModal(false)} okText="เพิ่ม">
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="ชื่อสินค้า" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="unit" label="หน่วย" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="category" label="หมวดหมู่" rules={[{ required: true }]}>
            <Select options={[{ value: 'DRUG', label: 'ยา' }, { value: 'SUPPLY', label: 'อุปกรณ์' }]} />
          </Form.Item>
          <Form.Item name="lowStockThreshold" label="เกณฑ์ต่ำสุด" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
      <Modal title="รับ Stock เข้า" open={!!stockInModal} onOk={handleStockIn} onCancel={() => setStockInModal(null)} okText="บันทึก">
        <Form form={stockForm} layout="vertical">
          <Form.Item name="quantity" label="จำนวน" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="expiryDate" label="วันหมดอายุ" rules={[{ required: true }]}><Input type="date" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

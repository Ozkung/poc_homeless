'use client';
import { useEffect, useState } from 'react';
import { Table, Tag, Button, Input, Modal, message } from 'antd';
import { useSession } from 'next-auth/react';

const ACTION_COLOR: Record<string, string> = {
  CREATE_EVENT: 'blue', DELETE_EVENT: 'red',
  CREATE_ITEM: 'green', STOCK_IN: 'cyan',
  CREATE_PATIENT: 'purple', DELETE_PATIENT: 'red',
  CREATE_USER: 'geekblue', DEACTIVATE_USER: 'orange',
  APPROVE_GUEST: 'green', CHANGE_ROLE: 'volcano',
  CARE_PLAN: 'gold', DISPENSE: 'lime',
};

const ACTION_LABEL: Record<string, string> = {
  CREATE_EVENT: 'สร้าง Event', DELETE_EVENT: 'ลบ Event',
  CREATE_ITEM: 'เพิ่มยา/วัสดุ', STOCK_IN: 'รับยาเข้า',
  CREATE_PATIENT: 'เพิ่มผู้ป่วย', DELETE_PATIENT: 'ลบผู้ป่วย',
  CREATE_USER: 'เพิ่มผู้ใช้', DEACTIVATE_USER: 'ปิดการใช้งาน',
  APPROVE_GUEST: 'อนุมัติ Guest', CHANGE_ROLE: 'เปลี่ยน Role',
  CARE_PLAN: 'ทำ Care Plan', DISPENSE: 'จ่ายยา',
};

export default function AuditLogPage() {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [noteModal, setNoteModal] = useState<{ id: string; current: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const pageSize = 20;

  const load = async (p = page) => {
    if (!token) return;
    const skip = (p - 1) * pageSize;
    const res = await fetch(`/api/audit-logs?skip=${skip}&limit=${pageSize}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { const d = await res.json(); setLogs(d.data); setTotal(d.total); }
  };

  useEffect(() => { load(); }, [token, page]);

  const handleSaveNote = async () => {
    if (!noteModal) return;
    const res = await fetch(`/api/audit-logs/${noteModal.id}/note`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: noteDraft }),
    });
    if (res.ok) { message.success('บันทึก Note แล้ว'); setNoteModal(null); load(); }
    else message.error('เกิดข้อผิดพลาด');
  };

  return (
    <div>
      <h1 style={{ marginBottom: 20, fontSize: 22, fontWeight: 700 }}>Audit Log</h1>

      <Table
        dataSource={logs}
        rowKey="id"
        size="small"
        pagination={{ current: page, pageSize, total, onChange: setPage, showTotal: (t) => `ทั้งหมด ${t} รายการ` }}
        columns={[
          {
            title: 'เวลา', dataIndex: 'createdAt', width: 150,
            render: (v) => new Date(v).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
          },
          {
            title: 'ผู้ดำเนินการ', width: 160,
            render: (_, r) => (
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.actor?.displayName}</div>
                <Tag style={{ fontSize: 10, marginTop: 2 }}>{r.actor?.role}</Tag>
              </div>
            ),
          },
          {
            title: 'Action', dataIndex: 'action', width: 150,
            render: (a) => <Tag color={ACTION_COLOR[a] ?? 'default'}>{ACTION_LABEL[a] ?? a}</Tag>,
          },
          { title: 'รายละเอียด', dataIndex: 'detail', render: (v) => <span style={{ fontSize: 12, color: '#555' }}>{v ?? '-'}</span> },
          {
            title: 'Note', dataIndex: 'adminNote',
            render: (v, r) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {v && <span style={{ fontSize: 12, color: '#1677ff' }}>📝 {v}</span>}
                <Button
                  size="small" type="text"
                  style={{ color: '#aaa', fontSize: 11 }}
                  onClick={() => { setNoteModal({ id: r.id, current: v ?? '' }); setNoteDraft(v ?? ''); }}
                >
                  {v ? 'แก้ไข' : '+ Note'}
                </Button>
              </div>
            ),
          },
        ]}
      />

      <Modal
        title="เพิ่ม / แก้ไข Note"
        open={!!noteModal}
        onOk={handleSaveNote}
        onCancel={() => setNoteModal(null)}
        okText="บันทึก"
      >
        <Input.TextArea
          rows={4}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="ระบุ note สำหรับ log นี้..."
        />
      </Modal>
    </div>
  );
}

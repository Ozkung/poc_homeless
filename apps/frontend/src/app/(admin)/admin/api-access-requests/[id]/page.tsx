'use client';
import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Input, Radio, Space, Typography, message } from 'antd';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import EntityColumnPicker from '@/components/api-access/EntityColumnPicker';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface ApiAccessRequestDetail {
  id: string;
  requesterName: string;
  requesterOrg?: string | null;
  email: string;
  phone: string;
  justificationFileUrl: string;
  requestedLevel: 'VIEW' | 'CREATE_UPDATE';
  requestedScope: Record<string, string[]>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export default function ApiAccessRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const router = useRouter();

  const [request, setRequest] = useState<ApiAccessRequestDetail | null>(null);
  const [level, setLevel] = useState<'VIEW' | 'CREATE_UPDATE'>('VIEW');
  const [scope, setScope] = useState<Record<string, string[]>>({});
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api-access-requests/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data: ApiAccessRequestDetail) => {
        setRequest(data);
        setLevel(data.requestedLevel);
        setScope(data.requestedScope);
      });
  }, [token, id]);

  async function handleApprove() {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api-access-requests/${id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantedLevel: level, grantedScope: scope }),
      });
      if (res.ok) {
        const data = await res.json();
        setIssuedToken(data.plaintextToken);
        message.success('อนุมัติคำขอแล้ว ระบบได้ส่งอีเมลแจ้งผู้ขอแล้ว');
      } else {
        message.error('เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api-access-requests/${id}/reject`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });
      if (res.ok) {
        message.success('ปฏิเสธคำขอแล้ว');
        router.push('/admin/api-access-requests');
      } else {
        message.error('เกิดข้อผิดพลาด');
      }
    } finally {
      setSaving(false);
    }
  }

  if (!request) return null;

  if (issuedToken) {
    return (
      <div style={{ maxWidth: 640 }}>
        <Card title="อนุมัติสำเร็จ">
          <Typography.Paragraph type="warning">
            กรุณาคัดลอก Token นี้เก็บไว้ ระบบจะไม่แสดง Token นี้ซ้ำอีก (ระบบได้ส่งอีเมลนี้ให้ผู้ขอแล้วโดยอัตโนมัติ)
          </Typography.Paragraph>
          <Input.TextArea value={issuedToken} readOnly autoSize rows={2} />
          <Button style={{ marginTop: 16 }} onClick={() => router.push('/admin/api-access-requests')}>
            กลับไปหน้ารายการ
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Card title="พิจารณาคำขอใช้งาน Open API">
        <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
          <Descriptions.Item label="ผู้ขอ">{request.requesterName}</Descriptions.Item>
          <Descriptions.Item label="หน่วยงาน">{request.requesterOrg ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="อีเมล">{request.email}</Descriptions.Item>
          <Descriptions.Item label="เบอร์โทร">{request.phone}</Descriptions.Item>
          <Descriptions.Item label="ไฟล์ยื่นความประสงค์">
            <a href={`${API_URL}${request.justificationFileUrl}`} target="_blank" rel="noreferrer">เปิดไฟล์</a>
          </Descriptions.Item>
        </Descriptions>

        {request.status !== 'PENDING' ? (
          <Typography.Text>คำขอนี้ถูกพิจารณาไปแล้ว</Typography.Text>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>ระดับการใช้งาน</Typography.Text>
              <Radio.Group
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                options={[
                  { label: 'View', value: 'VIEW' },
                  { label: 'Create + Update', value: 'CREATE_UPDATE' },
                ]}
                style={{ display: 'block', marginTop: 8 }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>ข้อมูลที่อนุญาตให้เข้าถึง</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <EntityColumnPicker value={scope} onChange={setScope} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>เหตุผล (กรณีปฏิเสธ, ไม่บังคับ)</Typography.Text>
              <Input.TextArea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                style={{ marginTop: 8 }}
              />
            </div>
            <Space>
              <Button type="primary" loading={saving} onClick={handleApprove}>อนุมัติ</Button>
              <Button danger loading={saving} onClick={handleReject}>ปฏิเสธ</Button>
            </Space>
          </>
        )}
      </Card>
    </div>
  );
}

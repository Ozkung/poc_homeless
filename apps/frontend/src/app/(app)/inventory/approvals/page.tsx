'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { App, Button, Card, Input, Tag, Typography } from 'antd';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface AdjRequest {
  id: string;
  quantity: number;
  reason: string;
  createdAt: string;
  item: { name: string; unit: string };
  requester: { displayName: string };
}

export default function ApprovalsPage() {
  const { message } = App.useApp();
  const { data: session } = useSession();
  const [requests, setRequests] = useState<AdjRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const headers = useCallback(() => ({
    Authorization: `Bearer ${(session as any)?.accessToken ?? ''}`,
    'Content-Type': 'application/json',
  }), [(session as any)?.accessToken]);

  const load = useCallback(() => {
    if (!(session as any)?.accessToken) return;
    fetch(`${API_URL}/inventory/adj-requests`, { headers: headers() })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setRequests(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [(session as any)?.accessToken, headers]);

  useEffect(() => { load(); }, [load]);

  async function handleReview(id: string, status: 'APPROVED' | 'REJECTED') {
    setProcessing(id);
    try {
      const res = await fetch(`${API_URL}/inventory/adj-requests/${id}`, {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ status, reviewNote: reviewNotes[id] ?? '' }),
      });
      if (res.ok) {
        message.success(status === 'APPROVED' ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว');
        load();
      } else { message.error('เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setProcessing(null); }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: '#722ed1', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Inventory · Approvals
        </div>
        <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>
          รออนุมัติ ADJ
        </Title>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>กำลังโหลด…</div>
      ) : requests.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>ไม่มีคำขอรออนุมัติ</div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map((req) => (
            <Card key={req.id} styles={{ body: { padding: 16 } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <Text style={{ fontWeight: 700, fontSize: 14 }}>{req.item.name}</Text>
                  <Tag color={req.quantity > 0 ? 'success' : 'error'} style={{ marginLeft: 8 }}>
                    {req.quantity > 0 ? `+${req.quantity}` : req.quantity} {req.item.unit}
                  </Tag>
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {new Date(req.createdAt).toLocaleDateString('th-TH')}
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                เหตุผล: {req.reason}
              </Text>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 10 }}>
                ขอโดย: {req.requester.displayName}
              </Text>
              <Input
                placeholder="หมายเหตุ (ถ้ามี)"
                size="small"
                value={reviewNotes[req.id] ?? ''}
                onChange={(e) => setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  type="primary"
                  size="small"
                  style={{ flex: 1, background: '#52c41a', borderColor: '#52c41a' }}
                  loading={processing === req.id}
                  onClick={() => handleReview(req.id, 'APPROVED')}
                >
                  ✓ อนุมัติ
                </Button>
                <Button
                  danger size="small" style={{ flex: 1 }}
                  loading={processing === req.id}
                  onClick={() => handleReview(req.id, 'REJECTED')}
                >
                  ✕ ปฏิเสธ
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

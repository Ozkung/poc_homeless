'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button, Table, Modal, Tag, Typography, Divider, Row, Col, Pagination } from 'antd';
import { Eye, Pencil, Plus } from 'lucide-react';

const { Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PAGE_SIZE = 10;

interface Assessment {
  id: string;
  assessmentDate?: string;
  status?: string;
  helpGoal?: string;
  locationFound?: string;
  careSetting?: string;
  referralSource?: string;
  homelessType?: string;
  healthcareRight?: string;
  primaryCareUnit?: string;
  referralUnit?: string;
  ncdConditions?: string[];
  infectiousConditions?: string[];
  mentalConditions?: string[];
  substanceConditions?: string[];
  disabilityConditions?: string[];
  otherConditionCategories?: string[];
  conditionNote?: string;
  mentalConditionNote?: string;
  medicalGoals?: string[];
  medicalGoalOther?: string;
  socialGoals?: string[];
  socialGoalOther?: string;
  notes?: string;
  createdAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  Active: 'green', 'Follow-up': 'blue', Missing: 'orange', Closed: 'default',
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
      <Text type="secondary" style={{ width: 160, fontSize: 12, flexShrink: 0 }}>{label}</Text>
      <Text style={{ fontSize: 12 }}>{value}</Text>
    </div>
  );
}

function TagRow({ label, values }: { label: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>{label}</Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {values.map((v) => <Tag key={v} style={{ fontSize: 11 }}>{v}</Tag>)}
      </div>
    </div>
  );
}

export default function CarePlanTab({ patientId }: { patientId: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<Assessment[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewItem, setViewItem] = useState<Assessment | null>(null);

  const headers = useCallback(() => ({
    Authorization: `Bearer ${session?.accessToken ?? ''}`,
  }), [session?.accessToken]);

  const load = useCallback((s = 0) => {
    if (!session?.accessToken) return;
    setLoading(true);
    fetch(`${API_URL}/patients/${patientId}/assessment?skip=${s}&limit=${PAGE_SIZE}`, { headers: headers() })
      .then((r) => r.ok ? r.json() : { data: [], total: 0 })
      .then((res) => { setItems(res.data ?? []); setTotal(res.total ?? 0); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patientId, session?.accessToken, headers]);

  useEffect(() => { load(0); }, [load]);

  function handlePageChange(page: number) {
    const newSkip = (page - 1) * PAGE_SIZE;
    setSkip(newSkip);
    load(newSkip);
  }

  const columns = [
    {
      title: 'วันที่พบ',
      dataIndex: 'assessmentDate',
      width: 120,
      render: (v: string, row: Assessment) =>
        v ? new Date(v).toLocaleDateString('th-TH') : new Date(row.createdAt).toLocaleDateString('th-TH'),
    },
    {
      title: 'สถานะ',
      dataIndex: 'status',
      width: 100,
      render: (v: string) => v ? <Tag color={STATUS_COLOR[v] ?? 'default'}>{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: 'เป้าหมาย',
      dataIndex: 'helpGoal',
      render: (v: string) => v ? <Tag color="purple">{v}</Tag> : <Text type="secondary">-</Text>,
    },
    {
      title: 'สถานที่พบ',
      dataIndex: 'locationFound',
      render: (v: string) => v ?? <Text type="secondary">-</Text>,
    },
    {
      title: '',
      width: 110,
      render: (_: any, row: Assessment) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<Eye size={12} />}
            onClick={() => setViewItem(row)}
          >
            View
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<Pencil size={12} />}
            onClick={() => router.push(`/cm/patients/${patientId}/care-plan-assessment?id=${row.id}`)}
          >
            Update
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{total} รายการ</Text>
        <Button
          size="small"
          type="primary"
          onClick={() => router.push(`/cm/patients/${patientId}/care-plan-assessment`)}
        >
          + เพิ่มแบบประเมิน
        </Button>
      </div>

      <Table
        size="small"
        dataSource={items}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        locale={{ emptyText: 'ยังไม่มีข้อมูลการประเมิน' }}
      />

      {total > PAGE_SIZE && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <Pagination
            size="small"
            total={total}
            pageSize={PAGE_SIZE}
            current={Math.floor(skip / PAGE_SIZE) + 1}
            onChange={handlePageChange}
            showTotal={(t) => `ทั้งหมด ${t} รายการ`}
          />
        </div>
      )}

      {/* View Modal */}
      <Modal
        title={`แบบประเมิน — ${viewItem?.assessmentDate ? new Date(viewItem.assessmentDate).toLocaleDateString('th-TH') : viewItem ? new Date(viewItem.createdAt).toLocaleDateString('th-TH') : ''}`}
        open={!!viewItem}
        onCancel={() => setViewItem(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setViewItem(null)}>ปิด</Button>
            <Button
              type="primary"
              icon={<Pencil size={13} />}
              onClick={() => { setViewItem(null); router.push(`/cm/patients/${patientId}/care-plan-assessment?id=${viewItem?.id}`); }}
            >
              แก้ไข
            </Button>
          </div>
        }
        width={640}
        styles={{ body: { maxHeight: '65vh', overflowY: 'auto' } }}
      >
        {viewItem && (
          <div style={{ fontFamily: "'Sarabun', sans-serif" }}>
            <Divider style={{ fontSize: 12, margin: '12px 0 8px' }}>ข้อมูลเบื้องต้น</Divider>
            <InfoRow label="วันที่พบ" value={viewItem.assessmentDate ? new Date(viewItem.assessmentDate).toLocaleDateString('th-TH') : undefined} />
            <InfoRow label="สถานะ" value={viewItem.status} />
            <InfoRow label="สถานที่พบ" value={viewItem.locationFound} />
            <InfoRow label="ประเภทไร้บ้าน" value={viewItem.homelessType} />
            <InfoRow label="Care Setting" value={viewItem.careSetting} />
            <InfoRow label="Referral Source" value={viewItem.referralSource} />

            <Divider style={{ fontSize: 12, margin: '12px 0 8px' }}>สิทธิและหน่วยบริการ</Divider>
            <InfoRow label="สิทธิรักษาพยาบาล" value={viewItem.healthcareRight} />
            <InfoRow label="หน่วยบริการปฐมภูมิ" value={viewItem.primaryCareUnit} />
            <InfoRow label="หน่วยบริการรับส่งต่อ" value={viewItem.referralUnit} />

            <Divider style={{ fontSize: 12, margin: '12px 0 8px' }}>โรคประจำตัว</Divider>
            <TagRow label="กลุ่มโรคเรื้อรัง (NCDs)" values={viewItem.ncdConditions} />
            <TagRow label="กลุ่มโรคติดต่อ" values={viewItem.infectiousConditions} />
            <TagRow label="สุขภาพจิตและระบบประสาท" values={viewItem.mentalConditions} />
            <TagRow label="สารเสพติด" values={viewItem.substanceConditions} />
            <TagRow label="ความพิการและอุบัติเหตุ" values={viewItem.disabilityConditions} />
            {viewItem.conditionNote && <InfoRow label="โรคประจำตัว (ระบุ)" value={viewItem.conditionNote} />}
            {viewItem.mentalConditionNote && <InfoRow label="โรคทางจิต (ระบุ)" value={viewItem.mentalConditionNote} />}

            <Divider style={{ fontSize: 12, margin: '12px 0 8px' }}>เป้าหมายการช่วยเหลือ</Divider>
            <InfoRow label="เป้าหมาย" value={viewItem.helpGoal} />
            <Row gutter={16}>
              <Col span={12}><TagRow label="เป้าหมายทางการแพทย์" values={viewItem.medicalGoals} /></Col>
              <Col span={12}><TagRow label="เป้าหมายทางสังคม" values={viewItem.socialGoals} /></Col>
            </Row>
            {viewItem.medicalGoalOther && <InfoRow label="การแพทย์ (อื่นๆ)" value={viewItem.medicalGoalOther} />}
            {viewItem.socialGoalOther && <InfoRow label="สังคม (อื่นๆ)" value={viewItem.socialGoalOther} />}

            {viewItem.notes && (
              <>
                <Divider style={{ fontSize: 12, margin: '12px 0 8px' }}>Notes</Divider>
                <Text style={{ fontSize: 12 }}>{viewItem.notes}</Text>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

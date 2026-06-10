'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import {
  Button, Card, Col, Descriptions, Divider, Form, Input, Modal,
  Row, Select, Spin, Table, Tabs, Tag, Typography, message,
} from 'antd';
import { ArrowLeft, Plus, Stethoscope, Pill, Trash2 } from 'lucide-react';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_COLOR: Record<string, string> = { CRITICAL: 'red', PENDING: 'orange', STABLE: 'green', MISSING: 'default' };
const STATUS_LABEL: Record<string, string> = { CRITICAL: 'วิกฤต', PENDING: 'รอดำเนินการ', STABLE: 'ปกติ', MISSING: 'สูญหาย' };
const SEVERITY_COLOR: Record<string, string> = { MILD: 'green', MODERATE: 'orange', SEVERE: 'red' };

function MedicationRow({ med, index, onChange, onRemove }: any) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
      <Input placeholder="ชื่อยา" value={med.name} onChange={(e) => onChange(index, 'name', e.target.value)} style={{ flex: 2 }} />
      <Input placeholder="ขนาด (เช่น 500mg)" value={med.dosage} onChange={(e) => onChange(index, 'dosage', e.target.value)} style={{ flex: 1 }} />
      <Input placeholder="ความถี่ (เช่น วันละ 2 ครั้ง)" value={med.frequency} onChange={(e) => onChange(index, 'frequency', e.target.value)} style={{ flex: 2 }} />
      <Input placeholder="ระยะเวลา" value={med.duration} onChange={(e) => onChange(index, 'duration', e.target.value)} style={{ flex: 1 }} />
      <button onClick={() => onRemove(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4d4f', padding: '4px 8px', marginTop: 4 }}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function DoctorPatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [diagModal, setDiagModal] = useState(false);
  const [prescModal, setPrescModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [diagForm] = Form.useForm();
  const [medications, setMedications] = useState([{ name: '', dosage: '', frequency: '', duration: '', notes: '' }]);

  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${session?.accessToken ?? ''}`, 'Content-Type': 'application/json' }), [session?.accessToken]);

  const load = useCallback(() => {
    if (!session?.accessToken) return;
    setLoading(true);
    fetch(`${API_URL}/doctor/patients/${id}`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.ok ? r.json() : null)
      .then(setPatient)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, session?.accessToken]);

  useEffect(() => { load(); }, [load]);

  async function submitDiagnosis(values: any) {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/doctor/patients/${id}/diagnoses`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(values) });
      if (res.ok) { message.success('บันทึกการวินิจฉัยแล้ว'); setDiagModal(false); diagForm.resetFields(); load(); }
      else message.error('บันทึกไม่สำเร็จ');
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  async function deleteDiagnosis(diagId: string) {
    if (!window.confirm('ลบการวินิจฉัยนี้?')) return;
    await fetch(`${API_URL}/doctor/patients/${id}/diagnoses/${diagId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${session?.accessToken ?? ''}` } });
    load();
  }

  async function submitPrescription() {
    const meds = medications.filter((m) => m.name.trim());
    if (!meds.length) { message.warning('กรุณาเพิ่มยาอย่างน้อย 1 รายการ'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/doctor/patients/${id}/prescriptions`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ medications: meds }) });
      if (res.ok) { message.success('บันทึกใบสั่งยาแล้ว'); setPrescModal(false); setMedications([{ name: '', dosage: '', frequency: '', duration: '', notes: '' }]); load(); }
      else message.error('บันทึกไม่สำเร็จ');
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  function updateMed(index: number, field: string, value: string) {
    setMedications((prev) => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  }

  if (loading) return <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin size="large" /></div>;
  if (!patient) return <div style={{ padding: 24, color: '#999' }}>ไม่พบข้อมูลผู้ป่วย</div>;

  const diagColumns = [
    { title: 'การวินิจฉัย', dataIndex: 'title', render: (v: string, r: any) => <div><Text style={{ fontWeight: 500 }}>{v}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{r.description}</Text></div> },
    { title: 'ICD-10', dataIndex: 'icd10', width: 90, render: (v: string) => v ?? '-' },
    { title: 'ระดับ', dataIndex: 'severity', width: 90, render: (v: string) => v ? <Tag color={SEVERITY_COLOR[v]}>{v}</Tag> : '-' },
    { title: 'แพทย์', dataIndex: ['doctor', 'displayName'], width: 130 },
    { title: 'วันที่', dataIndex: 'createdAt', width: 100, render: (v: string) => new Date(v).toLocaleDateString('th-TH') },
    {
      title: '', width: 50,
      render: (_: any, r: any) => (
        <button onClick={() => deleteDiagnosis(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ff4d4f')} onMouseLeave={(e) => (e.currentTarget.style.color = '#ccc')}>
          <Trash2 size={13} />
        </button>
      ),
    },
  ];

  const prescColumns = [
    {
      title: 'รายการยา', dataIndex: 'medications',
      render: (meds: any[]) => (
        <div>{(meds ?? []).map((m: any, i: number) => (
          <div key={i} style={{ fontSize: 12, marginBottom: 2 }}>
            <Text strong>{m.name}</Text> {m.dosage} — {m.frequency}{m.duration ? ` (${m.duration})` : ''}
          </div>
        ))}</div>
      ),
    },
    { title: 'หมายเหตุ', dataIndex: 'notes', width: 150, render: (v: string) => v ?? '-' },
    { title: 'แพทย์', dataIndex: ['doctor', 'displayName'], width: 130 },
    { title: 'วันที่', dataIndex: 'createdAt', width: 100, render: (v: string) => new Date(v).toLocaleDateString('th-TH') },
  ];

  return (
    <div style={{ padding: 24, fontFamily: "'Sarabun', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <Button icon={<ArrowLeft size={15} />} onClick={() => router.push('/doctor/patients')} type="text" />
        <div>
          <Text style={{ fontSize: 11, color: '#0ea5e9', fontWeight: 600, textTransform: 'uppercase' }}>Doctor Portal</Text>
          <Title level={4} style={{ margin: 0 }}>HN: {patient.hn}</Title>
        </div>
      </div>

      {/* Patient info */}
      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Row gutter={24}>
          <Col xs={24} md={16}>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
              <Descriptions.Item label="สถานะ"><Tag color={STATUS_COLOR[patient.status]}>{STATUS_LABEL[patient.status]}</Tag></Descriptions.Item>
              <Descriptions.Item label="อายุ">{patient.age ?? '-'} ปี</Descriptions.Item>
              <Descriptions.Item label="เพศ">{patient.gender === 'MALE' ? 'ชาย' : patient.gender === 'FEMALE' ? 'หญิง' : '-'}</Descriptions.Item>
              <Descriptions.Item label="Zone">{patient.zone?.name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="Case Manager">{patient.caseManager?.displayName ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="โรคประจำตัว">{(patient.conditions ?? []).join(', ') || '-'}</Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      <Tabs
        items={[
          {
            key: 'diagnosis',
            label: <span><Stethoscope size={14} style={{ marginRight: 6 }} />การวินิจฉัย ({(patient.diagnoses ?? []).length})</span>,
            children: (
              <Card style={{ borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button type="primary" icon={<Plus size={14} />} onClick={() => setDiagModal(true)}>+ วินิจฉัย</Button>
                </div>
                <Table size="small" dataSource={patient.diagnoses ?? []} columns={diagColumns} rowKey="id"
                  pagination={{ pageSize: 10 }} locale={{ emptyText: 'ยังไม่มีการวินิจฉัย' }} />
              </Card>
            ),
          },
          {
            key: 'prescription',
            label: <span><Pill size={14} style={{ marginRight: 6 }} />ใบสั่งยา ({(patient.prescriptions ?? []).length})</span>,
            children: (
              <Card style={{ borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button type="primary" icon={<Plus size={14} />} onClick={() => setPrescModal(true)}>+ สั่งยา</Button>
                </div>
                <Table size="small" dataSource={patient.prescriptions ?? []} columns={prescColumns} rowKey="id"
                  pagination={{ pageSize: 10 }} locale={{ emptyText: 'ยังไม่มีใบสั่งยา' }} />
              </Card>
            ),
          },
        ]}
      />

      {/* Diagnosis Modal */}
      <Modal title="บันทึกการวินิจฉัย" open={diagModal} onCancel={() => { setDiagModal(false); diagForm.resetFields(); }} footer={null} width={520}>
        <Form form={diagForm} layout="vertical" onFinish={submitDiagnosis}>
          <Form.Item name="title" label="การวินิจฉัย" rules={[{ required: true, message: 'กรุณาระบุการวินิจฉัย' }]}>
            <Input placeholder="เช่น ความดันโลหิตสูง" />
          </Form.Item>
          <Form.Item name="description" label="รายละเอียด" rules={[{ required: true, message: 'กรุณาระบุรายละเอียด' }]}>
            <Input.TextArea rows={3} placeholder="อาการ สาเหตุ และแนวทางการรักษา" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="icd10" label="รหัส ICD-10">
                <Input placeholder="เช่น I10" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="severity" label="ระดับความรุนแรง">
                <Select allowClear options={[{ value: 'MILD', label: 'MILD (น้อย)' }, { value: 'MODERATE', label: 'MODERATE (ปานกลาง)' }, { value: 'SEVERE', label: 'SEVERE (รุนแรง)' }]} />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => { setDiagModal(false); diagForm.resetFields(); }}>ยกเลิก</Button>
            <Button type="primary" htmlType="submit" loading={saving}>บันทึก</Button>
          </div>
        </Form>
      </Modal>

      {/* Prescription Modal */}
      <Modal title="สั่งจ่ายยา" open={prescModal} onCancel={() => setPrescModal(false)} footer={null} width={700}>
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>ชื่อยา / ขนาด / ความถี่ / ระยะเวลา</Text>
        </div>
        {medications.map((med, i) => (
          <MedicationRow key={i} med={med} index={i} onChange={updateMed} onRemove={(idx: number) => setMedications((prev) => prev.filter((_, j) => j !== idx))} />
        ))}
        <Button size="small" onClick={() => setMedications((prev) => [...prev, { name: '', dosage: '', frequency: '', duration: '', notes: '' }])} style={{ marginBottom: 16 }}>
          + เพิ่มยา
        </Button>
        <Divider />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={() => setPrescModal(false)}>ยกเลิก</Button>
          <Button type="primary" onClick={submitPrescription} loading={saving}>บันทึกใบสั่งยา</Button>
        </div>
      </Modal>
    </div>
  );
}

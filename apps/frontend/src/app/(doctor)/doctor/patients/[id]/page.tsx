'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import {
  Button, Card, Col, Descriptions, Divider, Form, Input, Modal,
  Row, Select, Spin, Table, Tabs, Tag, Typography, message,
} from 'antd';
import { ArrowLeft, Stethoscope, Pill, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface MatchedMed {
  prescName: string;
  item: any | null;
  hasStock: boolean;
  quantity: number;
}
interface DispenseState {
  prescriptionId: string;
  rows: MatchedMed[];
  hasIssues: boolean;
}

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
  const [dispenseState, setDispenseState] = useState<DispenseState | null>(null);
  const [saving, setSaving] = useState(false);
  const [dispensing, setDispensing] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
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

  useEffect(() => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/inventory`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.ok ? r.json() : [])
      .then(setInventoryItems)
      .catch(() => {});
  }, [session?.accessToken]);

  function openDispense(prescription: any) {
    const rows: MatchedMed[] = (prescription.medications ?? []).map((med: any) => {
      const item = inventoryItems.find((inv) =>
        inv.name.toLowerCase().includes(med.name.toLowerCase()) ||
        med.name.toLowerCase().includes(inv.name.toLowerCase())
      ) ?? null;
      return { prescName: med.name, item, hasStock: !!item && item.currentStock > 0, quantity: 1 };
    });
    setDispenseState({
      prescriptionId: prescription.id,
      rows,
      hasIssues: rows.some((r) => !r.hasStock),
    });
  }

  function updateDispenseQty(index: number, qty: number) {
    setDispenseState((prev) => prev ? {
      ...prev,
      rows: prev.rows.map((r, i) => i === index ? { ...r, quantity: qty } : r),
    } : prev);
  }

  async function submitDispense() {
    if (!dispenseState) return;
    const toDeduct = dispenseState.rows.filter((r) => r.hasStock);
    setDispensing(true);
    try {
      const results = await Promise.all(
        toDeduct.map((r) =>
          fetch(`${API_URL}/inventory/${r.item.id}/deduct`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ quantity: r.quantity, type: 'OUT_PRESCRIPTION', patientId: id }),
          })
        )
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        const errs = await Promise.all(failed.map((r) => r.json().then((d: any) => d.message ?? 'เกิดข้อผิดพลาด')));
        message.error(errs.join(', '));
      } else {
        message.success('จ่ายยาสำเร็จ');
        setDispenseState(null);
        setInventoryItems((prev) =>
          prev.map((inv) => {
            const row = toDeduct.find((r) => r.item.id === inv.id);
            return row ? { ...inv, currentStock: inv.currentStock - row.quantity } : inv;
          })
        );
      }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setDispensing(false); }
  }

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
    {
      title: '', width: 100,
      render: (_: any, r: any) => (
        <Button size="small" type="primary" ghost onClick={() => openDispense(r)}>
          จ่ายยา →
        </Button>
      ),
    },
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
                  <Button type="primary" onClick={() => setDiagModal(true)}>+ วินิจฉัย</Button>
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
                  <Button type="primary" onClick={() => setPrescModal(true)}>+ สั่งยา</Button>
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

      {/* Dispense Modal */}
      <Modal
        title={`จ่ายยาสำหรับ HN: ${patient.hn}`}
        open={!!dispenseState}
        onCancel={() => setDispenseState(null)}
        onOk={dispenseState?.hasIssues ? undefined : submitDispense}
        okText={dispenseState?.hasIssues ? undefined : 'ยืนยันจ่ายยา'}
        okButtonProps={dispenseState?.hasIssues ? { style: { display: 'none' } } : undefined}
        cancelText="ปิด"
        confirmLoading={dispensing}
        width={500}
      >
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8c8c8c', marginBottom: 8, padding: '0 2px' }}>
          <span>ชื่อยา (ใบสั่งยา)</span>
          <span style={{ display: 'flex', gap: 64 }}><span>Stock</span><span style={{ minWidth: 56 }}>จำนวน</span></span>
        </div>

        {(dispenseState?.rows ?? []).map((row, i) => {
          const statusIcon = !row.item
            ? <span style={{ color: '#fa8c16', display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={14} /><span style={{ fontSize: 11 }}>ไม่พบในระบบ</span></span>
            : !row.hasStock
              ? <span style={{ color: '#ff4d4f', display: 'flex', alignItems: 'center', gap: 4 }}><XCircle size={14} /><span style={{ fontSize: 11 }}>หมดสต็อก</span></span>
              : <span style={{ color: '#52c41a', display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle size={14} /><span style={{ fontSize: 11 }}>พร้อม</span></span>;

          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 2px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: 500 }}>{row.prescName}</Text>
                {row.item && <div style={{ fontSize: 11, color: '#8c8c8c' }}>{row.item.name}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                {row.item
                  ? <span style={{ fontSize: 12, color: row.hasStock ? '#595959' : '#ff4d4f', minWidth: 70, textAlign: 'right' }}>
                      {row.item.currentStock} {row.item.unit}
                    </span>
                  : <span style={{ minWidth: 70 }} />
                }
                {row.hasStock
                  ? <input
                      type="number" min={1} max={row.item?.currentStock}
                      value={row.quantity}
                      onChange={(e) => updateDispenseQty(i, Math.max(1, Number(e.target.value)))}
                      style={{ width: 56, padding: '3px 6px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, textAlign: 'center' }}
                    />
                  : <span style={{ width: 56, display: 'inline-block' }} />
                }
                <span style={{ minWidth: 80 }}>{statusIcon}</span>
              </div>
            </div>
          );
        })}

        {dispenseState?.hasIssues && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff7e6', borderRadius: 6, border: '1px solid #ffd591', fontSize: 12, color: '#d46b08' }}>
            ⚠ ยาบางรายการไม่พร้อมจ่าย กรุณาจัดเตรียมเพิ่มเติมก่อน
          </div>
        )}
        {!dispenseState?.hasIssues && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f', fontSize: 12, color: '#389e0d' }}>
            ✓ ยาทุกรายการพร้อมจ่าย — ยืนยันเพื่อตัด stock ทันที
          </div>
        )}
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

'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import {
  Button, Card, Col, Collapse, Descriptions, Divider, Form, Input, InputNumber, Modal,
  Row, Select, Spin, Table, Tabs, Tag, Timeline, Typography, message,
} from 'antd';
import { ArrowLeft, Stethoscope, Pill, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { STATUS_OPTIONS } from '@/lib/patientStatus';
import PatientEditDrawer from '@/components/patients/PatientEditDrawer';

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

const SEVERITY_COLOR: Record<string, string> = { MILD: 'green', MODERATE: 'orange', SEVERE: 'red' };

function StatusSelector({ patientId, currentStatus, token, onUpdated }: { patientId: string; currentStatus: string; token: string; onUpdated: (s: string) => void }) {
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);

  async function handleUpdate() {
    if (status === currentStatus) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/patients/${patientId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (res.ok) { message.success('อัปเดตสถานะแล้ว'); onUpdated(status); }
      else message.error('อัปเดตไม่สำเร็จ');
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Select value={status} onChange={setStatus} size="small" style={{ width: 140 }} options={STATUS_OPTIONS} />
      <Button size="small" type="primary" loading={saving} disabled={status === currentStatus} onClick={handleUpdate}>อัปเดต</Button>
    </span>
  );
}

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
  const [activities, setActivities] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
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

  const loadActivities = useCallback(() => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/patients/${id}/activities`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((r) => r.ok ? r.json() : []).then(setActivities).catch(() => {});
  }, [id, session?.accessToken]);

  useEffect(() => {
    if (!session?.accessToken) return;
    const h = { Authorization: `Bearer ${session.accessToken}` };
    fetch(`${API_URL}/inventory`, { headers: h }).then((r) => r.ok ? r.json() : []).then(setInventoryItems).catch(() => {});
    loadActivities();
    fetch(`${API_URL}/patients/${id}/submissions`, { headers: h }).then((r) => r.ok ? r.json() : []).then(setSubmissions).catch(() => {});
    fetch(`${API_URL}/patients/${id}/assessment?limit=50`, { headers: h }).then((r) => r.ok ? r.json() : { data: [] }).then((res) => setAssessments(res.data ?? [])).catch(() => {});
  }, [session?.accessToken, id, loadActivities]);

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
        loadActivities();
      }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setDispensing(false); }
  }

  async function submitDiagnosis(values: any) {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/doctor/patients/${id}/diagnoses`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(values) });
      if (res.ok) { message.success('บันทึกการวินิจฉัยแล้ว'); setDiagModal(false); diagForm.resetFields(); load(); loadActivities(); }
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
      if (res.ok) { message.success('บันทึกใบสั่งยาแล้ว'); setPrescModal(false); setMedications([{ name: '', dosage: '', frequency: '', duration: '', notes: '' }]); load(); loadActivities(); }
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

  function DiagExpandedRow({ record }: { record: any }) {
    const vs = record.vitalSigns;
    const hasHistory = record.chiefComplaint || record.presentIllness || vs || record.physicalExam || record.treatmentPlan;
    if (!hasHistory) return <Text type="secondary" style={{ fontSize: 12 }}>ไม่มีข้อมูลประวัติเพิ่มเติม</Text>;
    return (
      <div style={{ padding: '8px 4px', display: 'grid', gap: 8 }}>
        {record.chiefComplaint && (
          <div><Text type="secondary" style={{ fontSize: 11 }}>อาการสำคัญ: </Text><Text style={{ fontSize: 12 }}>{record.chiefComplaint}</Text></div>
        )}
        {record.presentIllness && (
          <div><Text type="secondary" style={{ fontSize: 11 }}>ประวัติปัจจุบัน: </Text><Text style={{ fontSize: 12 }}>{record.presentIllness}</Text></div>
        )}
        {vs && (
          <div>
            <Text type="secondary" style={{ fontSize: 11 }}>สัญญาณชีพ: </Text>
            <Text style={{ fontSize: 12 }}>
              {[
                vs.bp && `BP ${vs.bp} mmHg`,
                vs.hr && `HR ${vs.hr} /min`,
                vs.temp && `T ${vs.temp}°C`,
                vs.rr && `RR ${vs.rr} /min`,
                vs.o2sat && `SpO₂ ${vs.o2sat}%`,
                vs.weight && `BW ${vs.weight} kg`,
              ].filter(Boolean).join('  |  ')}
            </Text>
          </div>
        )}
        {record.physicalExam && (
          <div><Text type="secondary" style={{ fontSize: 11 }}>ตรวจร่างกาย: </Text><Text style={{ fontSize: 12 }}>{record.physicalExam}</Text></div>
        )}
        {record.treatmentPlan && (
          <div><Text type="secondary" style={{ fontSize: 11 }}>แผนการรักษา: </Text><Text style={{ fontSize: 12 }}>{record.treatmentPlan}</Text></div>
        )}
      </div>
    );
  }

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
    <div style={{ padding: '16px 12px', fontFamily: "'Sarabun', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button icon={<ArrowLeft size={15} />} onClick={() => router.push('/doctor/patients')} type="text" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 11, color: '#0ea5e9', fontWeight: 600, textTransform: 'uppercase' }}>Doctor Portal</Text>
          <Title level={4} style={{ margin: 0, wordBreak: 'break-word' }}>{patient.name}</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>HN: {patient.hn}</Text>
        </div>
        <PatientEditDrawer
          patientId={id!}
          token={session?.accessToken ?? ''}
          initialValues={{
            name: patient.name ?? '',
            age: patient.age,
            gender: patient.gender,
            status: patient.status,
            locationText: patient.locationText,
            conditions: patient.conditions ?? [],
            initialComplaint: patient.initialComplaint,
            phone: patient.phone,
            birthDate: patient.birthDate,
            nationalId: patient.nationalId,
          }}
          onSuccess={load}
        />
      </div>

      {/* Patient info */}
      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
          <Descriptions.Item label="สถานะ">
            <StatusSelector
              patientId={id!}
              currentStatus={patient.status}
              token={session?.accessToken ?? ''}
              onUpdated={(s) => setPatient((p: any) => ({ ...p, status: s }))}
            />
          </Descriptions.Item>
          <Descriptions.Item label="อายุ">{patient.age ?? '-'} ปี</Descriptions.Item>
          <Descriptions.Item label="เพศ">{patient.gender === 'MALE' ? 'ชาย' : patient.gender === 'FEMALE' ? 'หญิง' : '-'}</Descriptions.Item>
          <Descriptions.Item label="Zone">{patient.zone?.name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="Case Manager">{patient.caseManager?.displayName ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="โรคประจำตัว" span={3}>{(patient.conditions ?? []).join(', ') || '-'}</Descriptions.Item>
          {patient.initialComplaint && (
            <Descriptions.Item label="อาการเบื้องต้น" span={3}>{patient.initialComplaint}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      <Tabs
        items={[
          {
            key: 'diagnosis',
            label: <div className="flex items-center"><Stethoscope size={14} style={{ marginRight: 6 }} />การวินิจฉัย ({(patient.diagnoses ?? []).length})</div>,
            children: (
              <Card style={{ borderRadius: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <Button type="primary" onClick={() => setDiagModal(true)}>+ วินิจฉัย</Button>
                </div>
                <Table size="small" dataSource={patient.diagnoses ?? []} columns={diagColumns} rowKey="id"
                  pagination={{ pageSize: 10 }} locale={{ emptyText: 'ยังไม่มีการวินิจฉัย' }}
                  expandable={{
                    expandedRowRender: (record) => <DiagExpandedRow record={record} />,
                    rowExpandable: (r: any) => !!(r.chiefComplaint || r.presentIllness || r.vitalSigns || r.physicalExam || r.treatmentPlan),
                  }}
                />
              </Card>
            ),
          },
          {
            key: 'prescription',
            label: <div className="flex items-center"><Pill size={14} style={{ marginRight: 6 }} />ใบสั่งยา ({(patient.prescriptions ?? []).length})</div>,
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
          {
            key: 'timeline',
            label: `Timeline (${activities.length})`,
            children: (
              <Card style={{ borderRadius: 12 }}>
                {!activities.length
                  ? <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มีกิจกรรม</Text>
                  : <Timeline items={activities.slice(0, 50).map((a: any) => {
                      const COLOR: Record<string, string> = {
                        CHECK_IN: '#1677ff', NOTE: '#722ed1', FORM_SUBMIT: '#13c2c2',
                        ASSIGN: '#faad14', STATUS_CHANGE: '#ff4d4f', SOS: '#ff0000',
                        DIAGNOSIS: '#0ea5e9', PRESCRIPTION: '#7c3aed', DISPENSE: '#059669',
                      };
                      const LABEL: Record<string, string> = {
                        CHECK_IN: 'เช็คอิน', NOTE: 'บันทึก', FORM_SUBMIT: 'ส่งแบบฟอร์ม',
                        ASSIGN: 'มอบหมาย', STATUS_CHANGE: 'เปลี่ยนสถานะ', SOS: 'SOS',
                        DIAGNOSIS: 'วินิจฉัย', PRESCRIPTION: 'สั่งยา', DISPENSE: 'จ่ายยา',
                      };
                      const p = a.payload ?? {};
                      return {
                        color: COLOR[a.type] ?? '#d9d9d9',
                        children: (
                          <div>
                            <Text style={{ fontSize: 13 }}>{a.actor?.displayName}</Text>
                            <Tag color={COLOR[a.type] ? undefined : 'default'} style={{ marginLeft: 8, fontSize: 10, backgroundColor: COLOR[a.type] ? `${COLOR[a.type]}20` : undefined, borderColor: COLOR[a.type], color: COLOR[a.type] }}>
                              {LABEL[a.type] ?? a.type}
                            </Tag>
                            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{new Date(a.createdAt).toLocaleString('th-TH')}</div>
                            {a.type === 'DIAGNOSIS' && p.title && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>🩺 {p.title}{p.severity ? ` (${p.severity})` : ''}</div>}
                            {a.type === 'PRESCRIPTION' && p.medications && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>💊 {p.medications}</div>}
                            {a.type === 'DISPENSE' && p.itemName && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>📦 {p.itemName} × {p.quantity}</div>}
                            {a.type === 'STATUS_CHANGE' && p.status && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>→ {p.status}</div>}
                            {p.note && <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{p.note}</div>}
                          </div>
                        ),
                      };
                    })}
                  />
                }
              </Card>
            ),
          },
          {
            key: 'submissions',
            label: `แบบสอบถาม (${submissions.length})`,
            children: (
              <Card style={{ borderRadius: 12 }}>
                {!submissions.length
                  ? <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มีการส่งแบบฟอร์ม</Text>
                  : <Collapse items={submissions.slice(0, 20).map((s: any) => ({
                      key: s.id,
                      label: (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>{new Date(s.submittedAt).toLocaleDateString('th-TH')}</Text>
                          <Text strong style={{ flex: 1, fontSize: 13 }}>{s.formTemplate?.title}</Text>
                          <Text type="secondary" style={{ fontSize: 11 }}>{s.submittedBy?.displayName}</Text>
                        </div>
                      ),
                      children: (
                        <div style={{ display: 'grid', gap: 6 }}>
                          {(s.answers ?? []).map((ans: any, i: number) => (
                            <div key={i}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>{ans.fieldId}</div>
                              <div style={{ fontSize: 12, padding: '3px 8px', background: '#f5f5f5', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>{String(ans.value)}</div>
                            </div>
                          ))}
                        </div>
                      ),
                    }))}
                  />
                }
              </Card>
            ),
          },
          {
            key: 'careplan',
            label: `Care Plan (${assessments.length})`,
            children: (
              <Card style={{ borderRadius: 12 }}>
                {!assessments.length
                  ? <Text type="secondary" style={{ fontSize: 12 }}>ยังไม่มีข้อมูลการประเมิน</Text>
                  : <Table
                      size="small"
                      dataSource={assessments}
                      rowKey="id"
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'วันที่พบ', dataIndex: 'assessmentDate', width: 120, render: (v: string, r: any) => v ? new Date(v).toLocaleDateString('th-TH') : new Date(r.createdAt).toLocaleDateString('th-TH') },
                        { title: 'สถานะ', dataIndex: 'status', width: 100, render: (v: string) => v ? <Tag color={({ Active: 'green', 'Follow-up': 'blue', Missing: 'orange', Closed: 'default' } as any)[v] ?? 'default'}>{v}</Tag> : '-' },
                        { title: 'เป้าหมาย', dataIndex: 'helpGoal', render: (v: string) => v ? <Tag color="purple">{v}</Tag> : '-' },
                        { title: 'สถานที่พบ', dataIndex: 'locationFound', render: (v: string) => v ?? '-' },
                        { title: 'ประเภทไร้บ้าน', dataIndex: 'homelessType', render: (v: string) => v ?? '-' },
                        { title: 'สิทธิรักษา', dataIndex: 'healthcareRight', width: 110, render: (v: string) => v ?? '-' },
                      ]}
                    />
                }
              </Card>
            ),
          },
        ]}
      />

      {/* Diagnosis Modal */}
      <Modal
        title="บันทึกประวัติและการวินิจฉัย"
        open={diagModal}
        onCancel={() => { setDiagModal(false); diagForm.resetFields(); }}
        footer={null}
        width={680}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
      >
        <Form form={diagForm} layout="vertical" onFinish={submitDiagnosis}>

          {/* ── ประวัติผู้ป่วย ── */}
          <Divider style={{ fontSize: 13, color: '#1677ff', margin: '0 0 12px', borderColor: '#e6f4ff' }}><Text style={{ fontSize: 13, color: '#1677ff', fontWeight: 600 }}>ประวัติผู้ป่วย</Text></Divider>

          <Form.Item name="chiefComplaint" label="อาการสำคัญ (Chief Complaint)">
            <Input placeholder="เช่น ปวดศีรษะ เวียนหัว 3 วัน" />
          </Form.Item>

          <Form.Item name="presentIllness" label="ประวัติปัจจุบัน (Present Illness)">
            <Input.TextArea rows={3} placeholder="ลักษณะอาการ ระยะเวลา ปัจจัยที่เกี่ยวข้อง..." />
          </Form.Item>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.88)', display: 'block', marginBottom: 8 }}>
              สัญญาณชีพ (Vital Signs)
            </label>
            <Row gutter={[8, 8]}>
              <Col xs={12} sm={8}>
                <Form.Item name={['vitalSigns', 'bp']} label="ความดันโลหิต (mmHg)" style={{ marginBottom: 0 }}>
                  <Input placeholder="120/80" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name={['vitalSigns', 'hr']} label="ชีพจร (ครั้ง/นาที)" style={{ marginBottom: 0 }}>
                  <InputNumber min={0} max={300} style={{ width: '100%' }} placeholder="72" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name={['vitalSigns', 'temp']} label="อุณหภูมิ (°C)" style={{ marginBottom: 0 }}>
                  <InputNumber min={30} max={45} step={0.1} style={{ width: '100%' }} placeholder="37.0" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name={['vitalSigns', 'rr']} label="อัตราหายใจ (ครั้ง/นาที)" style={{ marginBottom: 0 }}>
                  <InputNumber min={0} max={60} style={{ width: '100%' }} placeholder="18" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name={['vitalSigns', 'o2sat']} label="O₂ Saturation (%)" style={{ marginBottom: 0 }}>
                  <InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="98" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={8}>
                <Form.Item name={['vitalSigns', 'weight']} label="น้ำหนัก (กก.)" style={{ marginBottom: 0 }}>
                  <InputNumber min={0} max={300} step={0.1} style={{ width: '100%' }} placeholder="60" />
                </Form.Item>
              </Col>
            </Row>
          </div>

          <Form.Item name="physicalExam" label="ผลการตรวจร่างกาย (Physical Examination)">
            <Input.TextArea rows={3} placeholder="ผลการตรวจระบบต่างๆ เช่น หัวใจ ปอด ช่องท้อง..." />
          </Form.Item>

          {/* ── การวินิจฉัย ── */}
          <Divider style={{ fontSize: 13, color: '#1677ff', margin: '4px 0 12px', borderColor: '#e6f4ff' }}><Text style={{ fontSize: 13, color: '#1677ff', fontWeight: 600 }}>การวินิจฉัย</Text></Divider>

          <Form.Item name="title" label="การวินิจฉัย" rules={[{ required: true, message: 'กรุณาระบุการวินิจฉัย' }]}>
            <Input placeholder="เช่น ความดันโลหิตสูง Stage 2" />
          </Form.Item>

          <Form.Item name="description" label="รายละเอียด" rules={[{ required: true, message: 'กรุณาระบุรายละเอียด' }]}>
            <Input.TextArea rows={2} placeholder="สาเหตุ ผลการวิเคราะห์ และแนวทางการดูแล" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="icd10" label="รหัส ICD-10">
                <Input placeholder="เช่น I10" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="severity" label="ระดับความรุนแรง">
                <Select allowClear options={[
                  { value: 'MILD', label: 'MILD (น้อย)' },
                  { value: 'MODERATE', label: 'MODERATE (ปานกลาง)' },
                  { value: 'SEVERE', label: 'SEVERE (รุนแรง)' },
                ]} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="treatmentPlan" label="แผนการรักษา (Treatment Plan)">
            <Input.TextArea rows={2} placeholder="แนวทางการรักษา การนัดติดตาม และคำแนะนำ..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <Button onClick={() => { setDiagModal(false); diagForm.resetFields(); }}>ยกเลิก</Button>
            <Button type="primary" htmlType="submit" loading={saving}>บันทึก</Button>
          </div>
        </Form>
      </Modal>

      {/* Dispense Modal */}
      <Modal
        title={`จ่ายยาสำหรับ ${patient.name} (HN: ${patient.hn})`}
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

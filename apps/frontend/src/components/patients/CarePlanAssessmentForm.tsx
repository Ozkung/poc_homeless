'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Form, Input, Radio, Checkbox, Button, Card, Divider, Space,
  DatePicker, message, Spin, Typography, Row, Col,
} from 'antd';
import { ArrowLeft, Save } from 'lucide-react';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const LOCATION_OPTIONS = [
  'ตรอกสาเก', 'บ้านอิ่มใจ', 'สดชื่นสถาน', 'ใต้สะพานปิ่นเกล้าฝั่งธน',
  'หัวลำโพง', 'สวนลุมพินี', 'พระแม่ธรณี', 'หน้าวัดบุรณศิริมาตยาราม',
  'อนุสาวรีย์พฤษภาทมิฬ', 'วงเวียน 22', 'รถไฟยมราช', 'ลานคนเมือง',
  'หน้าบ้านรักแท้',
];
const CARE_SETTING_OPTIONS = [
  'Roadside', 'Respite Care', 'Community/Rent',
  'Government Shelter', 'Non-Governmental Shelter (NGO)',
];
const REFERRAL_OPTIONS = [
  'Field Outreach / ลงพื้นที่', 'Mobile Clinic',
  'Walk-in / ติดต่อขอรับบริการเอง', 'ผู้ดูแลสุขภาพเพื่อนไร้บ้าน',
  'กระจกเงา', 'อิสรชน', 'รักแท้', 'อิ่มใจ',
  'Hospital Referral / โรงพยาบาลส่งต่อ',
];
const HOMELESS_TYPE_OPTIONS = [
  'คนไร้บ้านหน้าเก่า (2ปี+)', 'คนไร้บ้านหน้าใหม่ (2ปี-)', 'คนจนเมือง',
];
const HEALTHCARE_RIGHT_OPTIONS = [
  'บัตรทอง', 'ประกันสังคม', 'ข้าราชการ',
  'สิทธิผู้พิการ (ไปได้ทุกที่)', 'สิทธิอื่นๆ', 'ไม่มีสิทธิ', 'ไม่ทราบสิทธิ',
];
const NCD_OPTIONS = [
  'เบาหวาน / Diabetes', 'ความดันโลหิตสูง / Hypertension', 'โรคหัวใจ / Heart Disease',
  'หลอดเลือดสมอง (อัมพฤกษ์/อัมพาต) / Stroke', 'โรคไต (ต้องฟอกไต) / Kidney Disease',
  'หอบหืด / ถุงลมโป่งพอง / Asthma & COPD', 'มะเร็ง / Cancer',
];
const INFECTIOUS_OPTIONS = [
  'วัณโรค (TB) / Tuberculosis', 'เอชไอวี (HIV/AIDS)',
  'ตับอักเสบ / Hepatitis', 'โรคติดต่อทางผิวหนัง / Skin Infections',
];
const MENTAL_OPTIONS = [
  'จิตเวช (จิตเภท, ซึมเศร้า) / Psychiatric Disorders',
  'ลมชัก / Epilepsy', 'สมองเสื่อม / พัฒนาการช้า / Dementia',
];
const SUBSTANCE_OPTIONS = ['ติดสุรา / Alcohol Addiction', 'ติดสารเสพติด / Drug Addiction'];
const DISABILITY_OPTIONS = [
  'ผู้ป่วยติดเตียง / Bedridden',
  'บาดแผลติดเชื้อ / แผลกดทับ / Infected Wounds & Bedsores',
  'กระดูกหัก / สูญเสียอวัยวะ / Fractures & Amputation',
  'ตาบอด / หูหนวก / Blindness & Deafness',
];
const OTHER_CONDITION_CATEGORIES = [
  'กลุ่มโรคเรื้อรัง / NCDs', 'กลุ่มโรคติดต่อ / Infectious Diseases',
  'กลุ่มสุขภาพจิตและระบบประสาท / Mental & Neurological',
  'กลุ่มสารเสพติด / Substance Use',
  'ความพิการและอุบัติเหตุ / Disability & Injuries',
];
const MEDICAL_GOAL_OPTIONS = [
  'รักษาอาการเจ็บป่วยฉุกเฉิน/อุบัติเหตุ', 'ควบคุมโรคประจำตัว',
  'ประเมินและรักษาทางจิตเวช', 'บำบัดสารเสพติด/แอลกอฮอล์',
  'รับยาและกินยาได้ต่อเนื่อง', 'ฟื้นฟูทางร่างกาย/รับอุปกรณ์ช่วยความพิการ',
  'ตรวจคัดกรองโรคติดต่อ', 'การดูแลระยะยาว/ประคับประคอง',
];
const SOCIAL_GOAL_OPTIONS = [
  'เข้าถึงสิทธิการรักษาพยาบาล', 'จัดหาที่พักพิงฉุกเฉิน/ชั่วคราว',
  'จัดหาที่อยู่อาศัยถาวร/เช่าห้อง', 'ทำบัตรประชาชน',
  'ทำบัตรประชาชน (หาย)', 'ปัญหาสิทธิและทะเบียนบ้าน',
  'ลงทะเบียนรับสวัสดิการรัฐ (คนพิการ/เบี้ยยังชีพ)',
  'ค้นหาและติดต่อญาติ/ครอบครัว', 'ประเมินและเตรียมความพร้อมคืนสู่ครอบครัว',
  'ฝึกอาชีพ/จัดหางาน/สร้างรายได้', 'มอบสิ่งของยังชีพพื้นฐาน',
  'ฟื้นฟูทักษะการใช้ชีวิตในสังคม', 'สนับสนุนการศึกษา',
];

function SectionCard({ title, color = '#1677ff', children }: { title: string; color?: string; children: React.ReactNode }) {
  return (
    <Card
      style={{ marginBottom: 20, borderTop: `3px solid ${color}` }}
      styles={{ header: { borderBottom: '1px solid #f0f0f0' } }}
      title={<Text strong style={{ color }}>{title}</Text>}
    >
      {children}
    </Card>
  );
}

function CheckboxGroup({ options, name }: { options: string[]; name: string }) {
  return (
    <Form.Item name={name} style={{ marginBottom: 0 }}>
      <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {options.map((o) => <Checkbox key={o} value={o}>{o}</Checkbox>)}
      </Checkbox.Group>
    </Form.Item>
  );
}

export default function CarePlanAssessmentForm() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const assessmentId = searchParams.get('id');
  const isEdit = !!assessmentId;
  const router = useRouter();
  const { data: session } = useSession();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [helpGoal, setHelpGoal] = useState<string | null>(null);

  const headers = useCallback(() => ({
    Authorization: `Bearer ${session?.accessToken ?? ''}`,
    'Content-Type': 'application/json',
  }), [session?.accessToken]);

  useEffect(() => {
    if (!isEdit || !session?.accessToken) return;
    fetch(`${API_URL}/patients/${id}/assessment/${assessmentId}`, { headers: headers() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          form.setFieldsValue({
            ...data,
            assessmentDate: data.assessmentDate ? dayjs(data.assessmentDate) : undefined,
          });
          setHelpGoal(data.helpGoal ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, assessmentId, isEdit, session?.accessToken, form, headers]);

  async function handleSave(values: any) {
    setSaving(true);
    try {
      const payload = {
        ...values,
        assessmentDate: values.assessmentDate ? values.assessmentDate.toISOString() : undefined,
      };
      const url = isEdit
        ? `${API_URL}/patients/${id}/assessment/${assessmentId}`
        : `${API_URL}/patients/${id}/assessment`;
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        message.success(isEdit ? 'อัปเดตแบบประเมินแล้ว' : 'บันทึกแบบประเมินแล้ว');
        router.back();
      } else {
        message.error('บันทึกไม่สำเร็จ');
      }
    } catch {
      message.error('เกิดข้อผิดพลาด');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', paddingTop: 80 }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px', fontFamily: "'Sarabun', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeft size={16} />} onClick={() => router.back()} type="text" />
        <Title level={4} style={{ margin: 0 }}>
          {isEdit ? 'แก้ไขแบบประเมิน' : 'เพิ่มแบบประเมินใหม่'}
        </Title>
      </div>

      <Form form={form} layout="vertical" onFinish={handleSave}>

        {/* ── Section 1: ข้อมูลเบื้องต้น ── */}
        <SectionCard title="ข้อมูลเบื้องต้น" color="#1677ff">
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="assessmentDate" label="วันที่พบ">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="status" label="สถานะ (Status)" rules={[{ required: true, message: 'กรุณาเลือกสถานะ' }]}>
                <Radio.Group>
                  <Space direction="vertical">
                    {['Active', 'Follow-up', 'Missing', 'Closed'].map((s) => (
                      <Radio key={s} value={s}>
                        {s}
                        {s === 'Follow-up' && <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>ตามห่าง ๆ 3 เดือน</Text>}
                        {s === 'Missing' && <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>ไม่เกิน 2 สัปดาห์</Text>}
                      </Radio>
                    ))}
                  </Space>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="locationFound" label="Location Found — สถานที่พบ" rules={[{ required: true, message: 'กรุณาเลือกสถานที่' }]}>
            <Radio.Group>
              <Space direction="vertical">
                {LOCATION_OPTIONS.map((l) => <Radio key={l} value={l}>{l}</Radio>)}
                <Radio value="อื่นๆ">อื่นๆ</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
        </SectionCard>

        {/* ── Section 2: Care Setting & Referral ── */}
        <SectionCard title="Care Setting & Referral Source" color="#722ed1">
          <Form.Item name="careSetting" label="Care Setting — สถานที่รับการดูแล" rules={[{ required: true, message: 'กรุณาเลือก' }]}>
            <Radio.Group>
              <Space direction="vertical">
                {CARE_SETTING_OPTIONS.map((o) => <Radio key={o} value={o}>{o}</Radio>)}
                <Radio value="อื่นๆ">อื่นๆ</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          <Divider />

          <Form.Item name="referralSource" label="Referral Source — ช่องทางการรับเคส" rules={[{ required: true, message: 'กรุณาเลือก' }]}>
            <Radio.Group>
              <Space direction="vertical">
                {REFERRAL_OPTIONS.map((o) => <Radio key={o} value={o}>{o}</Radio>)}
                <Radio value="อื่นๆ">อื่นๆ</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>
        </SectionCard>

        {/* ── Section 3: ข้อมูลผู้ป่วย ── */}
        <SectionCard title="ข้อมูลผู้ป่วย" color="#389e0d">
          <Form.Item name="homelessType" label="ประเภทการไร้บ้าน">
            <Radio.Group>
              <Space direction="vertical">
                {HOMELESS_TYPE_OPTIONS.map((o) => <Radio key={o} value={o}>{o}</Radio>)}
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} placeholder="บันทึกเพิ่มเติม" />
          </Form.Item>

          <Form.Item name="healthcareRight" label="สิทธิรักษาพยาบาล" rules={[{ required: true, message: 'กรุณาเลือก' }]}>
            <Radio.Group>
              <Space direction="vertical">
                {HEALTHCARE_RIGHT_OPTIONS.map((o) => <Radio key={o} value={o}>{o}</Radio>)}
              </Space>
            </Radio.Group>
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="primaryCareUnit" label="หน่วยบริการปฐมภูมิ">
                <Input placeholder="ชื่อหน่วยบริการ" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="referralUnit" label="หน่วยบริการรับส่งต่อ">
                <Input placeholder="ชื่อหน่วยบริการ" />
              </Form.Item>
            </Col>
          </Row>
        </SectionCard>

        {/* ── Section 4: โรคประจำตัว ── */}
        <SectionCard title="โรคประจำตัว (Medical Conditions)" color="#c41d7f">
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            เลือกทุกข้อที่ตรงกับสภาวะของผู้ป่วย
          </Text>

          <Text strong style={{ display: 'block', marginBottom: 8 }}>กลุ่มโรคเรื้อรัง (NCDs)</Text>
          <CheckboxGroup options={NCD_OPTIONS} name="ncdConditions" />
          <Divider />

          <Text strong style={{ display: 'block', marginBottom: 8 }}>กลุ่มโรคติดต่อ (Infectious Diseases)</Text>
          <CheckboxGroup options={INFECTIOUS_OPTIONS} name="infectiousConditions" />
          <Divider />

          <Text strong style={{ display: 'block', marginBottom: 8 }}>กลุ่มสุขภาพจิตและระบบประสาท (Mental & Neurological)</Text>
          <CheckboxGroup options={MENTAL_OPTIONS} name="mentalConditions" />
          <Divider />

          <Text strong style={{ display: 'block', marginBottom: 8 }}>กลุ่มสารเสพติด (Substance Use)</Text>
          <CheckboxGroup options={SUBSTANCE_OPTIONS} name="substanceConditions" />
          <Divider />

          <Text strong style={{ display: 'block', marginBottom: 8 }}>ความพิการและอุบัติเหตุ (Disability & Injuries)</Text>
          <CheckboxGroup options={DISABILITY_OPTIONS} name="disabilityConditions" />
          <Divider />

          <Text strong style={{ display: 'block', marginBottom: 8 }}>อื่น ๆ (โปรดระบุประเภท)</Text>
          <CheckboxGroup options={OTHER_CONDITION_CATEGORIES} name="otherConditionCategories" />

          <Divider />
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="conditionNote" label="โรคประจำตัว (ระบุเพิ่มเติม)">
                <Input.TextArea rows={2} placeholder="ระบุโรคประจำตัวเพิ่มเติม" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="mentalConditionNote" label="โรคประจำตัวทางจิต (ระบุ)">
                <Input.TextArea rows={2} placeholder="ระบุโรคทางจิตเพิ่มเติม" />
              </Form.Item>
            </Col>
          </Row>
        </SectionCard>

        {/* ── Section 5: เป้าหมายการช่วยเหลือ ── */}
        <SectionCard title="เป้าหมายการช่วยเหลือ" color="#d46b08">
          <Form.Item
            name="helpGoal"
            label="เป้าหมายการช่วยเหลือ"
            rules={[{ required: true, message: 'กรุณาเลือก' }]}
          >
            <Radio.Group onChange={(e) => setHelpGoal(e.target.value)}>
              <Space direction="vertical">
                <Radio value="ทางการแพทย์">ทางการแพทย์</Radio>
                <Radio value="ทางสังคม">ทางสังคม</Radio>
                <Radio value="ทางการแพทย์และทางสังคม">ทางการแพทย์และทางสังคม</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          {(helpGoal === 'ทางการแพทย์' || helpGoal === 'ทางการแพทย์และทางสังคม') && (
            <Card
              size="small"
              style={{ background: '#fff7e6', border: '1px solid #ffd591', marginBottom: 16 }}
              title={<Text strong style={{ color: '#d46b08' }}>เป้าหมายทางการแพทย์</Text>}
            >
              <Form.Item name="medicalGoals" style={{ marginBottom: 8 }}>
                <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {MEDICAL_GOAL_OPTIONS.map((o) => <Checkbox key={o} value={o}>{o}</Checkbox>)}
                  <Checkbox value="อื่นๆ">อื่นๆ</Checkbox>
                </Checkbox.Group>
              </Form.Item>
              <Form.Item name="medicalGoalOther" label="อื่นๆ (ระบุ)" style={{ marginBottom: 0 }}>
                <Input placeholder="ระบุเป้าหมายทางการแพทย์เพิ่มเติม" />
              </Form.Item>
            </Card>
          )}

          {(helpGoal === 'ทางสังคม' || helpGoal === 'ทางการแพทย์และทางสังคม') && (
            <Card
              size="small"
              style={{ background: '#f9f0ff', border: '1px solid #d3adf7' }}
              title={<Text strong style={{ color: '#722ed1' }}>เป้าหมายทางสังคม</Text>}
            >
              <Form.Item name="socialGoals" style={{ marginBottom: 8 }}>
                <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SOCIAL_GOAL_OPTIONS.map((o) => <Checkbox key={o} value={o}>{o}</Checkbox>)}
                  <Checkbox value="อื่นๆ">อื่นๆ</Checkbox>
                </Checkbox.Group>
              </Form.Item>
              <Form.Item name="socialGoalOther" label="อื่นๆ (ระบุ)" style={{ marginBottom: 0 }}>
                <Input placeholder="ระบุเป้าหมายทางสังคมเพิ่มเติม" />
              </Form.Item>
            </Card>
          )}
        </SectionCard>

        {/* ── Submit ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, paddingBottom: 40 }}>
          <Button onClick={() => router.back()}>ยกเลิก</Button>
          <Button type="primary" htmlType="submit" loading={saving} icon={<Save size={14} />}>
            บันทึกแผนการดูแล
          </Button>
        </div>

      </Form>
    </div>
  );
}

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createCipheriv, randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();
const ENC_KEY = process.env.ENCRYPTION_KEY ?? '0'.repeat(64);

function encrypt(plaintext: string): string {
  const key = Buffer.from(ENC_KEY, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

const hash = (pw: string) => bcrypt.hash(pw, 12);
const ago  = (d: number) => new Date(Date.now() - d * 86_400_000);
const fwd  = (d: number) => new Date(Date.now() + d * 86_400_000);

async function main() {
  console.log('🌱 Seeding database...');

  // ── Organisation ──────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where:  { id: 'org-seed-001' },
    update: {},
    create: { id: 'org-seed-001', name: 'โรงพยาบาลชุมชนกรุงเทพ' },
  });
  console.log(`✓ Organisation: ${org.name}`);

  // ── Users (with phone + gender) ───────────────────────────────────────────
  const [adminPw, saPw, cmPw, fwPw, mvPw] = await Promise.all([
    hash('Admin1234!'), hash('SuperAdmin1!'), hash('CaseManager1!'),
    hash('FieldWork1!'),  hash('MedVol1234!'),
  ]);

  const admin = await prisma.user.upsert({
    where:  { email: 'admin@hospital.th' },
    update: { phone: '02-000-1234', gender: 'MALE' },
    create: {
      id: 'user-seed-admin', organizationId: org.id,
      email: 'admin@hospital.th', passwordHash: adminPw,
      role: 'ADMIN', displayName: 'ผู้ดูแลระบบ',
      phone: '02-000-1234', gender: 'MALE',
    },
  });

  await prisma.user.upsert({
    where:  { email: 'sa@hospital.th' },
    update: { phone: '081-999-8888', gender: 'FEMALE' },
    create: {
      id: 'user-seed-sa', organizationId: org.id,
      email: 'sa@hospital.th', passwordHash: saPw,
      role: 'SUPER_ADMIN', displayName: 'ผู้อำนวยการ สุดา',
      phone: '081-999-8888', gender: 'FEMALE',
    },
  });

  const cm1 = await prisma.user.upsert({
    where:  { email: 'cm1@hospital.th' },
    update: { phone: '081-234-5678', gender: 'MALE' },
    create: {
      id: 'user-seed-cm1', organizationId: org.id,
      email: 'cm1@hospital.th', passwordHash: cmPw,
      role: 'CASE_MANAGER', displayName: 'นายสมชาย ดูแลดี',
      phone: '081-234-5678', gender: 'MALE',
    },
  });

  const cm2 = await prisma.user.upsert({
    where:  { email: 'cm2@hospital.th' },
    update: { phone: '089-876-5432', gender: 'FEMALE' },
    create: {
      id: 'user-seed-cm2', organizationId: org.id,
      email: 'cm2@hospital.th', passwordHash: cmPw,
      role: 'CASE_MANAGER', displayName: 'น.ส.มาลี ใจดี',
      phone: '089-876-5432', gender: 'FEMALE',
    },
  });

  const fw1 = await prisma.user.upsert({
    where:  { email: 'fw1@hospital.th' },
    update: { phone: '062-345-6789', gender: 'MALE', supervisorId: 'user-seed-cm1' },
    create: {
      id: 'user-seed-fw1', organizationId: org.id,
      email: 'fw1@hospital.th', passwordHash: fwPw,
      role: 'FIELD_WORKER', displayName: 'นายประยุทธ ลงพื้นที่',
      phone: '062-345-6789', gender: 'MALE',
      supervisorId: 'user-seed-cm1',
    },
  });

  const [fw2Pw, fw3Pw] = await Promise.all([hash('FieldWork2!'), hash('FieldWork3!')]);

  const fw2 = await prisma.user.upsert({
    where:  { email: 'fw2@hospital.th' },
    update: { supervisorId: 'user-seed-cm1' },
    create: {
      id: 'user-seed-fw2', organizationId: org.id,
      email: 'fw2@hospital.th', passwordHash: fw2Pw,
      role: 'FIELD_WORKER', displayName: 'น.ส.วิภา ช่วยเหลือ',
      phone: '062-456-7890', gender: 'FEMALE',
      supervisorId: 'user-seed-cm1',
    },
  });

  const fw3 = await prisma.user.upsert({
    where:  { email: 'fw3@hospital.th' },
    update: { supervisorId: 'user-seed-cm2' },
    create: {
      id: 'user-seed-fw3', organizationId: org.id,
      email: 'fw3@hospital.th', passwordHash: fw3Pw,
      role: 'FIELD_WORKER', displayName: 'นายสุรชัย ดูแล',
      phone: '062-567-8901', gender: 'MALE',
      supervisorId: 'user-seed-cm2',
    },
  });

  const mv1 = await prisma.user.upsert({
    where:  { email: 'mv1@hospital.th' },
    update: { phone: '065-111-2222', gender: 'FEMALE' },
    create: {
      id: 'user-seed-mv1', organizationId: org.id,
      email: 'mv1@hospital.th', passwordHash: mvPw,
      role: 'MEDICAL_VOLUNTEER', displayName: 'น.ส.รัตนา ใจเกื้อ',
      phone: '065-111-2222', gender: 'FEMALE',
    },
  });

  console.log(`✓ Users: admin, sa, cm1, cm2, fw1, fw2, fw3, mv1`);

  // ── Zones ──────────────────────────────────────────────────────────────────
  const zoneLumpini = await prisma.zone.upsert({
    where:  { id: 'zone-seed-001' },
    update: {},
    create: { id: 'zone-seed-001', organizationId: org.id, name: 'สวนลุมพินี', description: 'พื้นที่สวนลุมพินีและบริเวณโดยรอบ', color: '#7c3aed' },
  });
  const zoneHualamphong = await prisma.zone.upsert({
    where:  { id: 'zone-seed-002' },
    update: {},
    create: { id: 'zone-seed-002', organizationId: org.id, name: 'หัวลำโพง', description: 'บริเวณสถานีรถไฟและย่านเยาวราช', color: '#dc2626' },
  });
  const zoneKlongtoey = await prisma.zone.upsert({
    where:  { id: 'zone-seed-003' },
    update: {},
    create: { id: 'zone-seed-003', organizationId: org.id, name: 'คลองเตย', description: 'ชุมชนแออัดคลองเตยและท่าเรือ', color: '#d97706' },
  });
  const zoneRama4 = await prisma.zone.upsert({
    where:  { id: 'zone-seed-004' },
    update: {},
    create: { id: 'zone-seed-004', organizationId: org.id, name: 'พระราม 4', description: 'แนวถนนพระราม 4 และสะพานต่างๆ', color: '#059669' },
  });
  console.log(`✓ Zones: สวนลุมพินี, หัวลำโพง, คลองเตย, พระราม 4`);
  void fw2; void fw3; void zoneLumpini; void zoneHualamphong; void zoneKlongtoey; void zoneRama4;

  // ── Patients ──────────────────────────────────────────────────────────────
  const patientsData = [
    { id: 'pat-seed-001', hn: 'HN000001', name: 'นายสมศักดิ์ พลัดบ้าน',  age: 52, gender: 'MALE'   as const, status: 'CRITICAL' as const, locationText: 'ใต้สะพานพระราม 4',          conditions: ['เบาหวาน', 'ความดันโลหิตสูง'], cmId: cm1.id, zoneId: 'zone-seed-004' },
    { id: 'pat-seed-002', hn: 'HN000002', name: 'นางสาวอรุณี หาที่พัก',  age: 38, gender: 'FEMALE' as const, status: 'PENDING'  as const, locationText: 'ตลาดนัดจตุจักร',             conditions: ['วัณโรค'],                      cmId: cm1.id, zoneId: 'zone-seed-001' },
    { id: 'pat-seed-003', hn: 'HN000003', name: 'นายวิชัย ไร้ที่อยู่',   age: 67, gender: 'MALE'   as const, status: 'STABLE'   as const, locationText: 'สวนลุมพินี',                 conditions: ['ข้ออักเสบ', 'ต้อกระจก'],       cmId: cm2.id, zoneId: 'zone-seed-001' },
    { id: 'pat-seed-004', hn: 'HN000004', name: 'นางมะลิ สีเงิน',       age: 45, gender: 'FEMALE' as const, status: 'STABLE'   as const, locationText: 'หน้าห้างบิ๊กซี รามคำแหง',   conditions: [],                              cmId: cm2.id, zoneId: null },
    { id: 'pat-seed-005', hn: 'HN000005', name: 'นายอานนท์ ทุกข์ยาก',  age: 29, gender: 'MALE'   as const, status: 'CRITICAL' as const, locationText: 'บริเวณสถานีรถไฟหัวลำโพง',   conditions: ['ติดยาเสพติด', 'HIV'],          cmId: cm1.id, zoneId: 'zone-seed-002' },
    { id: 'pat-seed-006', hn: 'HN000006', name: 'นางรัตนา ชีวิตใหม่',   age: 55, gender: 'FEMALE' as const, status: 'PENDING'  as const, locationText: 'ชุมชนแออัดคลองเตย',          conditions: ['เบาหวาน'],                     cmId: cm2.id, zoneId: 'zone-seed-003' },
    { id: 'pat-seed-007', hn: 'HN000007', name: 'นายบุญมี ขาดรายได้',   age: 73, gender: 'MALE'   as const, status: 'STABLE'   as const, locationText: 'วัดโพธิ์ ท่าเตียน',           conditions: ['หัวใจ', 'ความดันโลหิตสูง'],   cmId: cm2.id, zoneId: 'zone-seed-002' },
    { id: 'pat-seed-008', hn: 'HN000008', name: 'นายธนากร ไม่มีบ้าน',  age: 19, gender: 'MALE'   as const, status: 'MISSING'  as const, locationText: 'บริเวณเยาวราช',               conditions: ['ซึมเศร้า'],                    cmId: cm1.id, zoneId: 'zone-seed-002' },
  ];

  for (const p of patientsData) {
    await prisma.patient.upsert({
      where:  { hn: p.hn },
      update: { status: p.status, zoneId: p.zoneId },
      create: {
        id: p.id, organizationId: org.id, caseManagerId: p.cmId,
        nameEnc: encrypt(p.name), hn: p.hn, age: p.age,
        gender: p.gender, status: p.status,
        locationText: p.locationText, conditions: p.conditions,
        zoneId: p.zoneId,
      },
    });
  }
  console.log(`✓ Patients: ${patientsData.length} records (พร้อม Zone assignment)`);

  // ── Care Plan Items ───────────────────────────────────────────────────────
  const carePlanData = [
    // pat-001 เบาหวาน + ความดัน
    { id: 'cp-001-1', patientId: 'pat-seed-001', title: 'ตรวจระดับน้ำตาลในเลือด',         frequency: 'ทุกสัปดาห์',  priority: 'HIGH', assigneeName: cm1.displayName, isDone: false },
    { id: 'cp-001-2', patientId: 'pat-seed-001', title: 'จ่ายยา Metformin 500mg',          frequency: 'ทุกเดือน',    priority: 'HIGH', assigneeName: fw1.displayName, isDone: false },
    { id: 'cp-001-3', patientId: 'pat-seed-001', title: 'วัดความดันโลหิต',                 frequency: 'ทุกสัปดาห์',  priority: 'MED',  assigneeName: mv1.displayName, isDone: false },
    // pat-002 วัณโรค
    { id: 'cp-002-1', patientId: 'pat-seed-002', title: 'ให้ยา Isoniazid + Rifampicin',   frequency: 'ทุกวัน',      priority: 'HIGH', assigneeName: cm1.displayName, isDone: false },
    { id: 'cp-002-2', patientId: 'pat-seed-002', title: 'ติดตามอาการทางเดินหายใจ',        frequency: 'ทุกสัปดาห์',  priority: 'HIGH', assigneeName: mv1.displayName, isDone: false },
    { id: 'cp-002-3', patientId: 'pat-seed-002', title: 'ส่งตรวจเสมหะ',                   frequency: 'ทุก 2 สัปดาห์', priority: 'MED', assigneeName: cm1.displayName, isDone: true },
    // pat-003 ข้ออักเสบ + ต้อกระจก
    { id: 'cp-003-1', patientId: 'pat-seed-003', title: 'จ่ายยาแก้ปวดข้อ',               frequency: 'ทุก 2 สัปดาห์', priority: 'MED', assigneeName: cm2.displayName, isDone: false },
    { id: 'cp-003-2', patientId: 'pat-seed-003', title: 'ประสานส่งต่อผ่าตัดต้อกระจก',   frequency: 'ครั้งเดียว',   priority: 'LOW',  assigneeName: cm2.displayName, isDone: false },
    // pat-004 ไม่มีโรคประจำตัว
    { id: 'cp-004-1', patientId: 'pat-seed-004', title: 'ประเมินสุขภาพประจำเดือน',       frequency: 'ทุกเดือน',    priority: 'LOW',  assigneeName: cm2.displayName, isDone: false },
    // pat-005 HIV + ยาเสพติด
    { id: 'cp-005-1', patientId: 'pat-seed-005', title: 'ให้ยา Efavirenz',                frequency: 'ทุกวัน',      priority: 'HIGH', assigneeName: cm1.displayName, isDone: false },
    { id: 'cp-005-2', patientId: 'pat-seed-005', title: 'นัดพบนักสังคมสงเคราะห์',        frequency: 'ทุก 2 สัปดาห์', priority: 'HIGH', assigneeName: cm1.displayName, isDone: false },
    { id: 'cp-005-3', patientId: 'pat-seed-005', title: 'ตรวจ CD4',                      frequency: 'ทุก 3 เดือน',  priority: 'MED',  assigneeName: mv1.displayName, isDone: true },
    // pat-006 เบาหวาน
    { id: 'cp-006-1', patientId: 'pat-seed-006', title: 'ตรวจระดับน้ำตาล HbA1c',        frequency: 'ทุก 3 เดือน',  priority: 'HIGH', assigneeName: cm2.displayName, isDone: false },
    { id: 'cp-006-2', patientId: 'pat-seed-006', title: 'จ่ายยา Metformin 500mg',        frequency: 'ทุกเดือน',    priority: 'HIGH', assigneeName: fw1.displayName, isDone: false },
    // pat-007 หัวใจ + ความดัน
    { id: 'cp-007-1', patientId: 'pat-seed-007', title: 'ตรวจ EKG',                     frequency: 'ทุก 3 เดือน',  priority: 'HIGH', assigneeName: mv1.displayName, isDone: true },
    { id: 'cp-007-2', patientId: 'pat-seed-007', title: 'จ่ายยา Atenolol 50mg',         frequency: 'ทุกเดือน',    priority: 'HIGH', assigneeName: fw1.displayName, isDone: false },
    { id: 'cp-007-3', patientId: 'pat-seed-007', title: 'วัดความดันโลหิต',              frequency: 'ทุกสัปดาห์',  priority: 'MED',  assigneeName: cm2.displayName, isDone: false },
    // pat-008 ซึมเศร้า
    { id: 'cp-008-1', patientId: 'pat-seed-008', title: 'ค้นหาผู้ป่วย',                 frequency: 'ทุกวัน',      priority: 'HIGH', assigneeName: cm1.displayName, isDone: false },
    { id: 'cp-008-2', patientId: 'pat-seed-008', title: 'ประสานกรมสุขภาพจิต',          frequency: 'ครั้งเดียว',   priority: 'HIGH', assigneeName: admin.displayName, isDone: false },
  ];

  for (const cp of carePlanData) {
    await prisma.carePlanItem.upsert({
      where:  { id: cp.id },
      update: { isDone: cp.isDone },
      create: {
        id: cp.id, patientId: cp.patientId,
        title: cp.title, frequency: cp.frequency,
        priority: cp.priority, assigneeName: cp.assigneeName,
        isDone: cp.isDone,
      },
    });
  }
  console.log(`✓ Care plan items: ${carePlanData.length} records`);

  // ── Alerts ────────────────────────────────────────────────────────────────
  await prisma.alert.createMany({
    skipDuplicates: true,
    data: [
      { id: 'alert-001', patientId: 'pat-seed-001', type: 'OVERDUE', daysMissed: 9,  sentAt: ago(2) },
      { id: 'alert-002', patientId: 'pat-seed-002', type: 'OVERDUE', daysMissed: 14, sentAt: ago(5) },
      { id: 'alert-003', patientId: 'pat-seed-005', type: 'SOS',     lat: 13.7400, lng: 100.5159, sentAt: ago(1) },
      { id: 'alert-004', patientId: 'pat-seed-008', type: 'MISSING', daysMissed: 21, sentAt: ago(3) },
      { id: 'alert-005', patientId: 'pat-seed-006', type: 'OVERDUE', daysMissed: 6,  sentAt: ago(1), resolvedAt: ago(0), resolvedBy: cm2.id },
    ],
  });
  console.log(`✓ Alerts: 5 records (OVERDUE ×3, SOS ×1, MISSING ×1)`);

  // ── Form Templates ────────────────────────────────────────────────────────
  const form1 = await prisma.formTemplate.upsert({
    where:  { id: 'form-seed-001' },
    update: {},
    create: {
      id: 'form-seed-001', organizationId: org.id, createdById: admin.id,
      title: 'แบบประเมินสุขภาพเบื้องต้น',
      description: 'ใช้ประเมินสุขภาพผู้ป่วยในชุมชนครั้งแรก',
      fields: [
        { id: 'f1', type: 'number',   label: 'น้ำหนัก (กก.)',                required: true,  order: 0 },
        { id: 'f2', type: 'number',   label: 'ส่วนสูง (ซม.)',                required: true,  order: 1 },
        { id: 'f3', type: 'number',   label: 'ความดันโลหิต (Systolic)',       required: false, order: 2 },
        { id: 'f4', type: 'number',   label: 'ความดันโลหิต (Diastolic)',      required: false, order: 3 },
        { id: 'f5', type: 'select',   label: 'ระดับความเจ็บปวด (1-10)',      required: true,  order: 4 },
        { id: 'f6', type: 'textarea', label: 'อาการที่สังเกตพบ',              required: false, order: 5 },
      ],
    },
  });

  const form2 = await prisma.formTemplate.upsert({
    where:  { id: 'form-seed-002' },
    update: {},
    create: {
      id: 'form-seed-002', organizationId: org.id, createdById: cm1.id,
      title: 'แบบประเมินความเสี่ยงและความต้องการ',
      description: 'ประเมินความเสี่ยงและความต้องการขั้นพื้นฐาน',
      fields: [
        { id: 'g1', type: 'radio',    label: 'มีที่พักอาศัยหรือไม่',          required: true,  order: 0 },
        { id: 'g2', type: 'radio',    label: 'มีรายได้ประจำหรือไม่',          required: true,  order: 1 },
        { id: 'g3', type: 'scale',    label: 'ระดับความปลอดภัยในพื้นที่ (1-5)', required: false, order: 2 },
        { id: 'g4', type: 'text',     label: 'ญาติผู้ใกล้ชิดที่ติดต่อได้',   required: false, order: 3 },
        { id: 'g5', type: 'textarea', label: 'ความต้องการเร่งด่วน',           required: false, order: 4 },
      ],
    },
  });
  console.log(`✓ Form templates: 2 records`);

  // ── Events + Tasks + Submissions + Activities ─────────────────────────────
  // helper: upsert task, return created id
  async function mkTask(id: string, eventId: string, patientId: string, assigneeId: string,
    formTemplateId: string | null, status: 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'NOT_FOUND',
    createdAt: Date) {
    return prisma.eventTask.upsert({
      where:  { id },
      update: { status },
      create: { id, eventId, patientId, assigneeId, formTemplateId: formTemplateId ?? undefined, status, createdAt },
    });
  }

  // helper: create submission
  function answers1(weight: string, height: string, sys: string, dia: string, pain: string, note: string) {
    return [
      { fieldId: 'f1', value: encrypt(weight) },
      { fieldId: 'f2', value: encrypt(height) },
      { fieldId: 'f3', value: encrypt(sys)    },
      { fieldId: 'f4', value: encrypt(dia)    },
      { fieldId: 'f5', value: encrypt(pain)   },
      { fieldId: 'f6', value: encrypt(note)   },
    ];
  }
  function answers2(shelter: string, income: string, safety: string, contact: string, needs: string) {
    return [
      { fieldId: 'g1', value: encrypt(shelter)  },
      { fieldId: 'g2', value: encrypt(income)   },
      { fieldId: 'g3', value: encrypt(safety)   },
      { fieldId: 'g4', value: encrypt(contact)  },
      { fieldId: 'g5', value: encrypt(needs)    },
    ];
  }

  async function mkSubmission(id: string, taskId: string, patientId: string, formId: string,
    submitterId: string, ans: object[], submittedAt: Date) {
    return prisma.submission.upsert({
      where:  { id },
      update: {},
      create: { id, taskId, patientId, formTemplateId: formId, submittedById: submitterId, answers: ans, submittedAt },
    });
  }

  // ── EVT-OLD-001: สำรวจผู้ป่วยใหม่ในชุมชน (45 วันที่แล้ว — ครบ) ──────────
  const evtOld1 = await prisma.event.upsert({
    where:  { id: 'evt-old-001' },
    update: {},
    create: {
      id: 'evt-old-001', organizationId: org.id, createdById: cm1.id,
      title: 'สำรวจผู้ป่วยใหม่ในชุมชน',
      startDate: ago(45), endDate: ago(44), priority: 'URGENT',
      note: 'สำรวจและประเมินผู้ป่วยรายใหม่ในพื้นที่คลองเตยและบริเวณใกล้เคียง',
      createdAt: ago(50),
    },
  });
  await mkTask('tk-o1-1', evtOld1.id, 'pat-seed-002', cm1.id, form2.id, 'DONE',        ago(50));
  await mkTask('tk-o1-2', evtOld1.id, 'pat-seed-006', cm2.id, form2.id, 'DONE',        ago(50));
  await mkTask('tk-o1-3', evtOld1.id, 'pat-seed-007', cm2.id, form1.id, 'DONE',        ago(50));
  await mkTask('tk-o1-4', evtOld1.id, 'pat-seed-008', cm1.id, form2.id, 'NOT_FOUND',   ago(50));

  await mkSubmission('sub-o1-1', 'tk-o1-1', 'pat-seed-002', form2.id, cm1.id,
    answers2('ไม่มี', 'ไม่มี', '2', '-', 'ต้องการยาวัณโรคและที่พักฉุกเฉิน'), ago(44));
  await mkSubmission('sub-o1-2', 'tk-o1-2', 'pat-seed-006', form2.id, cm2.id,
    answers2('มี', 'ไม่มี', '3', 'ลูกสาว 081-000-1111', 'ยาเบาหวานหมด'), ago(44));
  await mkSubmission('sub-o1-3', 'tk-o1-3', 'pat-seed-007', form1.id, cm2.id,
    answers1('58', '162', '145', '88', '3', 'ปวดข้อเข่าและข้อมือ มองไม่ชัด'), ago(44));

  // ── EVT-OLD-002: แจกยาและตรวจสุขภาพ กุมภาพันธ์ (30 วันที่แล้ว — ครบ) ──
  const evtOld2 = await prisma.event.upsert({
    where:  { id: 'evt-old-002' },
    update: {},
    create: {
      id: 'evt-old-002', organizationId: org.id, createdById: cm1.id,
      title: 'แจกยาและตรวจสุขภาพประจำเดือน (กุมภาพันธ์)',
      startDate: ago(30), endDate: ago(29), priority: 'URGENT',
      note: 'เน้นผู้ป่วยโรคเรื้อรัง จ่ายยาและตรวจสัญญาณชีพ',
      createdAt: ago(35),
    },
  });
  await mkTask('tk-o2-1', evtOld2.id, 'pat-seed-001', fw1.id,  form1.id, 'DONE',     ago(35));
  await mkTask('tk-o2-2', evtOld2.id, 'pat-seed-003', fw1.id,  form1.id, 'DONE',     ago(35));
  await mkTask('tk-o2-3', evtOld2.id, 'pat-seed-004', cm1.id,  form1.id, 'DONE',     ago(35));
  await mkTask('tk-o2-4', evtOld2.id, 'pat-seed-006', cm2.id,  form1.id, 'NOT_FOUND',ago(35));
  await mkTask('tk-o2-5', evtOld2.id, 'pat-seed-007', mv1.id,  form1.id, 'DONE',     ago(35));

  await mkSubmission('sub-o2-1', 'tk-o2-1', 'pat-seed-001', form1.id, fw1.id,
    answers1('65', '168', '158', '96', '6', 'ผู้ป่วยมีอาการปวดศีรษะและเวียนหัว ความดันสูง'), ago(29));
  await mkSubmission('sub-o2-2', 'tk-o2-2', 'pat-seed-003', form1.id, fw1.id,
    answers1('60', '170', '128', '80', '4', 'ปวดข้อเข่าทั้งสองข้าง เดินลำบาก'), ago(29));
  await mkSubmission('sub-o2-3', 'tk-o2-3', 'pat-seed-004', form1.id, cm1.id,
    answers1('62', '158', '118', '74', '1', 'ไม่มีอาการผิดปกติ'), ago(29));
  await mkSubmission('sub-o2-5', 'tk-o2-5', 'pat-seed-007', form1.id, mv1.id,
    answers1('55', '165', '148', '90', '5', 'เหนื่อยง่าย แน่นหน้าอกเล็กน้อย'), ago(29));

  // ── EVT-OLD-003: ติดตามผู้ป่วยวัณโรค (21 วันที่แล้ว — ครบ) ──────────────
  const evtOld3 = await prisma.event.upsert({
    where:  { id: 'evt-old-003' },
    update: {},
    create: {
      id: 'evt-old-003', organizationId: org.id, createdById: cm1.id,
      title: 'ติดตามผู้ป่วยวัณโรคและ HIV',
      startDate: ago(21), endDate: ago(20), priority: 'CRITICAL',
      note: 'ติดตามการรับยาวัณโรคและ ARV อย่างต่อเนื่อง สำคัญมาก',
      createdAt: ago(25),
    },
  });
  await mkTask('tk-o3-1', evtOld3.id, 'pat-seed-002', cm1.id, form1.id, 'DONE', ago(25));
  await mkTask('tk-o3-2', evtOld3.id, 'pat-seed-005', fw1.id, form2.id, 'DONE', ago(25));

  await mkSubmission('sub-o3-1', 'tk-o3-1', 'pat-seed-002', form1.id, cm1.id,
    answers1('50', '160', '108', '68', '3', 'อาการดีขึ้น รับยาต่อเนื่อง ไอลดลง'), ago(20));
  await mkSubmission('sub-o3-2', 'tk-o3-2', 'pat-seed-005', form2.id, fw1.id,
    answers2('ไม่มี', 'ไม่มี', '1', '-', 'ต้องการที่พักและยา ARV เร่งด่วน'), ago(20));

  // ── EVT-OLD-004: แจกยาและตรวจสุขภาพ มีนาคม (14 วันที่แล้ว — ครบ) ───────
  const evtOld4 = await prisma.event.upsert({
    where:  { id: 'evt-old-004' },
    update: {},
    create: {
      id: 'evt-old-004', organizationId: org.id, createdById: cm2.id,
      title: 'แจกยาและตรวจสุขภาพประจำเดือน (มีนาคม)',
      startDate: ago(14), endDate: ago(13), priority: 'URGENT',
      note: 'จ่ายยาประจำเดือน ตรวจระดับน้ำตาลและความดัน',
      createdAt: ago(18),
    },
  });
  await mkTask('tk-o4-1', evtOld4.id, 'pat-seed-001', fw1.id,  form1.id, 'DONE',       ago(18));
  await mkTask('tk-o4-2', evtOld4.id, 'pat-seed-003', cm2.id,  form1.id, 'DONE',       ago(18));
  await mkTask('tk-o4-3', evtOld4.id, 'pat-seed-005', cm1.id,  form2.id, 'DONE',       ago(18));
  await mkTask('tk-o4-4', evtOld4.id, 'pat-seed-007', mv1.id,  form1.id, 'DONE',       ago(18));
  await mkTask('tk-o4-5', evtOld4.id, 'pat-seed-006', cm2.id,  form1.id, 'IN_PROGRESS',ago(18));

  await mkSubmission('sub-o4-1', 'tk-o4-1', 'pat-seed-001', form1.id, fw1.id,
    answers1('64', '168', '162', '98', '7', 'ความดันยังสูง เพิ่มขนาดยา'), ago(13));
  await mkSubmission('sub-o4-2', 'tk-o4-2', 'pat-seed-003', form1.id, cm2.id,
    answers1('59', '170', '130', '82', '3', 'อาการคงที่ ปวดข้อลดลง'), ago(13));
  await mkSubmission('sub-o4-3', 'tk-o4-3', 'pat-seed-005', form2.id, cm1.id,
    answers2('ไม่มี', 'ไม่มี', '1', '-', 'ต้องการยา ARV ด่วน และบำบัดยาเสพติด'), ago(13));
  await mkSubmission('sub-o4-4', 'tk-o4-4', 'pat-seed-007', form1.id, mv1.id,
    answers1('54', '165', '152', '92', '5', 'แน่นหน้าอกบ่อยขึ้น ส่งต่อแพทย์'), ago(13));

  // ── EVT-OLD-005: เยี่ยมผู้ป่วยฉุกเฉิน SOS (7 วันที่แล้ว — ส่วนใหญ่ครบ) ─
  const evtOld5 = await prisma.event.upsert({
    where:  { id: 'evt-old-005' },
    update: {},
    create: {
      id: 'evt-old-005', organizationId: org.id, createdById: cm1.id,
      title: 'เยี่ยมผู้ป่วยฉุกเฉิน — ตามสัญญาณ SOS',
      startDate: ago(7), endDate: ago(7), priority: 'CRITICAL',
      note: 'ผู้ป่วย HN000005 ส่งสัญญาณ SOS บริเวณหัวลำโพง',
      createdAt: ago(7),
    },
  });
  await mkTask('tk-o5-1', evtOld5.id, 'pat-seed-005', cm1.id, form2.id, 'DONE',       ago(7));
  await mkTask('tk-o5-2', evtOld5.id, 'pat-seed-001', fw1.id, form1.id, 'DONE',       ago(7));
  await mkTask('tk-o5-3', evtOld5.id, 'pat-seed-008', cm1.id, null,     'NOT_FOUND',  ago(7));

  await mkSubmission('sub-o5-1', 'tk-o5-1', 'pat-seed-005', form2.id, cm1.id,
    answers2('ไม่มี', 'ไม่มี', '1', '-', 'พบผู้ป่วยนอนหมดสติ ส่งรพ.ด่วน'), ago(7));
  await mkSubmission('sub-o5-2', 'tk-o5-2', 'pat-seed-001', form1.id, fw1.id,
    answers1('63', '168', '160', '97', '8', 'ผู้ป่วยมีอาการรุนแรง วิงเวียนมาก'), ago(7));

  // ── EVT-CURR-001: ลงพื้นที่เยี่ยมผู้ป่วยวิกฤต (วันนี้ — กำลังดำเนินการ) ─
  const evtCurr1 = await prisma.event.upsert({
    where:  { id: 'evt-curr-001' },
    update: {},
    create: {
      id: 'evt-curr-001', organizationId: org.id, createdById: cm1.id,
      title: 'ลงพื้นที่เยี่ยมผู้ป่วยวิกฤต',
      startDate: fwd(0), endDate: fwd(1), priority: 'CRITICAL',
      note: 'เน้นผู้ป่วยที่มีอาการรุนแรง ต้องเตรียมยาและอุปกรณ์ฉุกเฉิน',
    },
  });
  await mkTask('tk-c1-1', evtCurr1.id, 'pat-seed-001', fw1.id,  form1.id, 'IN_PROGRESS', ago(0));
  await mkTask('tk-c1-2', evtCurr1.id, 'pat-seed-005', cm1.id,  form2.id, 'PENDING',     ago(0));
  await mkTask('tk-c1-3', evtCurr1.id, 'pat-seed-002', mv1.id,  form1.id, 'PENDING',     ago(0));

  // ── EVT-CURR-002: ติดตามผู้ป่วยกลุ่มเบาหวาน (สัปดาห์นี้ — รอดำเนินการ) ─
  const evtCurr2 = await prisma.event.upsert({
    where:  { id: 'evt-curr-002' },
    update: {},
    create: {
      id: 'evt-curr-002', organizationId: org.id, createdById: cm2.id,
      title: 'ติดตามผู้ป่วยกลุ่มเบาหวาน',
      startDate: fwd(2), endDate: fwd(4), priority: 'URGENT',
      note: 'เจาะเลือดและแจกยาประจำเดือน เน้น pat-001 และ pat-006',
    },
  });
  await mkTask('tk-c2-1', evtCurr2.id, 'pat-seed-001', cm1.id, form1.id, 'PENDING', ago(0));
  await mkTask('tk-c2-2', evtCurr2.id, 'pat-seed-006', cm2.id, form1.id, 'PENDING', ago(0));
  await mkTask('tk-c2-3', evtCurr2.id, 'pat-seed-004', fw1.id, form2.id, 'PENDING', ago(0));

  // ── EVT-FUT-001: เยี่ยมผู้ป่วยประจำเดือน เมษายน (+7 วัน) ───────────────
  const evtFut1 = await prisma.event.upsert({
    where:  { id: 'evt-fut-001' },
    update: {},
    create: {
      id: 'evt-fut-001', organizationId: org.id, createdById: cm2.id,
      title: 'เยี่ยมผู้ป่วยประจำเดือน (เมษายน)',
      startDate: fwd(7), endDate: fwd(8), priority: 'NORMAL',
      note: 'เยี่ยมผู้ป่วยกลุ่ม STABLE ทุกราย จ่ายยาและประเมินสุขภาพ',
    },
  });
  await mkTask('tk-f1-1', evtFut1.id, 'pat-seed-003', cm2.id, form1.id, 'PENDING', ago(0));
  await mkTask('tk-f1-2', evtFut1.id, 'pat-seed-004', cm1.id, form2.id, 'PENDING', ago(0));
  await mkTask('tk-f1-3', evtFut1.id, 'pat-seed-007', fw1.id, form1.id, 'PENDING', ago(0));
  await mkTask('tk-f1-4', evtFut1.id, 'pat-seed-006', mv1.id, form1.id, 'PENDING', ago(0));

  // ── EVT-FUT-002: ฝึกอบรมอาสาสมัครใหม่ (+14 วัน) ─────────────────────────
  const evtFut2 = await prisma.event.upsert({
    where:  { id: 'evt-fut-002' },
    update: {},
    create: {
      id: 'evt-fut-002', organizationId: org.id, createdById: admin.id,
      title: 'ฝึกอบรมอาสาสมัครและทีมภาคสนาม',
      startDate: fwd(14), endDate: fwd(15), priority: 'NORMAL',
      note: 'อบรมการประเมินสุขภาพเบื้องต้น การใช้แอปพลิเคชัน LIFF และการกรอกแบบฟอร์ม',
    },
  });
  // ไม่มี patient tasks — เป็น event ฝึกอบรม
  console.log(`✓ Events: 9 records (5 past / 2 current / 2 future)`);
  void evtFut2;

  const totalTasks = 4+5+2+5+3  + 3+3  + 4+0;
  console.log(`✓ Event tasks: ${totalTasks} records`);

  // ── Activities ────────────────────────────────────────────────────────────
  await prisma.activity.createMany({
    skipDuplicates: true,
    data: [
      // ── Past activities ──
      { id: 'act-001', actorId: cm1.id, patientId: 'pat-seed-001', eventId: evtOld2.id, taskId: 'tk-o2-1', type: 'CHECK_IN',     payload: { note: 'พบผู้ป่วย ความดันสูงมาก แจกยาและนัดติดตาม' }, createdAt: ago(30) },
      { id: 'act-002', actorId: cm1.id, patientId: 'pat-seed-001', type: 'STATUS_CHANGE', payload: { from: 'PENDING', to: 'CRITICAL' }, createdAt: ago(28) },
      { id: 'act-003', actorId: fw1.id,  patientId: 'pat-seed-002', eventId: evtOld1.id, taskId: 'tk-o1-1', type: 'FORM_SUBMIT',  payload: { formTitle: 'แบบประเมินความเสี่ยงฯ' },               createdAt: ago(44) },
      { id: 'act-004', actorId: cm2.id,  patientId: 'pat-seed-003', eventId: evtOld2.id, taskId: 'tk-o2-2', type: 'CHECK_IN',     payload: { note: 'ผู้ป่วยขอยาลดปวดข้อ อาการทรงตัว' },         createdAt: ago(29) },
      { id: 'act-005', actorId: cm1.id,  patientId: 'pat-seed-005', type: 'ASSIGN',      payload: { assignee: fw1.displayName },                                                                  createdAt: ago(21) },
      { id: 'act-006', actorId: cm1.id,  patientId: 'pat-seed-005', eventId: evtOld5.id, taskId: 'tk-o5-1', type: 'SOS',         payload: { lat: 13.7400, lng: 100.5159, note: 'พบผู้ป่วยหมดสติ ส่ง รพ.ด่วน' }, createdAt: ago(7) },
      { id: 'act-007', actorId: cm1.id,  patientId: 'pat-seed-005', type: 'STATUS_CHANGE', payload: { from: 'STABLE', to: 'CRITICAL' }, createdAt: ago(6) },
      { id: 'act-008', actorId: cm2.id,  patientId: 'pat-seed-006', type: 'NOTE',         payload: { note: 'ผู้ป่วยไม่อยู่บ้าน ทิ้งยาและนัดหมายใหม่' },                                         createdAt: ago(14) },
      { id: 'act-009', actorId: mv1.id,  patientId: 'pat-seed-007', eventId: evtOld4.id, taskId: 'tk-o4-4', type: 'FORM_SUBMIT', payload: { formTitle: 'แบบประเมินสุขภาพเบื้องต้น' },            createdAt: ago(13) },
      { id: 'act-010', actorId: cm1.id,  patientId: 'pat-seed-008', type: 'NOTE',         payload: { note: 'ค้นหาผู้ป่วย HN000008 บริเวณเยาวราช ไม่พบ' },                                       createdAt: ago(5) },
      { id: 'act-011', actorId: cm1.id,  patientId: 'pat-seed-008', type: 'STATUS_CHANGE', payload: { from: 'PENDING', to: 'MISSING' }, createdAt: ago(4) },
      // ── Today / current ──
      { id: 'act-012', actorId: fw1.id,  patientId: 'pat-seed-001', eventId: evtCurr1.id, taskId: 'tk-c1-1', type: 'CHECK_IN',  payload: { note: 'เริ่มลงพื้นที่ ค้นหาผู้ป่วยใต้สะพานพระราม 4' }, createdAt: ago(0) },
      { id: 'act-013', actorId: admin.id, type: 'LOGIN',            payload: { ip: '127.0.0.1' },                                                                                                  createdAt: ago(0) },
    ],
  });
  console.log(`✓ Activities: 13 records`);

  // ── Inventory ─────────────────────────────────────────────────────────────
  const invItems = [
    { id: 'inv-item-001', name: 'Metformin 500mg',          unit: 'เม็ด',   category: 'DRUG',   lowStockThreshold: 50  },
    { id: 'inv-item-002', name: 'Amlodipine 5mg',           unit: 'เม็ด',   category: 'DRUG',   lowStockThreshold: 30  },
    { id: 'inv-item-003', name: 'Paracetamol 500mg',        unit: 'เม็ด',   category: 'DRUG',   lowStockThreshold: 100 },
    { id: 'inv-item-004', name: 'Omeprazole 20mg',          unit: 'เม็ด',   category: 'DRUG',   lowStockThreshold: 20  },
    { id: 'inv-item-005', name: 'Isoniazid 300mg',          unit: 'เม็ด',   category: 'DRUG',   lowStockThreshold: 15  },
    { id: 'inv-item-006', name: 'Rifampicin 600mg',         unit: 'เม็ด',   category: 'DRUG',   lowStockThreshold: 15  },
    { id: 'inv-item-007', name: 'Efavirenz 600mg',          unit: 'เม็ด',   category: 'DRUG',   lowStockThreshold: 10  },
    { id: 'inv-item-008', name: 'Atenolol 50mg',            unit: 'เม็ด',   category: 'DRUG',   lowStockThreshold: 20  },
    { id: 'inv-item-009', name: 'ถุงมือไนไตรล์ M',          unit: 'ถุง',   category: 'SUPPLY', lowStockThreshold: 10  },
    { id: 'inv-item-010', name: 'หน้ากาก N95',              unit: 'ชิ้น',  category: 'SUPPLY', lowStockThreshold: 20  },
    { id: 'inv-item-011', name: 'แอลกอฮอล์ 70% 450ml',     unit: 'ขวด',   category: 'SUPPLY', lowStockThreshold: 5   },
    { id: 'inv-item-012', name: 'ชุดเจาะเลือดปลายนิ้ว',   unit: 'กล่อง', category: 'SUPPLY', lowStockThreshold: 5   },
  ] as const;

  // Lot definitions: some lots are near-expiry for demo purposes
  // daysToExpiry: positive = future, items with small values will trigger 30-day alert
  const lotDefs: Record<string, Array<{
    suffix: string; qty: number; remaining: number;
    daysToExpiry: number; receiptNo: string;
  }>> = {
    'inv-item-001': [ // Metformin — lot A near expiry
      { suffix: 'A', qty: 200, remaining: 45,  daysToExpiry: 20,  receiptNo: 'RX-2026-002' },
      { suffix: 'B', qty: 250, remaining: 120, daysToExpiry: 180, receiptNo: 'RX-2026-003' },
    ],
    'inv-item-002': [
      { suffix: 'A', qty: 300, remaining: 95,  daysToExpiry: 90,  receiptNo: 'RX-2026-002' },
    ],
    'inv-item-003': [ // Paracetamol — lot A very near expiry (8 days)
      { suffix: 'A', qty: 500, remaining: 28,  daysToExpiry: 8,   receiptNo: 'RX-2026-002' },
      { suffix: 'B', qty: 600, remaining: 220, daysToExpiry: 270, receiptNo: 'RX-2026-003' },
    ],
    'inv-item-004': [
      { suffix: 'A', qty: 200, remaining: 72,  daysToExpiry: 120, receiptNo: 'RX-2026-002' },
    ],
    'inv-item-005': [
      { suffix: 'A', qty: 150, remaining: 40,  daysToExpiry: 60,  receiptNo: 'RX-2026-002' },
    ],
    'inv-item-006': [
      { suffix: 'A', qty: 150, remaining: 38,  daysToExpiry: 60,  receiptNo: 'RX-2026-002' },
    ],
    'inv-item-007': [ // Efavirenz — near expiry (25 days)
      { suffix: 'A', qty: 120, remaining: 22,  daysToExpiry: 25,  receiptNo: 'RX-2026-002' },
    ],
    'inv-item-008': [
      { suffix: 'A', qty: 250, remaining: 88,  daysToExpiry: 150, receiptNo: 'RX-2026-003' },
    ],
    'inv-item-009': [
      { suffix: 'A', qty: 80,  remaining: 36,  daysToExpiry: 365, receiptNo: 'RX-2026-001' },
    ],
    'inv-item-010': [
      { suffix: 'A', qty: 100, remaining: 43,  daysToExpiry: 730, receiptNo: 'RX-2026-001' },
    ],
    'inv-item-011': [
      { suffix: 'A', qty: 40,  remaining: 14,  daysToExpiry: 180, receiptNo: 'RX-2026-001' },
    ],
    'inv-item-012': [
      { suffix: 'A', qty: 30,  remaining: 9,   daysToExpiry: 365, receiptNo: 'RX-2026-001' },
    ],
  };

  // Upsert items and their lots
  for (const item of invItems) {
    const defs = lotDefs[item.id] ?? [];
    const totalRemaining = defs.reduce((s, d) => s + d.remaining, 0);

    await prisma.inventoryItem.upsert({
      where:  { id: item.id },
      update: { currentStock: totalRemaining },
      create: {
        id: item.id, organizationId: org.id,
        name: item.name, unit: item.unit,
        category: item.category as any,
        lowStockThreshold: item.lowStockThreshold,
        currentStock: totalRemaining,
      },
    });

    for (const def of defs) {
      const lotId = `lot-seed-${item.id}-${def.suffix}`;
      const expiry = new Date(Date.now() + def.daysToExpiry * 86_400_000);
      const existingLot = await prisma.inventoryLot.findUnique({ where: { id: lotId } });
      if (!existingLot) {
        const lot = await prisma.inventoryLot.create({
          data: {
            id: lotId, itemId: item.id, actorId: 'user-seed-admin',
            quantity: def.qty, remaining: def.remaining,
            expiryDate: expiry, receiptNo: def.receiptNo, unitCost: 2.5,
          },
        });
        await prisma.stockTransaction.create({
          data: {
            itemId: item.id, actorId: 'user-seed-admin',
            type: 'IN_PURCHASE', quantity: def.qty,
            balanceAfter: def.qty, lotId: lot.id,
            receiptNo: def.receiptNo, unitCost: 2.5,
            createdAt: ago(90),
          },
        });
      }
    }
  }
  console.log(`✓ Inventory items: ${invItems.length} records with lots`);

  await prisma.adjRequest.upsert({
    where:  { id: 'adj-seed-001' },
    update: {},
    create: {
      id: 'adj-seed-001', itemId: 'inv-item-003',
      requestedById: 'user-seed-admin', quantity: -50,
      reason: 'ยาหมดอายุจากล็อตเดือนกุมภาพันธ์', status: 'PENDING',
      createdAt: ago(3),
    },
  });
  await prisma.adjRequest.upsert({
    where:  { id: 'adj-seed-002' },
    update: {},
    create: {
      id: 'adj-seed-002', itemId: 'inv-item-010',
      requestedById: 'user-seed-admin', quantity: -30,
      reason: 'ตรวจพบหน้ากากชำรุดจากการจัดเก็บ', status: 'PENDING',
      createdAt: ago(1),
    },
  });
  await prisma.adjRequest.upsert({
    where:  { id: 'adj-seed-003' },
    update: {},
    create: {
      id: 'adj-seed-003', itemId: 'inv-item-007',
      requestedById: 'user-seed-cm1', quantity: -8,
      reason: 'ยา ARV หักออกจากสต็อกที่ส่งผู้ป่วย HN000005',
      status: 'APPROVED', reviewedById: 'user-seed-sa',
      reviewNote: 'อนุมัติ ตรวจสอบแล้ว', createdAt: ago(10),
    },
  });
  console.log(`✓ Adj requests: 3 records (2 pending, 1 approved)`);

  console.log('\n✅ Seed complete!\n');
  console.log('Credentials:');
  console.log('  admin@hospital.th  / Admin1234!     (ADMIN)');
  console.log('  sa@hospital.th     / SuperAdmin1!   (SUPER_ADMIN)');
  console.log('  cm1@hospital.th    / CaseManager1!  (CASE_MANAGER)');
  console.log('  cm2@hospital.th    / CaseManager1!  (CASE_MANAGER)');
  console.log('  fw1@hospital.th    / FieldWork1!    (FIELD_WORKER)');
  console.log('  mv1@hospital.th    / MedVol1234!    (MEDICAL_VOLUNTEER)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

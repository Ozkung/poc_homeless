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
    update: { name: 'มูลนิธิเพื่อคนไร้บ้านแห่งกรุงเทพ' },
    create: { id: 'org-seed-001', name: 'มูลนิธิเพื่อคนไร้บ้านแห่งกรุงเทพ' },
  });
  console.log(`✓ Organisation: ${org.name}`);

  // ── Zones ──────────────────────────────────────────────────────────────────
  // Must be created BEFORE users so zoneId foreign keys resolve
  const zonePhraNakhon = await prisma.zone.upsert({
    where:  { id: 'zone-seed-001' },
    update: { name: 'เขตพระนคร', description: 'บริเวณสนามหลวง, ท่าช้าง, ท่าพระจันทร์ และวัดโพธิ์' },
    create: { id: 'zone-seed-001', organizationId: org.id, name: 'เขตพระนคร', description: 'บริเวณสนามหลวง, ท่าช้าง, ท่าพระจันทร์ และวัดโพธิ์', color: '#7c3aed' },
  });
  const zonePomPrab = await prisma.zone.upsert({
    where:  { id: 'zone-seed-002' },
    update: { name: 'เขตป้อมปราบศัตรูพ่าย', description: 'บริเวณสถานีหัวลำโพง, บ้านหม้อ และชุมชนริมทางรถไฟ' },
    create: { id: 'zone-seed-002', organizationId: org.id, name: 'เขตป้อมปราบศัตรูพ่าย', description: 'บริเวณสถานีหัวลำโพง, บ้านหม้อ และชุมชนริมทางรถไฟ', color: '#dc2626' },
  });
  const zoneNongChok = await prisma.zone.upsert({
    where:  { id: 'zone-seed-003' },
    update: { name: 'เขตหนองจอก', description: 'ชุมชนแรงงาน, ริมคลองแสนแสบ และพื้นที่อุตสาหกรรม' },
    create: { id: 'zone-seed-003', organizationId: org.id, name: 'เขตหนองจอก', description: 'ชุมชนแรงงาน, ริมคลองแสนแสบ และพื้นที่อุตสาหกรรม', color: '#d97706' },
  });
  const zoneSamphan = await prisma.zone.upsert({
    where:  { id: 'zone-seed-004' },
    update: { name: 'เขตสัมพันธวงศ์', description: 'ย่านเยาวราช, ตลาดน้อย และสะพานเหลือง' },
    create: { id: 'zone-seed-004', organizationId: org.id, name: 'เขตสัมพันธวงศ์', description: 'ย่านเยาวราช, ตลาดน้อย และสะพานเหลือง', color: '#059669' },
  });
  console.log(`✓ Zones: เขตพระนคร, เขตป้อมปราบศัตรูพ่าย, เขตหนองจอก, เขตสัมพันธวงศ์`);
  void zonePhraNakhon; void zonePomPrab; void zoneNongChok; void zoneSamphan;

  // ── Users (with phone + gender) ───────────────────────────────────────────
  const [adminPw, saPw, cmPw, fwPw, mvPw, docPw] = await Promise.all([
    hash('Admin1234!'), hash('SuperAdmin1!'), hash('CaseManager1!'),
    hash('CareGiv1!'),  hash('MedVol1234!'), hash('Doctor1234!'),
  ]);

  const admin = await prisma.user.upsert({
    where:  { email: 'admin@hospital.th' },
    update: { phone: '02-000-1234', gender: 'MALE', displayName: 'ผู้ดูแลระบบ' },
    create: {
      id: 'user-seed-admin', organizationId: org.id,
      email: 'admin@hospital.th', passwordHash: adminPw,
      role: 'ADMIN', displayName: 'ผู้ดูแลระบบ',
      phone: '02-000-1234', gender: 'MALE',
    },
  });

  await prisma.user.upsert({
    where:  { email: 'sa@hospital.th' },
    update: { phone: '081-999-8888', gender: 'FEMALE', displayName: 'ผอ.ศิริพร มั่นคง' },
    create: {
      id: 'user-seed-sa', organizationId: org.id,
      email: 'sa@hospital.th', passwordHash: saPw,
      role: 'SUPER_ADMIN', displayName: 'ผอ.ศิริพร มั่นคง',
      phone: '081-999-8888', gender: 'FEMALE',
    },
  });

  const cm1 = await prisma.user.upsert({
    where:  { email: 'cm1@hospital.th' },
    update: { phone: '081-234-5678', gender: 'FEMALE', displayName: 'น.ส.มาลี สายใจ', zoneId: 'zone-seed-001' },
    create: {
      id: 'user-seed-cm1', organizationId: org.id,
      email: 'cm1@hospital.th', passwordHash: cmPw,
      role: 'CASE_MANAGER', displayName: 'น.ส.มาลี สายใจ',
      phone: '081-234-5678', gender: 'FEMALE', zoneId: 'zone-seed-001',
    },
  });

  const cm2 = await prisma.user.upsert({
    where:  { email: 'cm2@hospital.th' },
    update: { phone: '089-876-5432', gender: 'MALE', displayName: 'นายวิชาญ ดูแลดี', zoneId: 'zone-seed-002' },
    create: {
      id: 'user-seed-cm2', organizationId: org.id,
      email: 'cm2@hospital.th', passwordHash: cmPw,
      role: 'CASE_MANAGER', displayName: 'นายวิชาญ ดูแลดี',
      phone: '089-876-5432', gender: 'MALE', zoneId: 'zone-seed-002',
    },
  });

  const fw1 = await prisma.user.upsert({
    where:  { email: 'fw1@hospital.th' },
    update: { phone: '062-345-6789', gender: 'MALE', displayName: 'นายอภิชาต ลงพื้นที่', supervisorId: 'user-seed-cm1', zoneId: 'zone-seed-001' },
    create: {
      id: 'user-seed-fw1', organizationId: org.id,
      email: 'fw1@hospital.th', passwordHash: fwPw,
      role: 'CARE_GIVER', displayName: 'นายอภิชาต ลงพื้นที่',
      phone: '062-345-6789', gender: 'MALE',
      supervisorId: 'user-seed-cm1', zoneId: 'zone-seed-001',
    },
  });

  const [fw2Pw, fw3Pw] = await Promise.all([hash('CareGiv2!'), hash('CareGiv3!')]);

  const fw2 = await prisma.user.upsert({
    where:  { email: 'fw2@hospital.th' },
    update: { displayName: 'น.ส.สุกัญญา ช่วยเหลือ', supervisorId: 'user-seed-cm1', zoneId: 'zone-seed-001' },
    create: {
      id: 'user-seed-fw2', organizationId: org.id,
      email: 'fw2@hospital.th', passwordHash: fw2Pw,
      role: 'CARE_GIVER', displayName: 'น.ส.สุกัญญา ช่วยเหลือ',
      phone: '062-456-7890', gender: 'FEMALE',
      supervisorId: 'user-seed-cm1', zoneId: 'zone-seed-001',
    },
  });

  const fw3 = await prisma.user.upsert({
    where:  { email: 'fw3@hospital.th' },
    update: { displayName: 'นายพิทักษ์ ดูแลชุมชน', supervisorId: 'user-seed-cm2', zoneId: 'zone-seed-002' },
    create: {
      id: 'user-seed-fw3', organizationId: org.id,
      email: 'fw3@hospital.th', passwordHash: fw3Pw,
      role: 'CARE_GIVER', displayName: 'นายพิทักษ์ ดูแลชุมชน',
      phone: '062-567-8901', gender: 'MALE',
      supervisorId: 'user-seed-cm2', zoneId: 'zone-seed-002',
    },
  });

  const mv1 = await prisma.user.upsert({
    where:  { email: 'mv1@hospital.th' },
    update: { phone: '065-111-2222', gender: 'FEMALE', displayName: 'น.ส.ปรียา ใจเกื้อ' },
    create: {
      id: 'user-seed-mv1', organizationId: org.id,
      email: 'mv1@hospital.th', passwordHash: mvPw,
      role: 'MEDICAL_VOLUNTEER', displayName: 'น.ส.ปรียา ใจเกื้อ',
      phone: '065-111-2222', gender: 'FEMALE',
    },
  });

  const doc1 = await prisma.user.upsert({
    where:  { email: 'doc1@hospital.th' },
    update: { phone: '081-777-8888', gender: 'MALE', displayName: 'นพ.ณัฐวุฒิ รักษาดี' },
    create: {
      id: 'user-seed-doc1', organizationId: org.id,
      email: 'doc1@hospital.th', passwordHash: docPw,
      role: 'DOCTOR', displayName: 'นพ.ณัฐวุฒิ รักษาดี',
      phone: '081-777-8888', gender: 'MALE',
    },
  });

  const doc2 = await prisma.user.upsert({
    where:  { email: 'doc2@hospital.th' },
    update: { phone: '089-555-6666', gender: 'FEMALE', displayName: 'พญ.อารีย์ สุขสวัสดิ์' },
    create: {
      id: 'user-seed-doc2', organizationId: org.id,
      email: 'doc2@hospital.th', passwordHash: docPw,
      role: 'DOCTOR', displayName: 'พญ.อารีย์ สุขสวัสดิ์',
      phone: '089-555-6666', gender: 'FEMALE',
    },
  });

  console.log(`✓ Users: admin, sa, cm1, cm2, fw1, fw2, fw3, mv1, doc1, doc2`);
  void fw2; void fw3; void doc2;

  // ── Patients ──────────────────────────────────────────────────────────────
  const patientsData = [
    { id: 'pat-seed-001', hn: 'HN000001', name: 'นายสมศักดิ์ พลัดถิ่น',   age: 54, gender: 'MALE'   as const, status: 'CRITICAL' as const, locationText: 'ใต้สะพานพระปิ่นเกล้า ฝั่งพระนคร',    conditions: ['เบาหวาน', 'ความดันโลหิตสูง'], cmId: cm1.id, zoneId: 'zone-seed-001' },
    { id: 'pat-seed-002', hn: 'HN000002', name: 'นางสาวอรุณี ไร้ที่พัก',   age: 40, gender: 'FEMALE' as const, status: 'PENDING'  as const, locationText: 'ริมสถานีรถไฟหัวลำโพง',                conditions: ['วัณโรค'],                      cmId: cm1.id, zoneId: 'zone-seed-002' },
    { id: 'pat-seed-003', hn: 'HN000003', name: 'นายวิชัย สนามหลวง',       age: 68, gender: 'MALE'   as const, status: 'STABLE'   as const, locationText: 'สนามหลวง บริเวณใกล้ท่าพระจันทร์',     conditions: ['ข้ออักเสบ', 'ต้อกระจก'],       cmId: cm2.id, zoneId: 'zone-seed-001' },
    { id: 'pat-seed-004', hn: 'HN000004', name: 'นางมะลิ แรงงานหนองจอก',   age: 47, gender: 'FEMALE' as const, status: 'STABLE'   as const, locationText: 'ชุมชนแรงงาน เขตหนองจอก',             conditions: [],                              cmId: cm2.id, zoneId: 'zone-seed-003' },
    { id: 'pat-seed-005', hn: 'HN000005', name: 'นายอานนท์ เยาวราช',       age: 31, gender: 'MALE'   as const, status: 'CRITICAL' as const, locationText: 'ซอยเยาวราช 11 ใกล้วัดกันมาตุยาราม',  conditions: ['ติดยาเสพติด', 'HIV'],          cmId: cm1.id, zoneId: 'zone-seed-004' },
    { id: 'pat-seed-006', hn: 'HN000006', name: 'นางรัตนา คลองแสนแสบ',     age: 57, gender: 'FEMALE' as const, status: 'PENDING'  as const, locationText: 'ริมคลองแสนแสบ เขตหนองจอก',           conditions: ['เบาหวาน'],                     cmId: cm2.id, zoneId: 'zone-seed-003' },
    { id: 'pat-seed-007', hn: 'HN000007', name: 'นายบุญมี ท่าพระจันทร์',   age: 75, gender: 'MALE'   as const, status: 'STABLE'   as const, locationText: 'ท่าพระจันทร์ หน้าวัดมหาธาตุ',        conditions: ['หัวใจ', 'ความดันโลหิตสูง'],   cmId: cm2.id, zoneId: 'zone-seed-001' },
    { id: 'pat-seed-008', hn: 'HN000008', name: 'นายธนากร บ้านหม้อ',       age: 21, gender: 'MALE'   as const, status: 'MISSING'  as const, locationText: 'บริเวณบ้านหม้อ เขตป้อมปราบฯ',         conditions: ['ซึมเศร้า'],                    cmId: cm1.id, zoneId: 'zone-seed-002' },
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
  const form1Fields = [
    { id: 'f1', type: 'number',   label: 'น้ำหนัก (กก.)',                required: true,  order: 0 },
    { id: 'f2', type: 'number',   label: 'ส่วนสูง (ซม.)',                required: true,  order: 1 },
    { id: 'f3', type: 'number',   label: 'ความดันโลหิต (Systolic)',       required: false, order: 2 },
    { id: 'f4', type: 'number',   label: 'ความดันโลหิต (Diastolic)',      required: false, order: 3 },
    { id: 'f5', type: 'select',   label: 'ระดับความเจ็บปวด (1-10)',      required: true,  order: 4, options: ['1','2','3','4','5','6','7','8','9','10'] },
    { id: 'f6', type: 'textarea', label: 'อาการที่สังเกตพบ',              required: false, order: 5 },
  ];
  const form2Fields = [
    { id: 'g1', type: 'radio',    label: 'มีที่พักอาศัยหรือไม่',            required: true,  order: 0, options: ['มี', 'ไม่มี'] },
    { id: 'g2', type: 'radio',    label: 'มีรายได้ประจำหรือไม่',            required: true,  order: 1, options: ['มี', 'ไม่มี'] },
    { id: 'g3', type: 'scale',    label: 'ระดับความปลอดภัยในพื้นที่ (1-5)', required: false, order: 2, min: 1, max: 5 },
    { id: 'g4', type: 'text',     label: 'ญาติผู้ใกล้ชิดที่ติดต่อได้',     required: false, order: 3 },
    { id: 'g5', type: 'textarea', label: 'ความต้องการเร่งด่วน',             required: false, order: 4 },
  ];

  const form1 = await prisma.formTemplate.upsert({
    where:  { id: 'form-seed-001' },
    update: { fields: form1Fields },
    create: {
      id: 'form-seed-001', organizationId: org.id, createdById: admin.id,
      title: 'แบบประเมินสุขภาพเบื้องต้น',
      description: 'ใช้ประเมินสุขภาพผู้ป่วยในชุมชนครั้งแรก',
      fields: form1Fields,
    },
  });

  const form2 = await prisma.formTemplate.upsert({
    where:  { id: 'form-seed-002' },
    update: { fields: form2Fields },
    create: {
      id: 'form-seed-002', organizationId: org.id, createdById: cm1.id,
      title: 'แบบประเมินความเสี่ยงและความต้องการ',
      description: 'ประเมินความเสี่ยงและความต้องการขั้นพื้นฐาน',
      fields: form2Fields,
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

  // ── Diagnoses ─────────────────────────────────────────────────────────────
  const diagnosesData = [
    { id: 'diag-001', patientId: 'pat-seed-001', doctorId: doc1.id, title: 'เบาหวานชนิดที่ 2', description: 'ระดับน้ำตาลสะสม HbA1c 9.2% ควบคุมได้ไม่ดี ปรับยาและนัดติดตาม 3 เดือน', icd10: 'E11', severity: 'MODERATE', createdAt: ago(60) },
    { id: 'diag-002', patientId: 'pat-seed-001', doctorId: doc1.id, title: 'ความดันโลหิตสูง Stage 2', description: 'ค่าเฉลี่ยความดัน 162/98 mmHg จำเป็นต้องปรับขนาดยาและติดตามอย่างใกล้ชิด', icd10: 'I10', severity: 'SEVERE', createdAt: ago(14) },
    { id: 'diag-003', patientId: 'pat-seed-002', doctorId: doc2.id, title: 'วัณโรคปอด (Pulmonary TB)', description: 'ผลเสมหะ AFB Positive 2+ เริ่มสูตรยา 2HRZE ระยะเข้มข้น ต้องรับยาต่อเนื่อง 6 เดือน', icd10: 'A15', severity: 'SEVERE', createdAt: ago(45) },
    { id: 'diag-004', patientId: 'pat-seed-002', doctorId: doc2.id, title: 'ภาวะขาดสารอาหาร', description: 'BMI 16.8 ขาดโปรตีนและวิตามินรุนแรง ให้อาหารเสริมและติดตามน้ำหนัก', icd10: 'E46', severity: 'MODERATE', createdAt: ago(30) },
    { id: 'diag-005', patientId: 'pat-seed-003', doctorId: doc1.id, title: 'โรคข้อเสื่อม (Osteoarthritis)', description: 'ข้อเข่าทั้งสองข้างเสื่อม ปวดเรื้อรัง จ่ายยา NSAIDs และแนะนำกายภาพบำบัด', icd10: 'M17', severity: 'MILD', createdAt: ago(50) },
    { id: 'diag-006', patientId: 'pat-seed-003', doctorId: doc2.id, title: 'ต้อกระจก (Cataract)', description: 'ต้อกระจกทั้งสองข้าง ระยะเริ่มต้น สายตาลดลง ส่งต่อจักษุแพทย์เพื่อประเมินผ่าตัด', icd10: 'H26', severity: 'MILD', createdAt: ago(40) },
    { id: 'diag-007', patientId: 'pat-seed-005', doctorId: doc1.id, title: 'HIV Stage 3 (AIDS)', description: 'CD4 count 180 cells/mm³ เริ่มสูตร ARV Efavirenz + Tenofovir + Emtricitabine ติดตามทุก 3 เดือน', icd10: 'B24', severity: 'SEVERE', createdAt: ago(90) },
    { id: 'diag-008', patientId: 'pat-seed-005', doctorId: doc1.id, title: 'กลุ่มอาการติดสารเสพติด (Opioid Use Disorder)', description: 'ติดยาเฮโรอีนมา 5 ปี ส่งต่อคลินิกบำบัดยาเสพติด MMT (Methadone)', icd10: 'F11', severity: 'SEVERE', createdAt: ago(85) },
    { id: 'diag-009', patientId: 'pat-seed-007', doctorId: doc2.id, title: 'โรคหัวใจล้มเหลว (Heart Failure)', description: 'EF 40% Systolic HF NYHA Class II เหนื่อยเมื่อออกแรง จ่ายยา Furosemide และ Carvedilol', icd10: 'I50', severity: 'MODERATE', createdAt: ago(30) },
    { id: 'diag-010', patientId: 'pat-seed-006', doctorId: doc1.id, title: 'เบาหวานชนิดที่ 2 ควบคุมได้', description: 'HbA1c 7.4% ควบคุมได้ปานกลาง ปรับอาหารและรับยา Metformin ต่อเนื่อง', icd10: 'E11', severity: 'MILD', createdAt: ago(20) },
    { id: 'diag-011', patientId: 'pat-seed-008', doctorId: doc2.id, title: 'โรคซึมเศร้าระดับปานกลาง (MDD)', description: 'PHQ-9 score 14 ส่งต่อจิตแพทย์ด่วน ให้ยา Sertraline 50mg ติดตามทุก 2 สัปดาห์', icd10: 'F33', severity: 'MODERATE', createdAt: ago(10) },
  ];

  for (const d of diagnosesData) {
    await prisma.diagnosis.upsert({
      where:  { id: d.id },
      update: {},
      create: { id: d.id, patientId: d.patientId, doctorId: d.doctorId, title: d.title, description: d.description, icd10: d.icd10, severity: d.severity, createdAt: d.createdAt },
    });
  }
  console.log(`✓ Diagnoses: ${diagnosesData.length} records`);

  // ── Prescriptions ─────────────────────────────────────────────────────────
  const prescriptionsData = [
    {
      id: 'presc-001', patientId: 'pat-seed-001', doctorId: doc1.id, createdAt: ago(60),
      medications: [
        { name: 'Metformin 500mg', dosage: '500mg', frequency: 'วันละ 2 ครั้ง หลังอาหาร', duration: '3 เดือน' },
        { name: 'Amlodipine 5mg',  dosage: '5mg',   frequency: 'วันละ 1 ครั้ง ก่อนนอน',   duration: '3 เดือน' },
      ],
      notes: 'นัดติดตาม 3 เดือน เจาะเลือด HbA1c และวัดความดันทุกเดือน',
    },
    {
      id: 'presc-002', patientId: 'pat-seed-001', doctorId: doc1.id, createdAt: ago(14),
      medications: [
        { name: 'Metformin 1000mg',  dosage: '1000mg', frequency: 'วันละ 2 ครั้ง หลังอาหาร', duration: '3 เดือน', notes: 'เพิ่มขนาดยา' },
        { name: 'Enalapril 10mg',    dosage: '10mg',   frequency: 'วันละ 1 ครั้ง เช้า',        duration: '3 เดือน' },
        { name: 'Amlodipine 10mg',   dosage: '10mg',   frequency: 'วันละ 1 ครั้ง ก่อนนอน',    duration: '3 เดือน', notes: 'เพิ่มขนาดยา' },
      ],
      notes: 'ปรับยาเนื่องจากความดันยังสูง เน้นการลดเกลือในอาหาร',
    },
    {
      id: 'presc-003', patientId: 'pat-seed-002', doctorId: doc2.id, createdAt: ago(45),
      medications: [
        { name: 'Isoniazid 300mg',   dosage: '300mg', frequency: 'วันละ 1 ครั้ง เช้า (ก่อนอาหาร)', duration: '6 เดือน' },
        { name: 'Rifampicin 600mg',  dosage: '600mg', frequency: 'วันละ 1 ครั้ง เช้า (ก่อนอาหาร)', duration: '6 เดือน' },
        { name: 'Pyrazinamide 25mg/kg', dosage: '1500mg', frequency: 'วันละ 1 ครั้ง', duration: '2 เดือน' },
        { name: 'Ethambutol 15mg/kg',   dosage: '900mg',  frequency: 'วันละ 1 ครั้ง', duration: '2 เดือน' },
      ],
      notes: 'สูตร 2HRZE จากนั้นต่อ 4HR ตรวจเสมหะซ้ำเดือนที่ 2 และ 5',
    },
    {
      id: 'presc-004', patientId: 'pat-seed-005', doctorId: doc1.id, createdAt: ago(90),
      medications: [
        { name: 'Efavirenz 600mg',       dosage: '600mg', frequency: 'วันละ 1 ครั้ง ก่อนนอน',          duration: 'ต่อเนื่อง' },
        { name: 'Tenofovir 300mg',       dosage: '300mg', frequency: 'วันละ 1 ครั้ง พร้อมอาหาร',        duration: 'ต่อเนื่อง' },
        { name: 'Emtricitabine 200mg',   dosage: '200mg', frequency: 'วันละ 1 ครั้ง',                    duration: 'ต่อเนื่อง' },
        { name: 'Co-trimoxazole 960mg',  dosage: '960mg', frequency: 'วันละ 1 ครั้ง (ป้องกัน PCP)',     duration: '6 เดือน' },
      ],
      notes: 'ติดตาม CD4 และ Viral Load ทุก 3 เดือน ส่งต่อคลินิก MMT สำหรับการบำบัดยาเสพติด',
    },
    {
      id: 'presc-005', patientId: 'pat-seed-007', doctorId: doc2.id, createdAt: ago(30),
      medications: [
        { name: 'Furosemide 40mg',   dosage: '40mg',  frequency: 'วันละ 1 ครั้ง เช้า',  duration: 'ต่อเนื่อง' },
        { name: 'Carvedilol 6.25mg', dosage: '6.25mg',frequency: 'วันละ 2 ครั้ง',        duration: 'ต่อเนื่อง' },
        { name: 'Enalapril 5mg',     dosage: '5mg',   frequency: 'วันละ 2 ครั้ง',        duration: 'ต่อเนื่อง' },
        { name: 'Spironolactone 25mg',dosage: '25mg', frequency: 'วันละ 1 ครั้ง',        duration: 'ต่อเนื่อง' },
      ],
      notes: 'จำกัดน้ำ 1.5 ลิตร/วัน จำกัดเกลือ ชั่งน้ำหนักทุกวัน ถ้าน้ำหนักเพิ่ม 2 กก./วัน ให้มาพบแพทย์',
    },
    {
      id: 'presc-006', patientId: 'pat-seed-008', doctorId: doc2.id, createdAt: ago(10),
      medications: [
        { name: 'Sertraline 50mg', dosage: '50mg', frequency: 'วันละ 1 ครั้ง เช้า (พร้อมอาหาร)', duration: '3 เดือน' },
      ],
      notes: 'เริ่มยา Sertraline ขนาดต่ำก่อน ปรับขนาดยาตามอาการ ติดตามทุก 2 สัปดาห์ แจ้งหากมีความคิดทำร้ายตัวเอง',
    },
  ];

  for (const p of prescriptionsData) {
    await prisma.prescription.upsert({
      where:  { id: p.id },
      update: {},
      create: { id: p.id, patientId: p.patientId, doctorId: p.doctorId, medications: p.medications, notes: p.notes, createdAt: p.createdAt },
    });
  }
  console.log(`✓ Prescriptions: ${prescriptionsData.length} records`);

  // ── Doctor Schedules ──────────────────────────────────────────────────────
  const schedulesData = [
    { id: 'sched-001', doctorId: doc1.id, date: ago(30),  startTime: '09:00', endTime: '12:00', location: 'สวนลุมพินี', notes: 'ตรวจสุขภาพเชิงรุก กลุ่มโรคเรื้อรัง' },
    { id: 'sched-002', doctorId: doc2.id, date: ago(20),  startTime: '13:00', endTime: '16:00', location: 'บริเวณหัวลำโพง', notes: 'ติดตามผู้ป่วยวัณโรคและ HIV' },
    { id: 'sched-003', doctorId: doc1.id, date: ago(7),   startTime: '10:00', endTime: '14:00', location: 'ใต้สะพานพระราม 4', notes: 'เยี่ยมผู้ป่วยฉุกเฉิน HN000001 และ HN000005' },
    { id: 'sched-004', doctorId: doc1.id, date: fwd(2),   startTime: '08:30', endTime: '12:00', location: 'สวนลุมพินี', notes: 'ตรวจสุขภาพรอบเดือน กลุ่มผู้ป่วยเรื้อรัง' },
    { id: 'sched-005', doctorId: doc2.id, date: fwd(3),   startTime: '13:00', endTime: '17:00', location: 'ชุมชนคลองเตย', notes: 'ติดตามการรักษาวัณโรค และประเมิน DOTS' },
    { id: 'sched-006', doctorId: doc1.id, date: fwd(7),   startTime: '09:00', endTime: '13:00', location: 'หน้าวัดบุรณศิริมาตยาราม', notes: 'คลินิกเคลื่อนที่ร่วมกับทีม CM' },
    { id: 'sched-007', doctorId: doc2.id, date: fwd(10),  startTime: '10:00', endTime: '15:00', location: 'บ้านรักแท้', notes: 'ตรวจสุขภาพผู้ป่วยจิตเวช ร่วมกับจิตแพทย์' },
    { id: 'sched-008', doctorId: doc1.id, date: fwd(14),  startTime: '08:00', endTime: '12:00', location: 'สวนลุมพินี', notes: 'ออกหน่วยแพทย์เคลื่อนที่ประจำเดือน' },
  ];

  for (const s of schedulesData) {
    await prisma.doctorSchedule.upsert({
      where:  { id: s.id },
      update: {},
      create: { id: s.id, organizationId: org.id, doctorId: s.doctorId, date: s.date, startTime: s.startTime, endTime: s.endTime, location: s.location, notes: s.notes },
    });
  }
  console.log(`✓ Doctor schedules: ${schedulesData.length} records (3 past, 5 upcoming)`);

  // ── Care Plan Assessments ─────────────────────────────────────────────────
  const assessmentsData = [
    {
      id: 'assess-001', patientId: 'pat-seed-001',
      assessmentDate: ago(60), locationFound: 'ใต้สะพานปิ่นเกล้าฝั่งธน',
      careSetting: 'Roadside', referralSource: 'Field Outreach / ลงพื้นที่',
      status: 'Active', helpGoal: 'ทางการแพทย์และทางสังคม',
      homelessType: 'คนไร้บ้านหน้าเก่า (2ปี+)', healthcareRight: 'บัตรทอง',
      ncdConditions: ['เบาหวาน / Diabetes', 'ความดันโลหิตสูง / Hypertension'],
      medicalGoals: ['ควบคุมโรคประจำตัว', 'รับยาและกินยาได้ต่อเนื่อง'],
      socialGoals: ['เข้าถึงสิทธิการรักษาพยาบาล', 'จัดหาที่พักพิงฉุกเฉิน/ชั่วคราว'],
      notes: 'ผู้ป่วยอาศัยอยู่ใต้สะพานมา 3 ปี มีประวัติเบาหวานและความดัน ขาดยามา 2 เดือน',
    },
    {
      id: 'assess-002', patientId: 'pat-seed-002',
      assessmentDate: ago(45), locationFound: 'บ้านอิ่มใจ',
      careSetting: 'Non-Governmental Shelter (NGO)', referralSource: 'อิ่มใจ',
      status: 'Active', helpGoal: 'ทางการแพทย์และทางสังคม',
      homelessType: 'คนไร้บ้านหน้าใหม่ (2ปี-)', healthcareRight: 'ไม่มีสิทธิ',
      infectiousConditions: ['วัณโรค (TB) / Tuberculosis'],
      medicalGoals: ['รับยาและกินยาได้ต่อเนื่อง', 'ตรวจคัดกรองโรคติดต่อ'],
      socialGoals: ['ทำบัตรประชาชน', 'เข้าถึงสิทธิการรักษาพยาบาล'],
      notes: 'ผู้ป่วยไม่มีบัตรประชาชน ต้องเร่งดำเนินการด้านสิทธิก่อน',
    },
    {
      id: 'assess-003', patientId: 'pat-seed-005',
      assessmentDate: ago(90), locationFound: 'หัวลำโพง',
      careSetting: 'Roadside', referralSource: 'Field Outreach / ลงพื้นที่',
      status: 'Active', helpGoal: 'ทางการแพทย์และทางสังคม',
      homelessType: 'คนไร้บ้านหน้าเก่า (2ปี+)', healthcareRight: 'บัตรทอง',
      infectiousConditions: ['เอชไอวี (HIV/AIDS)'],
      substanceConditions: ['ติดสารเสพติด / Drug Addiction'],
      medicalGoals: ['ควบคุมโรคประจำตัว', 'บำบัดสารเสพติด/แอลกอฮอล์', 'รับยาและกินยาได้ต่อเนื่อง'],
      socialGoals: ['จัดหาที่พักพิงฉุกเฉิน/ชั่วคราว', 'บำบัดสารเสพติด'],
      notes: 'พบผู้ป่วยนอนอยู่บริเวณสถานีหัวลำโพง มีสภาพร่างกายซูบผอม ต้องการการดูแลเร่งด่วน',
    },
    {
      id: 'assess-004', patientId: 'pat-seed-007',
      assessmentDate: ago(50), locationFound: 'วงเวียน 22',
      careSetting: 'Roadside', referralSource: 'Mobile Clinic',
      status: 'Follow-up', helpGoal: 'ทางการแพทย์',
      homelessType: 'คนไร้บ้านหน้าเก่า (2ปี+)', healthcareRight: 'ประกันสังคม',
      ncdConditions: ['โรคหัวใจ / Heart Disease', 'ความดันโลหิตสูง / Hypertension'],
      medicalGoals: ['ควบคุมโรคประจำตัว', 'การดูแลระยะยาว/ประคับประคอง'],
      socialGoals: ['จัดหาที่อยู่อาศัยถาวร/เช่าห้อง'],
      notes: 'ผู้สูงอายุ 73 ปี มีบุตรแต่ขาดการติดต่อ กำลังประสานงานหาครอบครัว',
    },
  ];

  for (const a of assessmentsData) {
    const { id, patientId, assessmentDate, ...rest } = a;
    await prisma.carePlanAssessment.upsert({
      where:  { id },
      update: {},
      create: {
        id, patientId, assessmentDate,
        ...rest,
        ncdConditions:            (rest as any).ncdConditions ?? [],
        infectiousConditions:     (rest as any).infectiousConditions ?? [],
        mentalConditions:         (rest as any).mentalConditions ?? [],
        substanceConditions:      (rest as any).substanceConditions ?? [],
        disabilityConditions:     (rest as any).disabilityConditions ?? [],
        otherConditionCategories: (rest as any).otherConditionCategories ?? [],
        medicalGoals:             (rest as any).medicalGoals ?? [],
        socialGoals:              (rest as any).socialGoals ?? [],
      },
    });
  }
  console.log(`✓ Care plan assessments: ${assessmentsData.length} records`);

  // ── Audit Logs ────────────────────────────────────────────────────────────
  const auditLogsData = [
    // ── User management ──
    { id: 'audit-001', actorId: 'user-seed-sa',    action: 'CREATE_USER',      entity: 'User',          entityId: 'user-seed-fw2',   detail: 'น.ส.สุกัญญา ช่วยเหลือ (CARE_GIVER)',               createdAt: ago(60) },
    { id: 'audit-002', actorId: 'user-seed-sa',    action: 'CREATE_USER',      entity: 'User',          entityId: 'user-seed-fw3',   detail: 'นายพิทักษ์ ดูแลชุมชน (CARE_GIVER)',                createdAt: ago(58) },
    { id: 'audit-003', actorId: 'user-seed-sa',    action: 'CREATE_USER',      entity: 'User',          entityId: 'user-seed-doc2',  detail: 'พญ.อารีย์ สุขสวัสดิ์ (DOCTOR)',                   createdAt: ago(55) },
    { id: 'audit-004', actorId: 'user-seed-sa',    action: 'DEACTIVATE_USER',  entity: 'User',          entityId: 'user-seed-fw3',   detail: 'นายพิทักษ์ ดูแลชุมชน — ลาออก',                    createdAt: ago(10) },
    // ── Patient management ──
    { id: 'audit-005', actorId: 'user-seed-cm1',   action: 'CREATE_PATIENT',   entity: 'Patient',       entityId: 'pat-seed-001',    detail: 'HN000001 นายสมศักดิ์ พลัดถิ่น',                   createdAt: ago(90) },
    { id: 'audit-006', actorId: 'user-seed-cm1',   action: 'CREATE_PATIENT',   entity: 'Patient',       entityId: 'pat-seed-002',    detail: 'HN000002 นางสาวอรุณี ไร้ที่พัก',                  createdAt: ago(88) },
    { id: 'audit-007', actorId: 'user-seed-cm2',   action: 'CREATE_PATIENT',   entity: 'Patient',       entityId: 'pat-seed-003',    detail: 'HN000003 นายวิชัย สนามหลวง',                      createdAt: ago(85) },
    { id: 'audit-008', actorId: 'user-seed-cm2',   action: 'CREATE_PATIENT',   entity: 'Patient',       entityId: 'pat-seed-004',    detail: 'HN000004 นางมะลิ แรงงานหนองจอก',                  createdAt: ago(80) },
    { id: 'audit-009', actorId: 'user-seed-cm1',   action: 'CREATE_PATIENT',   entity: 'Patient',       entityId: 'pat-seed-005',    detail: 'HN000005 นายอานนท์ เยาวราช',                      createdAt: ago(75) },
    { id: 'audit-010', actorId: 'user-seed-cm2',   action: 'CREATE_PATIENT',   entity: 'Patient',       entityId: 'pat-seed-006',    detail: 'HN000006 นางรัตนา คลองแสนแสบ',                    createdAt: ago(70) },
    { id: 'audit-011', actorId: 'user-seed-cm2',   action: 'CREATE_PATIENT',   entity: 'Patient',       entityId: 'pat-seed-007',    detail: 'HN000007 นายบุญมี ท่าพระจันทร์',                  createdAt: ago(65) },
    { id: 'audit-012', actorId: 'user-seed-cm1',   action: 'CREATE_PATIENT',   entity: 'Patient',       entityId: 'pat-seed-008',    detail: 'HN000008 นายธนากร บ้านหม้อ',                      createdAt: ago(60) },
    // ── Events ──
    { id: 'audit-013', actorId: 'user-seed-cm1',   action: 'CREATE_EVENT',     entity: 'Event',         entityId: 'evt-old-001',     detail: 'สำรวจผู้ป่วยใหม่ในชุมชน',                         createdAt: ago(50) },
    { id: 'audit-014', actorId: 'user-seed-cm1',   action: 'CREATE_EVENT',     entity: 'Event',         entityId: 'evt-old-002',     detail: 'แจกยาและตรวจสุขภาพประจำเดือน (กุมภาพันธ์)',       createdAt: ago(35) },
    { id: 'audit-015', actorId: 'user-seed-cm1',   action: 'CREATE_EVENT',     entity: 'Event',         entityId: 'evt-old-003',     detail: 'ติดตามผู้ป่วยวัณโรคและ HIV',                      createdAt: ago(25) },
    { id: 'audit-016', actorId: 'user-seed-cm2',   action: 'CREATE_EVENT',     entity: 'Event',         entityId: 'evt-old-004',     detail: 'แจกยาและตรวจสุขภาพประจำเดือน (มีนาคม)',           createdAt: ago(18) },
    { id: 'audit-017', actorId: 'user-seed-cm1',   action: 'CREATE_EVENT',     entity: 'Event',         entityId: 'evt-old-005',     detail: 'เยี่ยมผู้ป่วยฉุกเฉิน — ตามสัญญาณ SOS',           createdAt: ago(7) },
    { id: 'audit-018', actorId: 'user-seed-cm1',   action: 'CREATE_EVENT',     entity: 'Event',         entityId: 'evt-curr-001',    detail: 'ลงพื้นที่เยี่ยมผู้ป่วยวิกฤต',                     createdAt: ago(1) },
    { id: 'audit-019', actorId: 'user-seed-cm2',   action: 'CREATE_EVENT',     entity: 'Event',         entityId: 'evt-curr-002',    detail: 'ติดตามผู้ป่วยกลุ่มเบาหวาน',                       createdAt: ago(1) },
    { id: 'audit-020', actorId: 'user-seed-cm1',   action: 'DELETE_EVENT',     entity: 'Event',         entityId: 'evt-deleted-x1',  detail: 'ประชุมทีม (ยกเลิก)',                               createdAt: ago(20) },
    // ── Inventory ──
    { id: 'audit-021', actorId: 'user-seed-admin', action: 'CREATE_ITEM',      entity: 'InventoryItem', entityId: 'inv-item-001',    detail: 'Metformin 500mg (เม็ด)',                            createdAt: ago(120) },
    { id: 'audit-022', actorId: 'user-seed-admin', action: 'CREATE_ITEM',      entity: 'InventoryItem', entityId: 'inv-item-005',    detail: 'Isoniazid 300mg (เม็ด)',                            createdAt: ago(120) },
    { id: 'audit-023', actorId: 'user-seed-admin', action: 'CREATE_ITEM',      entity: 'InventoryItem', entityId: 'inv-item-007',    detail: 'Efavirenz 600mg (เม็ด)',                            createdAt: ago(120) },
    { id: 'audit-024', actorId: 'user-seed-admin', action: 'STOCK_IN',         entity: 'InventoryItem', entityId: 'inv-item-001',    detail: 'Metformin 500mg +200 เม็ด (RX-2026-002)',           createdAt: ago(90) },
    { id: 'audit-025', actorId: 'user-seed-admin', action: 'STOCK_IN',         entity: 'InventoryItem', entityId: 'inv-item-003',    detail: 'Paracetamol 500mg +500 เม็ด (RX-2026-002)',         createdAt: ago(90) },
    { id: 'audit-026', actorId: 'user-seed-admin', action: 'STOCK_IN',         entity: 'InventoryItem', entityId: 'inv-item-005',    detail: 'Isoniazid 300mg +150 เม็ด (RX-2026-002)',           createdAt: ago(90) },
    { id: 'audit-027', actorId: 'user-seed-admin', action: 'STOCK_IN',         entity: 'InventoryItem', entityId: 'inv-item-007',    detail: 'Efavirenz 600mg +120 เม็ด (RX-2026-002)',           createdAt: ago(90) },
    { id: 'audit-028', actorId: 'user-seed-mv1',   action: 'STOCK_IN',         entity: 'InventoryItem', entityId: 'inv-item-002',    detail: 'Amlodipine 5mg +300 เม็ด (RX-2026-003)',            createdAt: ago(60) },
    { id: 'audit-029', actorId: 'user-seed-mv1',   action: 'STOCK_IN',         entity: 'InventoryItem', entityId: 'inv-item-008',    detail: 'Atenolol 50mg +250 เม็ด (RX-2026-003)',             createdAt: ago(60) },
    // ── Care plans ──
    { id: 'audit-030', actorId: 'user-seed-cm1',   action: 'CARE_PLAN',        entity: 'CarePlanItem',  entityId: 'cp-001-1',        detail: 'ตรวจระดับน้ำตาลในเลือด (HN000001)',                createdAt: ago(88) },
    { id: 'audit-031', actorId: 'user-seed-cm1',   action: 'CARE_PLAN',        entity: 'CarePlanItem',  entityId: 'cp-002-1',        detail: 'ให้ยา Isoniazid + Rifampicin (HN000002)',           createdAt: ago(44) },
    { id: 'audit-032', actorId: 'user-seed-cm2',   action: 'CARE_PLAN',        entity: 'CarePlanItem',  entityId: 'cp-007-1',        detail: 'ตรวจ EKG (HN000007)',                              createdAt: ago(30), adminNote: 'ผลปกติ EF 40%' },
    { id: 'audit-033', actorId: 'user-seed-cm1',   action: 'CARE_PLAN',        entity: 'CarePlanItem',  entityId: 'cp-005-3',        detail: 'ตรวจ CD4 (HN000005)',                              createdAt: ago(13) },
    // ── Dispense ──
    { id: 'audit-034', actorId: 'user-seed-fw1',   action: 'DISPENSE',         entity: 'InventoryItem', entityId: 'inv-item-001',    detail: 'จ่าย Metformin 500mg ×60 เม็ด ให้ HN000001',       createdAt: ago(29) },
    { id: 'audit-035', actorId: 'user-seed-fw1',   action: 'DISPENSE',         entity: 'InventoryItem', entityId: 'inv-item-002',    detail: 'จ่าย Amlodipine 5mg ×30 เม็ด ให้ HN000001',        createdAt: ago(29) },
    { id: 'audit-036', actorId: 'user-seed-mv1',   action: 'DISPENSE',         entity: 'InventoryItem', entityId: 'inv-item-006',    detail: 'จ่าย Rifampicin 600mg ×30 เม็ด ให้ HN000002',      createdAt: ago(20) },
    { id: 'audit-037', actorId: 'user-seed-fw1',   action: 'DISPENSE',         entity: 'InventoryItem', entityId: 'inv-item-007',    detail: 'จ่าย Efavirenz 600mg ×30 เม็ด ให้ HN000005',       createdAt: ago(13) },
    { id: 'audit-038', actorId: 'user-seed-fw1',   action: 'DISPENSE',         entity: 'InventoryItem', entityId: 'inv-item-001',    detail: 'จ่าย Metformin 500mg ×60 เม็ด ให้ HN000006',       createdAt: ago(13) },
    { id: 'audit-039', actorId: 'user-seed-mv1',   action: 'DISPENSE',         entity: 'InventoryItem', entityId: 'inv-item-008',    detail: 'จ่าย Atenolol 50mg ×30 เม็ด ให้ HN000007',         createdAt: ago(13), adminNote: 'ส่งมอบที่ท่าพระจันทร์' },
    { id: 'audit-040', actorId: 'user-seed-cm1',   action: 'DISPENSE',         entity: 'InventoryItem', entityId: 'inv-item-007',    detail: 'จ่าย Efavirenz 600mg ×30 เม็ด ให้ HN000005',       createdAt: ago(7) },
  ];

  await prisma.auditLog.createMany({
    skipDuplicates: true,
    data: auditLogsData.map(({ id, actorId, action, entity, entityId, detail, createdAt, adminNote }) => ({
      id,
      organizationId: org.id,
      actorId,
      action,
      entity,
      entityId,
      detail,
      adminNote,
      createdAt,
    })),
  });
  console.log(`✓ Audit logs: ${auditLogsData.length} records`);

  console.log('\n✅ Seed complete!\n');
  console.log('องค์กร: มูลนิธิเพื่อคนไร้บ้านแห่งกรุงเทพ');
  console.log('Zones: เขตพระนคร, เขตป้อมปราบศัตรูพ่าย, เขตหนองจอก, เขตสัมพันธวงศ์\n');
  console.log('Credentials:');
  console.log('  admin@hospital.th  / Admin1234!     (ADMIN)           ผู้ดูแลระบบ');
  console.log('  sa@hospital.th     / SuperAdmin1!   (SUPER_ADMIN)     ผอ.ศิริพร มั่นคง');
  console.log('  cm1@hospital.th    / CaseManager1!  (CASE_MANAGER)    น.ส.มาลี สายใจ');
  console.log('  cm2@hospital.th    / CaseManager1!  (CASE_MANAGER)    นายวิชาญ ดูแลดี');
  console.log('  fw1@hospital.th    / CareGiv1!      (CARE_GIVER)      นายอภิชาต ลงพื้นที่');
  console.log('  mv1@hospital.th    / MedVol1234!    (MEDICAL_VOLUNTEER) น.ส.ปรียา ใจเกื้อ');
  console.log('  doc1@hospital.th   / Doctor1234!    (DOCTOR)          นพ.ณัฐวุฒิ รักษาดี');
  console.log('  doc2@hospital.th   / Doctor1234!    (DOCTOR)          พญ.อารีย์ สุขสวัสดิ์');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

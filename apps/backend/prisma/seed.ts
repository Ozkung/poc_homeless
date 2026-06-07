import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createCipheriv, randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

const prisma = new PrismaClient();

const ENC_KEY = process.env.ENCRYPTION_KEY ?? '0'.repeat(64);

function encryptName(plaintext: string): string {
  const key = Buffer.from(ENC_KEY, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function hash(pw: string) {
  return bcrypt.hash(pw, 12);
}

async function main() {
  console.log('🌱 Seeding database...');

  // ── Organisation ─────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { id: 'org-seed-001' },
    update: {},
    create: { id: 'org-seed-001', name: 'โรงพยาบาลชุมชนกรุงเทพ' },
  });
  console.log(`✓ Organisation: ${org.name}`);

  // ── Users ─────────────────────────────────────────────────────────────────
  const adminPw   = await hash('Admin1234!');
  const cmPw      = await hash('CaseManager1!');
  const fwPw      = await hash('FieldWork1!');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@hospital.th' },
    update: {},
    create: {
      id: 'user-seed-admin',
      organizationId: org.id,
      email: 'admin@hospital.th',
      passwordHash: adminPw,
      role: 'ADMIN',
      displayName: 'ผู้ดูแลระบบ',
    },
  });

  const cm1 = await prisma.user.upsert({
    where: { email: 'cm1@hospital.th' },
    update: {},
    create: {
      id: 'user-seed-cm1',
      organizationId: org.id,
      email: 'cm1@hospital.th',
      passwordHash: cmPw,
      role: 'CASE_MANAGER',
      displayName: 'นายสมชาย ดูแลดี',
    },
  });

  const cm2 = await prisma.user.upsert({
    where: { email: 'cm2@hospital.th' },
    update: {},
    create: {
      id: 'user-seed-cm2',
      organizationId: org.id,
      email: 'cm2@hospital.th',
      passwordHash: cmPw,
      role: 'CASE_MANAGER',
      displayName: 'น.ส.มาลี ใจดี',
    },
  });

  const fw1 = await prisma.user.upsert({
    where: { email: 'fw1@hospital.th' },
    update: {},
    create: {
      id: 'user-seed-fw1',
      organizationId: org.id,
      email: 'fw1@hospital.th',
      passwordHash: fwPw,
      role: 'FIELD_WORKER',
      displayName: 'นายประยุทธ ลงพื้นที่',
    },
  });

  console.log(`✓ Users: admin, cm1, cm2, fw1`);

  // ── Patients ──────────────────────────────────────────────────────────────
  const patientsData = [
    {
      id: 'pat-seed-001', hn: 'HN000001',
      name: 'นายสมศักดิ์ พลัดบ้าน', age: 52, gender: 'MALE' as const,
      status: 'CRITICAL' as const, locationText: 'ใต้สะพานพระราม 4',
      conditions: ['เบาหวาน', 'ความดันโลหิตสูง'],
    },
    {
      id: 'pat-seed-002', hn: 'HN000002',
      name: 'นางสาวอรุณี หาที่พัก', age: 38, gender: 'FEMALE' as const,
      status: 'PENDING' as const, locationText: 'ตลาดนัดจตุจักร',
      conditions: ['วัณโรค'],
    },
    {
      id: 'pat-seed-003', hn: 'HN000003',
      name: 'นายวิชัย ไร้ที่อยู่', age: 67, gender: 'MALE' as const,
      status: 'STABLE' as const, locationText: 'สวนลุมพินี',
      conditions: ['ข้ออักเสบ', 'ต้อกระจก'],
    },
    {
      id: 'pat-seed-004', hn: 'HN000004',
      name: 'นางมะลิ สีเงิน', age: 45, gender: 'FEMALE' as const,
      status: 'STABLE' as const, locationText: 'หน้าห้างสรรพสินค้าบิ๊กซี รามคำแหง',
      conditions: [],
    },
    {
      id: 'pat-seed-005', hn: 'HN000005',
      name: 'นายอานนท์ ทุกข์ยาก', age: 29, gender: 'MALE' as const,
      status: 'CRITICAL' as const, locationText: 'บริเวณสถานีรถไฟหัวลำโพง',
      conditions: ['ติดยาเสพติด', 'HIV'],
    },
    {
      id: 'pat-seed-006', hn: 'HN000006',
      name: 'นางรัตนา ชีวิตใหม่', age: 55, gender: 'FEMALE' as const,
      status: 'PENDING' as const, locationText: 'ชุมชนแออัดคลองเตย',
      conditions: ['เบาหวาน'],
    },
    {
      id: 'pat-seed-007', hn: 'HN000007',
      name: 'นายบุญมี ขาดรายได้', age: 73, gender: 'MALE' as const,
      status: 'STABLE' as const, locationText: 'วัดโพธิ์ ท่าเตียน',
      conditions: ['หัวใจ', 'ความดันโลหิตสูง'],
    },
  ];

  for (const p of patientsData) {
    await prisma.patient.upsert({
      where: { hn: p.hn },
      update: {},
      create: {
        id: p.id,
        organizationId: org.id,
        caseManagerId: cm1.id,
        nameEnc: encryptName(p.name),
        hn: p.hn,
        age: p.age,
        gender: p.gender,
        status: p.status,
        locationText: p.locationText,
        conditions: p.conditions,
      },
    });
  }
  console.log(`✓ Patients: ${patientsData.length} records`);

  // ── Form Templates ────────────────────────────────────────────────────────
  const form1 = await prisma.formTemplate.upsert({
    where: { id: 'form-seed-001' },
    update: {},
    create: {
      id: 'form-seed-001',
      organizationId: org.id,
      createdById: admin.id,
      title: 'แบบประเมินสุขภาพเบื้องต้น',
      description: 'ใช้ประเมินสุขภาพผู้ป่วยในชุมชนครั้งแรก',
      fields: [
        { id: 'f1', type: 'number', label: 'น้ำหนัก (กก.)', required: true, order: 0 },
        { id: 'f2', type: 'number', label: 'ส่วนสูง (ซม.)', required: true, order: 1 },
        { id: 'f3', type: 'number', label: 'ความดันโลหิต (Systolic)', required: false, order: 2 },
        { id: 'f4', type: 'number', label: 'ความดันโลหิต (Diastolic)', required: false, order: 3 },
        { id: 'f5', type: 'select', label: 'ระดับความเจ็บปวด', required: true, order: 4 },
        { id: 'f6', type: 'textarea', label: 'อาการที่สังเกตพบ', required: false, order: 5 },
      ],
    },
  });

  const form2 = await prisma.formTemplate.upsert({
    where: { id: 'form-seed-002' },
    update: {},
    create: {
      id: 'form-seed-002',
      organizationId: org.id,
      createdById: cm1.id,
      title: 'แบบประเมินความเสี่ยงและความต้องการ',
      description: 'ประเมินความเสี่ยงและความต้องการขั้นพื้นฐานของผู้ป่วย',
      fields: [
        { id: 'g1', type: 'radio', label: 'มีที่พักอาศัยหรือไม่', required: true, order: 0 },
        { id: 'g2', type: 'radio', label: 'มีรายได้ประจำหรือไม่', required: true, order: 1 },
        { id: 'g3', type: 'scale', label: 'ระดับความปลอดภัยในพื้นที่ (1-5)', required: false, order: 2 },
        { id: 'g4', type: 'text', label: 'ญาติผู้ใกล้ชิดที่ติดต่อได้', required: false, order: 3 },
        { id: 'g5', type: 'textarea', label: 'ความต้องการเร่งด่วน', required: false, order: 4 },
      ],
    },
  });

  console.log(`✓ Form templates: ${form1.title}, ${form2.title}`);

  // ── Events ────────────────────────────────────────────────────────────────
  const now = new Date();
  const inDays = (d: number) => new Date(now.getTime() + d * 86400_000);

  const event1 = await prisma.event.upsert({
    where: { id: 'evt-seed-001' },
    update: {},
    create: {
      id: 'evt-seed-001',
      organizationId: org.id,
      createdById: cm1.id,
      title: 'ลงพื้นที่เยี่ยมผู้ป่วยวิกฤต',
      startDate: inDays(1),
      endDate: inDays(1),
      priority: 'CRITICAL',
      note: 'เน้นผู้ป่วยที่มีอาการรุนแรง ต้องเตรียมยาและอุปกรณ์ฉุกเฉิน',
    },
  });

  const event2 = await prisma.event.upsert({
    where: { id: 'evt-seed-002' },
    update: {},
    create: {
      id: 'evt-seed-002',
      organizationId: org.id,
      createdById: cm1.id,
      title: 'ติดตามผู้ป่วยกลุ่มเบาหวาน',
      startDate: inDays(3),
      endDate: inDays(5),
      priority: 'URGENT',
      note: 'เจาะเลือดและแจกยาประจำเดือน',
    },
  });

  const event3 = await prisma.event.upsert({
    where: { id: 'evt-seed-003' },
    update: {},
    create: {
      id: 'evt-seed-003',
      organizationId: org.id,
      createdById: cm2.id,
      title: 'เยี่ยมผู้ป่วยประจำเดือน',
      startDate: inDays(7),
      endDate: inDays(8),
      priority: 'NORMAL',
    },
  });

  console.log(`✓ Events: 3 records`);

  // ── Event Tasks ───────────────────────────────────────────────────────────
  await prisma.eventTask.upsert({
    where: { id: 'task-seed-001' },
    update: {},
    create: {
      id: 'task-seed-001',
      eventId: event1.id,
      patientId: 'pat-seed-001',
      assigneeId: fw1.id,
      formTemplateId: form1.id,
      status: 'PENDING',
    },
  });

  await prisma.eventTask.upsert({
    where: { id: 'task-seed-002' },
    update: {},
    create: {
      id: 'task-seed-002',
      eventId: event1.id,
      patientId: 'pat-seed-005',
      assigneeId: fw1.id,
      formTemplateId: form1.id,
      status: 'PENDING',
    },
  });

  await prisma.eventTask.upsert({
    where: { id: 'task-seed-003' },
    update: {},
    create: {
      id: 'task-seed-003',
      eventId: event2.id,
      patientId: 'pat-seed-001',
      assigneeId: cm1.id,
      formTemplateId: form2.id,
      status: 'IN_PROGRESS',
    },
  });

  await prisma.eventTask.upsert({
    where: { id: 'task-seed-004' },
    update: {},
    create: {
      id: 'task-seed-004',
      eventId: event3.id,
      patientId: 'pat-seed-003',
      assigneeId: cm2.id,
      status: 'PENDING',
    },
  });

  console.log(`✓ Event tasks: 4 records`);

  // ── Activities ────────────────────────────────────────────────────────────
  await prisma.activity.createMany({
    skipDuplicates: true,
    data: [
      { id: 'act-001', actorId: cm1.id, patientId: 'pat-seed-001', type: 'CHECK_IN',      payload: { note: 'ผู้ป่วยอาการทรงตัว ให้ยาและนัดติดตาม' }, createdAt: inDays(-5) },
      { id: 'act-002', actorId: cm1.id, patientId: 'pat-seed-001', type: 'STATUS_CHANGE',  payload: { from: 'PENDING', to: 'CRITICAL' },               createdAt: inDays(-3) },
      { id: 'act-003', actorId: fw1.id,  patientId: 'pat-seed-002', type: 'CHECK_IN',      payload: { note: 'พบผู้ป่วยบริเวณตลาด ส่งต่อพยาบาล' },      createdAt: inDays(-7) },
      { id: 'act-004', actorId: cm2.id,  patientId: 'pat-seed-003', type: 'NOTE',           payload: { note: 'ผู้ป่วยขอยาลดปวดข้อ' },                  createdAt: inDays(-2) },
      { id: 'act-005', actorId: cm1.id,  patientId: 'pat-seed-005', type: 'ASSIGN',         payload: { assignee: fw1.displayName },                     createdAt: inDays(-1) },
    ],
  });

  console.log(`✓ Activities: 5 records`);
  console.log('\n✅ Seed complete!\n');
  console.log('Default credentials:');
  console.log('  admin@hospital.th   / Admin1234!     (ADMIN)');
  console.log('  cm1@hospital.th     / CaseManager1!  (CASE_MANAGER)');
  console.log('  cm2@hospital.th     / CaseManager1!  (CASE_MANAGER)');
  console.log('  fw1@hospital.th     / FieldWork1!    (FIELD_WORKER)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

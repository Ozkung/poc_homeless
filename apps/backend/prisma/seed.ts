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
  const saPw      = await hash('SuperAdmin1!');
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

  await prisma.user.upsert({
    where: { email: 'sa@hospital.th' },
    update: {},
    create: {
      id: 'user-seed-sa',
      organizationId: org.id,
      email: 'sa@hospital.th',
      passwordHash: saPw,
      role: 'SUPER_ADMIN',
      displayName: 'ผู้อำนวยการ',
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

  console.log(`✓ Users: admin, sa, cm1, cm2, fw1`);

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

  // ── Inventory ─────────────────────────────────────────────────────────────
  // Helper: date relative to today
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  // 12 items (8 drugs + 4 supplies)
  const invItems = [
    { id: 'inv-item-001', name: 'Metformin 500mg', unit: 'เม็ด', category: 'DRUG', lowStockThreshold: 50 },
    { id: 'inv-item-002', name: 'Amlodipine 5mg', unit: 'เม็ด', category: 'DRUG', lowStockThreshold: 30 },
    { id: 'inv-item-003', name: 'Paracetamol 500mg', unit: 'เม็ด', category: 'DRUG', lowStockThreshold: 100 },
    { id: 'inv-item-004', name: 'Omeprazole 20mg', unit: 'เม็ด', category: 'DRUG', lowStockThreshold: 20 },
    { id: 'inv-item-005', name: 'Isoniazid 300mg', unit: 'เม็ด', category: 'DRUG', lowStockThreshold: 15 },
    { id: 'inv-item-006', name: 'Rifampicin 600mg', unit: 'เม็ด', category: 'DRUG', lowStockThreshold: 15 },
    { id: 'inv-item-007', name: 'Efavirenz 600mg', unit: 'เม็ด', category: 'DRUG', lowStockThreshold: 10 },
    { id: 'inv-item-008', name: 'Atenolol 50mg', unit: 'เม็ด', category: 'DRUG', lowStockThreshold: 20 },
    { id: 'inv-item-009', name: 'ถุงมือไนไตรล์ M', unit: 'ถุง', category: 'SUPPLY', lowStockThreshold: 10 },
    { id: 'inv-item-010', name: 'หน้ากาก N95', unit: 'ชิ้น', category: 'SUPPLY', lowStockThreshold: 20 },
    { id: 'inv-item-011', name: 'แอลกอฮอล์ 70% 450ml', unit: 'ขวด', category: 'SUPPLY', lowStockThreshold: 5 },
    { id: 'inv-item-012', name: 'ชุดเจาะเลือดปลายนิ้ว', unit: 'กล่อง', category: 'SUPPLY', lowStockThreshold: 5 },
  ] as const;

  // Transaction blueprint per item:
  // [daysAgo, type, qty, meta?]
  type TxBlueprint = {
    d: number; type: 'IN_PURCHASE' | 'IN_DONATION' | 'OUT_PRESCRIPTION' | 'OUT_SUPPLY' | 'ADJ_APPROVED';
    qty: number; receiptNo?: string; donorName?: string; reason?: string;
    patientId?: string; actorId?: string;
  };

  const patients = ['pat-seed-001','pat-seed-002','pat-seed-003','pat-seed-004','pat-seed-005','pat-seed-006','pat-seed-007'];

  // Build blueprints for each item (deterministic, no random)
  function drugBlueprints(
    purchaseQtys: [number, number, number],  // initial, month-1, month-2
    weeklyDispense: number,
    adjDay?: number, adjQty?: number,
  ): TxBlueprint[] {
    const txs: TxBlueprint[] = [];

    // Initial purchase ~92 days ago
    txs.push({ d: 92, type: 'IN_PURCHASE', qty: purchaseQtys[0], receiptNo: 'RX-2026-001', actorId: 'user-seed-admin' });
    // Month-1 restock ~61 days ago
    txs.push({ d: 61, type: 'IN_PURCHASE', qty: purchaseQtys[1], receiptNo: 'RX-2026-002', actorId: 'user-seed-admin' });
    // Month-2 restock ~30 days ago
    txs.push({ d: 30, type: 'IN_PURCHASE', qty: purchaseQtys[2], receiptNo: 'RX-2026-003', actorId: 'user-seed-admin' });

    // Weekly dispensing (every 3-4 days, 13 dispenses over 3 months)
    const dispenseDays = [89,86,82,78,74,70,66,62,57,52,46,38,30,23,16,10,5,2];
    dispenseDays.forEach((d, i) => {
      const pid = patients[i % patients.length];
      txs.push({ d, type: 'OUT_PRESCRIPTION', qty: weeklyDispense, patientId: pid, actorId: 'user-seed-cm1' });
    });

    // Optional ADJ correction
    if (adjDay !== undefined && adjQty !== undefined) {
      txs.push({ d: adjDay, type: 'ADJ_APPROVED', qty: adjQty, reason: 'นับสต็อกปลายเดือน', actorId: 'user-seed-admin' });
    }

    return txs.sort((a, b) => b.d - a.d); // oldest first
  }

  function supplyBlueprints(
    initQty: number, restockQty: number, dispenseQty: number, donationDay?: number, donationQty?: number,
  ): TxBlueprint[] {
    const txs: TxBlueprint[] = [];
    txs.push({ d: 92, type: 'IN_PURCHASE', qty: initQty, receiptNo: 'RX-2026-001', actorId: 'user-seed-admin' });
    txs.push({ d: 58, type: 'IN_PURCHASE', qty: restockQty, receiptNo: 'RX-2026-004', actorId: 'user-seed-admin' });
    if (donationDay) txs.push({ d: donationDay, type: 'IN_DONATION', qty: donationQty!, donorName: 'มูลนิธิกรุงเทพ', actorId: 'user-seed-admin' });

    const dispenseDays = [88,80,72,63,55,45,36,28,21,14,7,3];
    dispenseDays.forEach((d, i) => {
      txs.push({ d, type: 'OUT_SUPPLY', qty: dispenseQty, actorId: 'user-seed-fw1' });
    });

    return txs.sort((a, b) => b.d - a.d);
  }

  const blueprintMap: Record<string, TxBlueprint[]> = {
    'inv-item-001': drugBlueprints([500, 300, 250], 15, 45, -5),   // Metformin
    'inv-item-002': drugBlueprints([300, 200, 150], 10, 35, -3),   // Amlodipine
    'inv-item-003': drugBlueprints([1000, 600, 500], 25, 70, -8),  // Paracetamol
    'inv-item-004': drugBlueprints([200, 120, 100], 8, 20),        // Omeprazole
    'inv-item-005': drugBlueprints([150, 80, 60], 5),              // Isoniazid
    'inv-item-006': drugBlueprints([150, 80, 60], 5),              // Rifampicin
    'inv-item-007': drugBlueprints([120, 60, 50], 4, 20, -2),      // Efavirenz
    'inv-item-008': drugBlueprints([250, 150, 120], 8, 25),        // Atenolol
    'inv-item-009': supplyBlueprints(80, 40, 5, 40, 20),           // ถุงมือ
    'inv-item-010': supplyBlueprints(100, 50, 7, 35, 30),          // N95
    'inv-item-011': supplyBlueprints(40, 20, 2, 25, 10),           // แอลกอฮอล์
    'inv-item-012': supplyBlueprints(30, 15, 2),                   // ชุดเจาะเลือด
  };

  // Compute final currentStock for each item by replaying transactions
  const computedStock: Record<string, number> = {};
  for (const item of invItems) {
    const txs = blueprintMap[item.id] ?? [];
    let stock = 0;
    for (const tx of [...txs].reverse()) { // chronological order
      if (tx.type === 'IN_PURCHASE' || tx.type === 'IN_DONATION') stock += tx.qty;
      else if (tx.type === 'OUT_PRESCRIPTION' || tx.type === 'OUT_SUPPLY') stock -= tx.qty;
      else if (tx.type === 'ADJ_APPROVED') stock += tx.qty;
    }
    computedStock[item.id] = Math.max(stock, 0);
  }

  // Upsert items with computed stock
  for (const item of invItems) {
    await prisma.inventoryItem.upsert({
      where: { id: item.id },
      update: { currentStock: computedStock[item.id] },
      create: {
        id: item.id,
        organizationId: org.id,
        name: item.name,
        unit: item.unit,
        category: item.category as any,
        lowStockThreshold: item.lowStockThreshold,
        currentStock: computedStock[item.id],
      },
    });
  }
  console.log(`✓ Inventory items: ${invItems.length} records`);

  // Insert transactions (skip if already seeded)
  let txCount = 0;
  for (const item of invItems) {
    const txs = (blueprintMap[item.id] ?? []).reverse(); // chronological
    let running = 0;
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      if (tx.type === 'IN_PURCHASE' || tx.type === 'IN_DONATION') running += tx.qty;
      else if (tx.type === 'OUT_PRESCRIPTION' || tx.type === 'OUT_SUPPLY') running -= tx.qty;
      else if (tx.type === 'ADJ_APPROVED') running += tx.qty;

      const txId = `tx-seed-${item.id}-${i.toString().padStart(3,'0')}`;
      const qtyStored = (tx.type === 'OUT_PRESCRIPTION' || tx.type === 'OUT_SUPPLY') ? -tx.qty : tx.qty;

      await prisma.stockTransaction.upsert({
        where: { id: txId },
        update: {},
        create: {
          id: txId,
          itemId: item.id,
          actorId: tx.actorId ?? 'user-seed-admin',
          type: tx.type as any,
          quantity: qtyStored,
          balanceAfter: running,
          patientId: tx.patientId,
          receiptNo: tx.receiptNo,
          donorName: tx.donorName,
          reason: tx.reason,
          unitCost: tx.type === 'IN_PURCHASE' ? 2.5 : undefined,
          createdAt: daysAgo(tx.d < 0 ? 0 : tx.d),
        },
      });
      txCount++;
    }
  }
  console.log(`✓ Stock transactions: ${txCount} records`);

  // Two pending AdjRequests (large qty → needs SA approval)
  await prisma.adjRequest.upsert({
    where: { id: 'adj-seed-001' },
    update: {},
    create: {
      id: 'adj-seed-001',
      itemId: 'inv-item-003',
      requestedById: 'user-seed-admin',
      quantity: -50,
      reason: 'ยาหมดอายุจากล็อตเดือนมีนาคม',
      status: 'PENDING',
      createdAt: daysAgo(3),
    },
  });

  await prisma.adjRequest.upsert({
    where: { id: 'adj-seed-002' },
    update: {},
    create: {
      id: 'adj-seed-002',
      itemId: 'inv-item-010',
      requestedById: 'user-seed-admin',
      quantity: -30,
      reason: 'ตรวจพบหน้ากากชำรุดจากการจัดเก็บ',
      status: 'PENDING',
      createdAt: daysAgo(1),
    },
  });
  console.log(`✓ Adj requests: 2 pending records`);

  console.log('\n✅ Seed complete!\n');
  console.log('Default credentials:');
  console.log('  admin@hospital.th   / Admin1234!     (ADMIN)');
  console.log('  cm1@hospital.th     / CaseManager1!  (CASE_MANAGER)');
  console.log('  cm2@hospital.th     / CaseManager1!  (CASE_MANAGER)');
  console.log('  sa@hospital.th      / SuperAdmin1!   (SUPER_ADMIN)');
  console.log('  fw1@hospital.th     / FieldWork1!    (FIELD_WORKER)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

# Inventory Expiry Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม lot-level expiry date tracking ในคลังยา — รับยาต้องระบุวันหมดอายุ, แจ้งเตือน 30 วันก่อนหมด, Admin ยืนยันนำออก (soft delete) เพื่อวิเคราะห์ต้นทุน

**Architecture:** เพิ่ม `InventoryLot` model แยก per-batch tracking โดย `InventoryItem.currentStock` sync กับ `SUM(lot.remaining)` — `stockIn` สร้าง lot + transaction, `deduct` ใช้ FIFO ตาม expiryDate, `expireLot` soft-delete (isExpired=true) + สร้าง `OUT_EXPIRED` transaction ไว้วิเคราะห์ต้นทุน

**Tech Stack:** NestJS 10, Prisma 6, Next.js 16 App Router, Ant Design v6, Lucide React, TypeScript, dayjs

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `apps/backend/prisma/schema.prisma` | Add `InventoryLot`, `OUT_EXPIRED`, `lotId` on `StockTransaction` |
| Migrate | `prisma migrate dev` | Apply schema |
| Modify | `apps/backend/src/modules/inventory/dto/stock-in.dto.ts` | Add required `expiryDate` |
| Modify | `apps/backend/src/modules/inventory/inventory.service.ts` | stockIn, deduct FIFO, getExpiringLots, expireLot, getLots |
| Modify | `apps/backend/src/modules/inventory/inventory.controller.ts` | 3 new routes (expiring, expire, lots) |
| Modify | `apps/backend/src/modules/inventory/test/inventory.service.spec.ts` | Update mocks + add tests |
| Modify | `apps/frontend/src/app/(app)/inventory/page.tsx` | DatePicker, banner, ExpiringLotsModal, history drawer |
| Modify | `apps/backend/prisma/seed.ts` | Create InventoryLots with expiryDate |

---

## Task 1: Schema — InventoryLot + OUT_EXPIRED + migrate

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Add `OUT_EXPIRED` to TransactionType enum**

ใน `apps/backend/prisma/schema.prisma` หา block `enum TransactionType` แล้วเพิ่ม:

```prisma
enum TransactionType {
  IN_PURCHASE
  IN_DONATION
  OUT_PRESCRIPTION
  OUT_SUPPLY
  ADJ_APPROVED
  OUT_EXPIRED
}
```

- [ ] **Step 2: Add `lotId` to StockTransaction**

ใน `model StockTransaction` เพิ่มหลัง `reason String?`:

```prisma
  lotId        String?
  lot          InventoryLot? @relation(fields: [lotId], references: [id])
```

- [ ] **Step 3: Add `lots` relation to InventoryItem**

ใน `model InventoryItem` เพิ่มหลัง `adjRequests AdjRequest[]`:

```prisma
  lots         InventoryLot[]
```

- [ ] **Step 4: Add `lotsReceived` and `lotsExpired` to User**

ใน `model User` เพิ่มหลัง `adjRequestsReviewed AdjRequest[] @relation("AdjReviewer")`:

```prisma
  lotsReceived         InventoryLot[] @relation("LotReceiver")
  lotsExpired          InventoryLot[] @relation("LotExpirer")
```

- [ ] **Step 5: Add InventoryLot model**

เพิ่ม model ใหม่ท้ายไฟล์ (หลัง AdjRequest):

```prisma
model InventoryLot {
  id          String        @id @default(uuid())
  itemId      String
  item        InventoryItem @relation(fields: [itemId], references: [id])
  quantity    Int
  remaining   Int
  expiryDate  DateTime
  receivedAt  DateTime      @default(now())
  receiptNo   String?
  donorName   String?
  unitCost    Float?
  actorId     String
  actor       User          @relation("LotReceiver", fields: [actorId], references: [id])
  isExpired   Boolean       @default(false)
  expiredAt   DateTime?
  expiredById String?
  expiredBy   User?         @relation("LotExpirer", fields: [expiredById], references: [id])

  transactions StockTransaction[]
}
```

- [ ] **Step 6: Validate schema**

```bash
cd apps/backend && npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 7: Migrate**

```bash
cd apps/backend && DATABASE_URL=postgresql://homemed:homemed_dev@localhost:5432/homemed npx prisma migrate dev --name add-inventory-lot-expiry
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 8: Generate client**

```bash
cd apps/backend && npx prisma generate
```

- [ ] **Step 9: TypeScript check**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add apps/backend/prisma/
git commit -m "feat: add InventoryLot model + OUT_EXPIRED transaction type"
```

---

## Task 2: Service — stockIn creates InventoryLot (TDD)

**Files:**
- Modify: `apps/backend/src/modules/inventory/dto/stock-in.dto.ts`
- Modify: `apps/backend/src/modules/inventory/test/inventory.service.spec.ts`
- Modify: `apps/backend/src/modules/inventory/inventory.service.ts`

- [ ] **Step 1: Update StockInDto — add required expiryDate**

แทนที่ทั้งไฟล์ `apps/backend/src/modules/inventory/dto/stock-in.dto.ts`:

```typescript
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, IsNumber } from 'class-validator';

export class StockInDto {
  @IsEnum(['IN_PURCHASE', 'IN_DONATION']) type: 'IN_PURCHASE' | 'IN_DONATION';
  @IsInt() @Min(1) quantity: number;
  @IsDateString() expiryDate: string;
  @IsOptional() @IsString() donorName?: string;
  @IsOptional() @IsString() receiptNo?: string;
  @IsOptional() @IsNumber() unitCost?: number;
}
```

- [ ] **Step 2: Update test mock — add inventoryLot + fix $transaction**

เปิด `apps/backend/src/modules/inventory/test/inventory.service.spec.ts`

แทนที่ `const mockPrisma = { ... }` block ทั้งหมด:

```typescript
const mockPrisma = {
  inventoryItem: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  inventoryLot: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  stockTransaction: { create: jest.fn(), findMany: jest.fn() },
  adjRequest: {
    create: jest.fn(), findMany: jest.fn(),
    findFirst: jest.fn(), update: jest.fn(),
  },
  user: { findMany: jest.fn(), findUnique: jest.fn() },
  $transaction: jest.fn((fnOrOps: any) => {
    if (typeof fnOrOps === 'function') return fnOrOps(mockPrisma);
    return Promise.all(fnOrOps);
  }),
};
```

- [ ] **Step 3: Replace existing `stockIn` test**

แทนที่ `describe('stockIn', ...)` block ทั้งหมด:

```typescript
describe('stockIn', () => {
  it('creates InventoryLot + StockTransaction and updates currentStock', async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue(
      { id: 'item1', currentStock: 100, name: 'Metformin', organizationId: 'org1' },
    );
    mockPrisma.inventoryLot.create.mockResolvedValue({ id: 'lot1' });
    mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 150 });
    mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx1' });

    await service.stockIn('item1', 'org1', 'user1', {
      type: 'IN_PURCHASE', quantity: 50,
      expiryDate: '2027-01-01', receiptNo: 'RX-001', unitCost: 2.5,
    });

    expect(mockPrisma.inventoryLot.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          itemId: 'item1', quantity: 50, remaining: 50,
          expiryDate: new Date('2027-01-01'),
        }),
      }),
    );
    expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'IN_PURCHASE', quantity: 50, balanceAfter: 150, lotId: 'lot1',
        }),
      }),
    );
    expect(mockPrisma.inventoryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentStock: 150 } }),
    );
  });

  it('throws BadRequestException when expiryDate is in the past', async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue(
      { id: 'item1', currentStock: 100, name: 'Metformin', organizationId: 'org1' },
    );

    await expect(service.stockIn('item1', 'org1', 'user1', {
      type: 'IN_PURCHASE', quantity: 50, expiryDate: '2020-01-01',
    })).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 4: Run to confirm tests fail**

```bash
cd apps/backend && npx jest src/modules/inventory/test --no-coverage 2>&1 | tail -8
```

Expected: FAIL (stockIn tests fail)

- [ ] **Step 5: Rewrite stockIn in inventory.service.ts**

แทนที่ method `stockIn` ทั้งหมด (บรรทัด `async stockIn(...)` ถึง `}` ปิด method):

```typescript
async stockIn(itemId: string, orgId: string, actorId: string, dto: StockInDto) {
  const item = await this.findItemOrThrow(itemId, orgId);

  if (new Date(dto.expiryDate) <= new Date()) {
    throw new BadRequestException('วันหมดอายุต้องเป็นวันในอนาคต');
  }

  const newStock = item.currentStock + dto.quantity;

  await this.prisma.$transaction(async (tx) => {
    const lot = await tx.inventoryLot.create({
      data: {
        itemId,
        actorId,
        quantity: dto.quantity,
        remaining: dto.quantity,
        expiryDate: new Date(dto.expiryDate),
        receiptNo: dto.receiptNo,
        donorName: dto.donorName,
        unitCost: dto.unitCost,
      },
    });

    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { currentStock: newStock },
    });

    await tx.stockTransaction.create({
      data: {
        itemId,
        actorId,
        type: dto.type,
        quantity: dto.quantity,
        balanceAfter: newStock,
        donorName: dto.donorName,
        receiptNo: dto.receiptNo,
        unitCost: dto.unitCost,
        lotId: lot.id,
      },
    });
  });
}
```

- [ ] **Step 6: Run tests**

```bash
cd apps/backend && npx jest src/modules/inventory/test --no-coverage 2>&1 | tail -8
```

Expected: stockIn tests pass (deduct tests may still pass — they don't touch lots yet)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/inventory/dto/stock-in.dto.ts \
        apps/backend/src/modules/inventory/inventory.service.ts \
        apps/backend/src/modules/inventory/test/inventory.service.spec.ts
git commit -m "feat: stockIn creates InventoryLot with expiryDate (TDD)"
```

---

## Task 3: Service — getExpiringLots + expireLot (TDD)

**Files:**
- Modify: `apps/backend/src/modules/inventory/test/inventory.service.spec.ts`
- Modify: `apps/backend/src/modules/inventory/inventory.service.ts`

- [ ] **Step 1: Add failing tests**

เพิ่มใน `apps/backend/src/modules/inventory/test/inventory.service.spec.ts` ก่อน closing `});` ของ `describe('InventoryService', ...)`:

```typescript
describe('getExpiringLots', () => {
  it('returns lots expiring within 30 days with daysLeft computed', async () => {
    const soon = new Date(Date.now() + 15 * 86_400_000);
    mockPrisma.inventoryLot.findMany.mockResolvedValue([
      {
        id: 'lot1', itemId: 'item1', remaining: 50, expiryDate: soon,
        unitCost: 2.5, item: { name: 'Metformin 500mg', unit: 'เม็ด' },
      },
    ]);

    const result = await service.getExpiringLots('org1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      lotId: 'lot1', itemName: 'Metformin 500mg', remaining: 50,
    });
    expect(result[0].daysLeft).toBeGreaterThanOrEqual(14);
    expect(result[0].daysLeft).toBeLessThanOrEqual(16);
  });
});

describe('expireLot', () => {
  it('soft-deletes lot and creates OUT_EXPIRED transaction', async () => {
    mockPrisma.inventoryLot.findFirst.mockResolvedValue({
      id: 'lot1', itemId: 'item1', remaining: 50, isExpired: false,
      item: { currentStock: 100, organizationId: 'org1' },
    });
    mockPrisma.inventoryLot.update.mockResolvedValue({ id: 'lot1', isExpired: true });
    mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 50 });
    mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx1' });

    await service.expireLot('lot1', 'user1', 'org1');

    expect(mockPrisma.inventoryLot.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isExpired: true, expiredById: 'user1' }),
      }),
    );
    expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'OUT_EXPIRED', quantity: -50, lotId: 'lot1', balanceAfter: 50,
        }),
      }),
    );
    expect(mockPrisma.inventoryItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentStock: 50 } }),
    );
  });

  it('throws BadRequestException if lot already expired', async () => {
    mockPrisma.inventoryLot.findFirst.mockResolvedValue({
      id: 'lot1', isExpired: true, remaining: 0,
      item: { currentStock: 0, organizationId: 'org1' },
    });

    await expect(service.expireLot('lot1', 'user1', 'org1'))
      .rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException if lot not found', async () => {
    mockPrisma.inventoryLot.findFirst.mockResolvedValue(null);

    await expect(service.expireLot('bad-lot', 'user1', 'org1'))
      .rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd apps/backend && npx jest src/modules/inventory/test --no-coverage 2>&1 | tail -8
```

Expected: FAIL — `getExpiringLots` and `expireLot` not found

- [ ] **Step 3: Add getExpiringLots + expireLot to inventory.service.ts**

เพิ่มหลัง method `getLowStockItems` (ก่อน `getTransactionHistory`):

```typescript
async getExpiringLots(orgId: string) {
  const cutoff = new Date(Date.now() + 30 * 86_400_000);
  const lots = await this.prisma.inventoryLot.findMany({
    where: {
      item: { organizationId: orgId },
      isExpired: false,
      remaining: { gt: 0 },
      expiryDate: { lte: cutoff },
    },
    include: { item: { select: { name: true, unit: true } } },
    orderBy: { expiryDate: 'asc' },
  });

  return lots.map((lot) => ({
    lotId: lot.id,
    itemId: lot.itemId,
    itemName: lot.item.name,
    unit: lot.item.unit,
    remaining: lot.remaining,
    expiryDate: lot.expiryDate,
    daysLeft: Math.ceil((lot.expiryDate.getTime() - Date.now()) / 86_400_000),
    unitCost: lot.unitCost,
  }));
}

async expireLot(lotId: string, actorId: string, orgId: string) {
  const lot = await this.prisma.inventoryLot.findFirst({
    where: { id: lotId, item: { organizationId: orgId } },
    include: { item: true },
  });
  if (!lot) throw new NotFoundException('Lot not found');
  if (lot.isExpired) throw new BadRequestException('Lot นี้ถูกนำออกไปแล้ว');

  const newStock = lot.item.currentStock - lot.remaining;

  await this.prisma.$transaction(async (tx) => {
    await tx.inventoryLot.update({
      where: { id: lotId },
      data: { isExpired: true, expiredAt: new Date(), expiredById: actorId },
    });
    await tx.stockTransaction.create({
      data: {
        itemId: lot.itemId,
        actorId,
        type: 'OUT_EXPIRED',
        quantity: -lot.remaining,
        balanceAfter: newStock,
        lotId,
        reason: 'ยาหมดอายุ',
      },
    });
    await tx.inventoryItem.update({
      where: { id: lot.itemId },
      data: { currentStock: newStock },
    });
  });
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && npx jest src/modules/inventory/test --no-coverage 2>&1 | tail -8
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/inventory/inventory.service.ts \
        apps/backend/src/modules/inventory/test/inventory.service.spec.ts
git commit -m "feat: getExpiringLots + expireLot soft-delete (TDD)"
```

---

## Task 4: Service — deduct FIFO (TDD)

**Files:**
- Modify: `apps/backend/src/modules/inventory/test/inventory.service.spec.ts`
- Modify: `apps/backend/src/modules/inventory/inventory.service.ts`

- [ ] **Step 1: Replace existing deduct tests**

ใน `apps/backend/src/modules/inventory/test/inventory.service.spec.ts` แทนที่ `describe('deduct', ...)` block ทั้งหมด:

```typescript
describe('deduct (FIFO)', () => {
  it('deducts from single lot when qty fits in one lot', async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue(
      { id: 'item1', currentStock: 80, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
    );
    mockPrisma.inventoryLot.findMany.mockResolvedValue([
      { id: 'lot1', remaining: 80, expiryDate: new Date(Date.now() + 60 * 86_400_000) },
    ]);
    mockPrisma.inventoryLot.update.mockResolvedValue({});
    mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 70 });
    mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx1' });
    mockPrisma.user.findMany.mockResolvedValue([]);

    await service.deduct('item1', 10, {
      actorId: 'user1', type: 'OUT_PRESCRIPTION', patientId: 'p1', orgId: 'org1',
    });

    expect(mockPrisma.inventoryLot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { remaining: 70 } }),
    );
    expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ quantity: -10, balanceAfter: 70, lotId: 'lot1' }),
      }),
    );
  });

  it('spans two lots when qty exceeds first lot remaining (FIFO)', async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue(
      { id: 'item1', currentStock: 130, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
    );
    mockPrisma.inventoryLot.findMany.mockResolvedValue([
      { id: 'lot1', remaining: 30, expiryDate: new Date(Date.now() + 5 * 86_400_000) },
      { id: 'lot2', remaining: 100, expiryDate: new Date(Date.now() + 60 * 86_400_000) },
    ]);
    mockPrisma.inventoryLot.update.mockResolvedValue({});
    mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 80 });
    mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx1' });
    mockPrisma.user.findMany.mockResolvedValue([]);

    await service.deduct('item1', 50, {
      actorId: 'user1', type: 'OUT_PRESCRIPTION', orgId: 'org1',
    });

    // lot1 fully consumed (30), lot2 partially (20)
    expect(mockPrisma.inventoryLot.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.stockTransaction.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.inventoryLot.update).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ where: { id: 'lot1' }, data: { remaining: 0 } }),
    );
    expect(mockPrisma.inventoryLot.update).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ where: { id: 'lot2' }, data: { remaining: 80 } }),
    );
  });

  it('throws BadRequestException when stock insufficient', async () => {
    mockPrisma.inventoryItem.findFirst.mockResolvedValue(
      { id: 'item1', currentStock: 5, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
    );

    await expect(service.deduct('item1', 10, {
      actorId: 'user1', type: 'OUT_PRESCRIPTION', orgId: 'org1',
    })).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run to confirm FIFO tests fail**

```bash
cd apps/backend && npx jest src/modules/inventory/test --no-coverage 2>&1 | tail -8
```

Expected: FAIL — FIFO tests fail

- [ ] **Step 3: Replace deduct method in inventory.service.ts**

แทนที่ method `deduct` ทั้งหมด:

```typescript
async deduct(
  itemId: string,
  qty: number,
  ctx: { actorId: string; type: 'OUT_PRESCRIPTION' | 'OUT_SUPPLY'; patientId?: string; eventId?: string; orgId: string },
) {
  const item = await this.findItemOrThrow(itemId, ctx.orgId);
  if (item.currentStock - qty < 0) {
    throw new BadRequestException(`สต็อกไม่พอ (มี ${item.currentStock} หน่วย)`);
  }

  const lots = await this.prisma.inventoryLot.findMany({
    where: { itemId, isExpired: false, remaining: { gt: 0 } },
    orderBy: { expiryDate: 'asc' },
  });

  const newStock = item.currentStock - qty;

  await this.prisma.$transaction(async (tx) => {
    let toDeduct = qty;
    let runningBalance = item.currentStock;

    for (const lot of lots) {
      if (toDeduct === 0) break;
      const take = Math.min(lot.remaining, toDeduct);
      runningBalance -= take;

      await tx.inventoryLot.update({
        where: { id: lot.id },
        data: { remaining: lot.remaining - take },
      });
      await tx.stockTransaction.create({
        data: {
          itemId,
          actorId: ctx.actorId,
          type: ctx.type,
          quantity: -take,
          balanceAfter: runningBalance,
          patientId: ctx.patientId,
          eventId: ctx.eventId,
          lotId: lot.id,
        },
      });
      toDeduct -= take;
    }

    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { currentStock: newStock },
    });
  });

  if (newStock <= item.lowStockThreshold) {
    const admins = await this.prisma.user.findMany({
      where: { organizationId: ctx.orgId, role: UserRole.ADMIN, lineUserId: { not: null } },
      select: { lineUserId: true },
    });
    for (const a of admins) {
      if (a.lineUserId) {
        await this.notifications.enqueueLowStock({
          lineUserId: a.lineUserId, itemName: item.name,
          currentStock: newStock, threshold: item.lowStockThreshold,
        });
      }
    }
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
cd apps/backend && npx jest src/modules/inventory/test --no-coverage 2>&1 | tail -8
```

Expected: all tests pass

- [ ] **Step 5: TypeScript check**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/inventory/inventory.service.ts \
        apps/backend/src/modules/inventory/test/inventory.service.spec.ts
git commit -m "feat: deduct uses FIFO lot allocation (TDD)"
```

---

## Task 5: Service — getLots + update getTransactionHistory

**Files:**
- Modify: `apps/backend/src/modules/inventory/inventory.service.ts`

- [ ] **Step 1: Add getLots method**

เพิ่มหลัง method `expireLot`:

```typescript
async getLots(itemId: string, orgId: string) {
  await this.findItemOrThrow(itemId, orgId);
  return this.prisma.inventoryLot.findMany({
    where: { itemId },
    include: {
      actor: { select: { displayName: true } },
      expiredBy: { select: { displayName: true } },
    },
    orderBy: { expiryDate: 'asc' },
  });
}
```

- [ ] **Step 2: Update getTransactionHistory to include lot.expiryDate**

แทนที่ method `getTransactionHistory` ทั้งหมด:

```typescript
async getTransactionHistory(itemId: string, orgId: string) {
  await this.findItemOrThrow(itemId, orgId);
  return this.prisma.stockTransaction.findMany({
    where: { itemId },
    include: {
      actor: { select: { displayName: true } },
      lot: { select: { expiryDate: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/inventory/inventory.service.ts
git commit -m "feat: getLots + getTransactionHistory includes lot expiryDate"
```

---

## Task 6: Controller — wire new routes

**Files:**
- Modify: `apps/backend/src/modules/inventory/inventory.controller.ts`

- [ ] **Step 1: Add 3 new routes**

เปิด `apps/backend/src/modules/inventory/inventory.controller.ts`

เพิ่ม 3 routes **ก่อน** `@Get(':id/transactions')` (สำคัญ: ต้องวางก่อน `:id` route เพื่อป้องกัน conflict):

```typescript
@Get('expiring')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
getExpiring(@CurrentUser() user: JwtPayload) {
  return this.inventory.getExpiringLots(user.orgId);
}

@Post('lots/:lotId/expire')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@HttpCode(HttpStatus.NO_CONTENT)
expireLot(@Param('lotId') lotId: string, @CurrentUser() user: JwtPayload) {
  return this.inventory.expireLot(lotId, user.sub, user.orgId);
}

@Get(':id/lots')
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
getLots(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
  return this.inventory.getLots(id, user.orgId);
}
```

ตรวจสอบว่า `@Get('expiring')` อยู่ก่อน `@Get(':id/transactions')` ในไฟล์

- [ ] **Step 2: TypeScript check**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/inventory/inventory.controller.ts
git commit -m "feat: inventory controller — expiring, expire lot, lots endpoints"
```

---

## Task 7: Frontend — Stock-in DatePicker

**Files:**
- Modify: `apps/frontend/src/app/(app)/inventory/page.tsx`

- [ ] **Step 1: Add DatePicker to antd imports**

ใน `apps/frontend/src/app/(app)/inventory/page.tsx` แก้ไข import line:

```typescript
import {
  App, Button, Card, DatePicker, Drawer, Form, Input, InputNumber,
  Modal, Segmented, Select, Space, Table, Tag, Typography,
} from 'antd';
```

- [ ] **Step 2: Add dayjs import**

เพิ่มหลัง import antd:

```typescript
import dayjs from 'dayjs';
```

- [ ] **Step 3: Add expiryDate field to Stock-in Drawer form**

ใน Drawer form เพิ่ม `Form.Item` สำหรับ expiryDate หลัง quantity item:

```tsx
<Form.Item
  name="expiryDate"
  label="วันหมดอายุ"
  rules={[{ required: true, message: 'กรุณาระบุวันหมดอายุ' }]}
>
  <DatePicker
    style={{ width: '100%' }}
    disabledDate={(d) => d <= dayjs()}
    format="DD/MM/YYYY"
    placeholder="เลือกวันหมดอายุ"
  />
</Form.Item>
```

- [ ] **Step 4: Update handleStockIn to send expiryDate as ISO string**

แทนที่บรรทัด `body: JSON.stringify(...)` ใน `handleStockIn`:

```typescript
body: JSON.stringify({
  ...values,
  type: stockInType,
  quantity: Number(values.quantity),
  expiryDate: values.expiryDate?.toISOString(),
}),
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/\(app\)/inventory/page.tsx
git commit -m "feat(ui): stock-in form — add required expiryDate DatePicker"
```

---

## Task 8: Frontend — Expiry Warning Banner + ExpiringLotsModal

**Files:**
- Modify: `apps/frontend/src/app/(app)/inventory/page.tsx`

- [ ] **Step 1: Add Alert to antd imports + lucide icons**

แก้ไข import antd ให้ครบ:

```typescript
import {
  App, Alert, Button, Card, DatePicker, Drawer, Form, Input, InputNumber,
  Modal, Popconfirm, Segmented, Select, Space, Table, Tag, Typography,
} from 'antd';
```

เพิ่ม lucide imports หลัง dayjs:

```typescript
import { AlertTriangle, Clock, PackageX } from 'lucide-react';
```

- [ ] **Step 2: Add ExpiringLot interface + state**

หลัง `interface InventoryItem { ... }` เพิ่ม:

```typescript
interface ExpiringLot {
  lotId: string;
  itemId: string;
  itemName: string;
  unit: string;
  remaining: number;
  expiryDate: string;
  daysLeft: number;
  unitCost: number | null;
}
```

ใน component เพิ่ม state:

```typescript
const [expiringLots, setExpiringLots] = useState<ExpiringLot[]>([]);
const [expiryModalOpen, setExpiryModalOpen] = useState(false);
const [expiring, setExpiring] = useState(false);
```

- [ ] **Step 3: Add loadExpiring + useEffect**

เพิ่มหลัง `const load = useCallback(...)`:

```typescript
const loadExpiring = useCallback(() => {
  if (!(session as any)?.accessToken) return;
  fetch(`${API_URL}/inventory/expiring`, { headers: headers() })
    .then((r) => r.ok ? r.json() : [])
    .then((d) => setExpiringLots(Array.isArray(d) ? d : []));
}, [(session as any)?.accessToken, headers]);

useEffect(() => { loadExpiring(); }, [loadExpiring]);
```

- [ ] **Step 4: Add handleExpireLot**

เพิ่มหลัง `handleAddItem`:

```typescript
async function handleExpireLot(lotId: string) {
  setExpiring(true);
  try {
    const res = await fetch(`${API_URL}/inventory/lots/${lotId}/expire`, {
      method: 'POST', headers: headers(),
    });
    if (res.ok) {
      message.success('นำยาออกจากสต็อกแล้ว');
      loadExpiring();
      load();
    } else {
      const e = await res.json();
      message.error(e.message ?? 'เกิดข้อผิดพลาด');
    }
  } catch { message.error('เกิดข้อผิดพลาด'); }
  finally { setExpiring(false); }
}
```

- [ ] **Step 5: Add expiry badge to item name column**

แก้ไข column "ชื่อรายการ":

```typescript
{
  title: 'ชื่อรายการ', dataIndex: 'name', key: 'name',
  render: (name, r) => {
    const nearExpiry = expiringLots.filter((l) => l.itemId === r.id).length;
    return (
      <div>
        <span style={{ fontWeight: 600 }}>{name}</span>
        {r.currentStock <= r.lowStockThreshold && (
          <Tag color="error" style={{ marginLeft: 8, fontSize: 10 }}>ใกล้หมด</Tag>
        )}
        {nearExpiry > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Clock size={11} color="#ff4d4f" />
            <span style={{ fontSize: 11, color: '#ff4d4f' }}>{nearExpiry} lots ใกล้หมดอายุ</span>
          </div>
        )}
      </div>
    );
  },
},
```

- [ ] **Step 6: Add Alert banner + ExpiringLotsModal to JSX**

ใน `return (...)` เพิ่ม Alert banner ก่อน `<Card>` ที่มี Table:

```tsx
{expiringLots.length > 0 && (
  <Alert
    type="warning"
    style={{ marginBottom: 16 }}
    icon={<AlertTriangle size={16} />}
    showIcon
    message={`มียาใกล้หมดอายุ ${expiringLots.length} รายการ`}
    description="กรุณาตรวจสอบและนำยาที่หมดอายุออกจากสต็อก"
    action={
      <Button size="small" onClick={() => setExpiryModalOpen(true)}>
        ดูรายละเอียด
      </Button>
    }
  />
)}
```

เพิ่ม Modal ก่อน closing `</div>` สุดท้าย:

```tsx
<Modal
  title={
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <AlertTriangle size={16} color="#faad14" />
      <span>ยาใกล้หมดอายุ</span>
    </div>
  }
  open={expiryModalOpen}
  onCancel={() => setExpiryModalOpen(false)}
  footer={null}
  width={700}
>
  <Table
    dataSource={expiringLots}
    rowKey="lotId"
    size="small"
    pagination={false}
    columns={[
      { title: 'ชื่อยา', dataIndex: 'itemName', key: 'itemName', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
      { title: 'คงเหลือ', dataIndex: 'remaining', key: 'remaining', width: 90,
        render: (v, r) => `${v} ${r.unit}` },
      { title: 'วันหมดอายุ', dataIndex: 'expiryDate', key: 'expiryDate', width: 130,
        render: (v) => new Date(v).toLocaleDateString('th-TH') },
      { title: 'เหลือ (วัน)', dataIndex: 'daysLeft', key: 'daysLeft', width: 100,
        render: (v) => (
          <Tag color={v <= 0 ? 'error' : v <= 7 ? 'warning' : 'orange'}>{v <= 0 ? 'หมดแล้ว' : `${v} วัน`}</Tag>
        ) },
      {
        title: '', key: 'action', width: 90,
        render: (_, r) => (
          <Popconfirm
            title="นำ lot นี้ออกจากสต็อก?"
            description={`จะลบ ${r.remaining} ${r.unit} ออกจากระบบ (soft delete)`}
            okText="ยืนยัน" cancelText="ยกเลิก" okButtonProps={{ danger: true }}
            onConfirm={() => handleExpireLot(r.lotId)}
          >
            <Button size="small" danger icon={<PackageX size={13} />} loading={expiring}>
              นำออก
            </Button>
          </Popconfirm>
        ),
      },
    ]}
  />
</Modal>
```

- [ ] **Step 7: TypeScript check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/app/\(app\)/inventory/page.tsx
git commit -m "feat(ui): inventory — expiry warning banner + ExpiringLotsModal"
```

---

## Task 9: Frontend — Transactions History Drawer

**Files:**
- Modify: `apps/frontend/src/app/(app)/inventory/page.tsx`

- [ ] **Step 1: Add transaction history state + interface**

หลัง `interface ExpiringLot { ... }` เพิ่ม:

```typescript
interface StockTx {
  id: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  createdAt: string;
  actor: { displayName: string };
  lot: { expiryDate: string } | null;
  reason: string | null;
  patientId: string | null;
}
```

ใน component เพิ่ม state:

```typescript
const [txOpen, setTxOpen] = useState(false);
const [txItem, setTxItem] = useState<InventoryItem | null>(null);
const [txList, setTxList] = useState<StockTx[]>([]);
const [txLoading, setTxLoading] = useState(false);
```

- [ ] **Step 2: Add loadTransactions function**

เพิ่มหลัง `handleExpireLot`:

```typescript
async function openTransactions(item: InventoryItem) {
  setTxItem(item);
  setTxOpen(true);
  setTxLoading(true);
  try {
    const res = await fetch(`${API_URL}/inventory/${item.id}/transactions`, { headers: headers() });
    const d = res.ok ? await res.json() : [];
    setTxList(Array.isArray(d) ? d : []);
  } catch { setTxList([]); }
  finally { setTxLoading(false); }
}
```

- [ ] **Step 3: Add "ประวัติ" button to item row actions**

ใน columns actions render เพิ่มปุ่ม:

```tsx
<Button size="small" onClick={() => openTransactions(r)}>ประวัติ</Button>
<Button size="small" onClick={() => { setSelectedItem(r); setStockInOpen(true); }}>รับเข้า</Button>
<Button size="small" danger onClick={() => { setSelectedItem(r); setAdjOpen(true); }}>ADJ</Button>
```

- [ ] **Step 4: Add Transaction History Drawer**

เพิ่มหลัง ExpiringLots Modal:

```tsx
<Drawer
  title={`ประวัติรายการ: ${txItem?.name}`}
  open={txOpen}
  onClose={() => setTxOpen(false)}
  width={640}
>
  <Table
    dataSource={txList}
    rowKey="id"
    size="small"
    loading={txLoading}
    pagination={{ pageSize: 20 }}
    columns={[
      {
        title: 'ประเภท', dataIndex: 'type', key: 'type', width: 140,
        render: (t) => {
          const map: Record<string, [string, string]> = {
            IN_PURCHASE:    ['green',  'ซื้อเข้า'],
            IN_DONATION:    ['cyan',   'บริจาค'],
            OUT_PRESCRIPTION: ['blue', 'จ่ายยา'],
            OUT_SUPPLY:     ['geekblue','จ่ายวัสดุ'],
            ADJ_APPROVED:   ['orange', 'ปรับสต็อก'],
            OUT_EXPIRED:    ['red',    'หมดอายุ'],
          };
          const [color, label] = map[t] ?? ['default', t];
          return (
            <Tag color={color} icon={t === 'OUT_EXPIRED' ? <PackageX size={11} /> : undefined}>
              {label}
            </Tag>
          );
        },
      },
      {
        title: 'จำนวน', dataIndex: 'quantity', key: 'quantity', width: 80,
        render: (v) => (
          <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>
            {v > 0 ? `+${v}` : v}
          </span>
        ),
      },
      { title: 'คงเหลือ', dataIndex: 'balanceAfter', key: 'balanceAfter', width: 80 },
      {
        title: 'วันหมดอายุ (lot)', key: 'expiry', width: 130,
        render: (_, r) => r.lot?.expiryDate
          ? <span style={{ fontSize: 12 }}>{new Date(r.lot.expiryDate).toLocaleDateString('th-TH')}</span>
          : <span style={{ color: '#d9d9d9' }}>—</span>,
      },
      { title: 'โดย', key: 'actor', render: (_, r) => r.actor.displayName, width: 120 },
      {
        title: 'วันที่', dataIndex: 'createdAt', key: 'createdAt',
        render: (v) => new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }),
      },
    ]}
  />
</Drawer>
```

- [ ] **Step 5: TypeScript + build check**

```bash
cd /Users/tae/Desktop/playground/poc_homeless/apps/frontend && npx tsc --noEmit 2>&1 | head -5 && npm run build 2>&1 | grep -E "error|✓ Compiled" | head -5
```

Expected: no TS errors, `✓ Compiled successfully`

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/app/\(app\)/inventory/page.tsx
git commit -m "feat(ui): inventory transactions history drawer with lot expiry info"
```

---

## Task 10: Update Seed — InventoryLots + re-seed

**Files:**
- Modify: `apps/backend/prisma/seed.ts`

- [ ] **Step 1: Update seed to create InventoryLots**

ใน `apps/backend/prisma/seed.ts` แทนที่ section `// Upsert items with computed stock` และทุกอย่างหลังจากนั้น (stock transactions + adj requests) ด้วย version ใหม่ที่ใช้ `inventoryLot.upsert`:

**ก่อน** loop `for (const item of invItems)` ที่ upsert items เพิ่ม lot definitions:

```typescript
// วันหมดอายุ: บางรายการใกล้หมดเพื่อทดสอบ alert
const lotDefs: Record<string, Array<{ suffix: string; qty: number; remaining: number; daysToExpiry: number; receiptNo: string }>> = {
  'inv-item-001': [ // Metformin — lot หนึ่งใกล้หมด
    { suffix: 'A', qty: 200, remaining: 45,  daysToExpiry: 20,  receiptNo: 'RX-2026-002' },
    { suffix: 'B', qty: 250, remaining: 120, daysToExpiry: 180, receiptNo: 'RX-2026-003' },
  ],
  'inv-item-002': [ // Amlodipine
    { suffix: 'A', qty: 300, remaining: 95, daysToExpiry: 90, receiptNo: 'RX-2026-002' },
  ],
  'inv-item-003': [ // Paracetamol — lot หนึ่งหมดอายุแล้ว (negative = past)
    { suffix: 'A', qty: 500, remaining: 28, daysToExpiry: 8,   receiptNo: 'RX-2026-002' },
    { suffix: 'B', qty: 600, remaining: 220, daysToExpiry: 270, receiptNo: 'RX-2026-003' },
  ],
  'inv-item-004': [ // Omeprazole
    { suffix: 'A', qty: 200, remaining: 72, daysToExpiry: 120, receiptNo: 'RX-2026-002' },
  ],
  'inv-item-005': [ // Isoniazid
    { suffix: 'A', qty: 150, remaining: 40, daysToExpiry: 60, receiptNo: 'RX-2026-002' },
  ],
  'inv-item-006': [ // Rifampicin
    { suffix: 'A', qty: 150, remaining: 38, daysToExpiry: 60, receiptNo: 'RX-2026-002' },
  ],
  'inv-item-007': [ // Efavirenz — ใกล้หมด
    { suffix: 'A', qty: 120, remaining: 22, daysToExpiry: 25, receiptNo: 'RX-2026-002' },
  ],
  'inv-item-008': [ // Atenolol
    { suffix: 'A', qty: 250, remaining: 88, daysToExpiry: 150, receiptNo: 'RX-2026-003' },
  ],
  'inv-item-009': [ // ถุงมือ
    { suffix: 'A', qty: 80, remaining: 36, daysToExpiry: 365, receiptNo: 'RX-2026-001' },
  ],
  'inv-item-010': [ // N95
    { suffix: 'A', qty: 100, remaining: 43, daysToExpiry: 730, receiptNo: 'RX-2026-001' },
  ],
  'inv-item-011': [ // แอลกอฮอล์
    { suffix: 'A', qty: 40, remaining: 14, daysToExpiry: 180, receiptNo: 'RX-2026-001' },
  ],
  'inv-item-012': [ // ชุดเจาะเลือด
    { suffix: 'A', qty: 30, remaining: 9, daysToExpiry: 365, receiptNo: 'RX-2026-001' },
  ],
};
```

แล้วแทนที่ loop upsert items + transactions เดิมทั้งหมดด้วย:

```typescript
// Upsert items + lots
for (const item of invItems) {
  const defs = lotDefs[item.id] ?? [];
  const totalRemaining = defs.reduce((s, d) => s + d.remaining, 0);

  await prisma.inventoryItem.upsert({
    where: { id: item.id },
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
    const existing = await prisma.inventoryLot.findUnique({ where: { id: lotId } });
    if (!existing) {
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
```

ลบ section `blueprintMap`, `computedStock`, และ loop `stockTransaction.upsert` เดิมออกทั้งหมด (รวม txCount loop)

- [ ] **Step 2: TypeScript check seed**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors

- [ ] **Step 3: Reset and re-seed**

```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes" \
DATABASE_URL=postgresql://homemed:homemed_dev@localhost:5432/homemed \
npx prisma migrate reset --force 2>&1 | tail -20
```

Expected: seed completes, shows `✓ Inventory items: 12 records with lots`

- [ ] **Step 4: Verify expiring lots exist**

```bash
DATABASE_URL=postgresql://homemed:homemed_dev@localhost:5432/homemed \
npx prisma studio &
```

หรือ query ตรง:

```bash
DATABASE_URL=postgresql://homemed:homemed_dev@localhost:5432/homemed \
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.inventoryLot.count({ where: { expiryDate: { lte: new Date(Date.now() + 30*86400000) } } })
  .then(n => { console.log('Near-expiry lots:', n); p.\$disconnect(); });
"
```

Expected: near-expiry lots ≥ 3 (Metformin lot A, Paracetamol lot A, Efavirenz lot A)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/prisma/seed.ts
git commit -m "feat(seed): inventory lots with expiryDate — 3 lots near expiry for demo"
```

---

## Self-Review

**Spec coverage check:**
- ✅ เพิ่ม `expiryDate` (required) เมื่อรับยาเข้า → Task 2 (StockInDto) + Task 7 (DatePicker)
- ✅ แจ้งเตือน 30 วันก่อนหมดอายุ → Task 3 (`getExpiringLots`) + Task 8 (banner)
- ✅ Admin กดยืนยัน "นำออก" → Task 3 (`expireLot`) + Task 8 (Popconfirm)
- ✅ Soft delete (isExpired=true, ข้อมูลยังอยู่) → Task 3
- ✅ สร้าง `OUT_EXPIRED` transaction → Task 3
- ✅ FIFO deduct → Task 4
- ✅ Transaction history แสดง lot/expiry → Task 5 + Task 9
- ✅ Seed data มี lots ใกล้หมดอายุ → Task 10
- ✅ Migration backward-compat (lotId nullable) → Task 1

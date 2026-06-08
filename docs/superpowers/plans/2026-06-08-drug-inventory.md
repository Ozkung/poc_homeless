# Drug & Medical Supply Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a per-organisation drug and medical supply inventory system with stock IN/OUT/ADJ tracking, SUPER_ADMIN approval for large adjustments, LINE notifications, and an Admin frontend at `/inventory`.

**Architecture:** Single NestJS `inventory` module. All movements stored as `StockTransaction` rows with `currentStock` updated atomically via `prisma.$transaction`. ADJ ≤ 20 units auto-approves; >20 creates an `AdjRequest` pending SA approval. Frontend is a client component with antd Drawer/Modal for stock operations.

**Tech Stack:** NestJS 10, Prisma 6, `@nestjs/bull`, Next.js 16 App Router, antd v5, TypeScript

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `apps/backend/prisma/schema.prisma` | Add `SUPER_ADMIN`, `MEDICAL_VOLUNTEER` to UserRole + 4 new models |
| Migrate | `prisma migrate dev` | apply changes |
| Modify | `apps/backend/src/modules/notifications/notifications.service.ts` | 4 new ADJ/low-stock enqueue methods |
| Modify | `apps/backend/src/modules/notifications/notifications.processor.ts` | 4 new job handlers |
| Modify | `apps/backend/src/modules/line/line.service.ts` | 4 new push methods |
| Create | `apps/backend/src/modules/inventory/inventory.module.ts` | |
| Create | `apps/backend/src/modules/inventory/inventory.service.ts` | catalog, stockIn, deduct, requestAdj, reviewAdj |
| Create | `apps/backend/src/modules/inventory/inventory.controller.ts` | 9 endpoints |
| Create | `apps/backend/src/modules/inventory/dto/create-item.dto.ts` | |
| Create | `apps/backend/src/modules/inventory/dto/stock-in.dto.ts` | |
| Create | `apps/backend/src/modules/inventory/dto/deduct.dto.ts` | |
| Create | `apps/backend/src/modules/inventory/dto/adj-request.dto.ts` | |
| Create | `apps/backend/src/modules/inventory/dto/review-adj.dto.ts` | |
| Create | `apps/backend/src/modules/inventory/test/inventory.service.spec.ts` | TDD |
| Modify | `apps/backend/src/app.module.ts` | import InventoryModule |
| Create | `apps/frontend/src/app/(app)/inventory/page.tsx` | client component — list + stock IN/ADJ modals |
| Create | `apps/frontend/src/app/(app)/inventory/approvals/page.tsx` | SA approval queue |
| Modify | `apps/frontend/src/components/layout/Sidebar.tsx` | add คลังยา item for ADMIN/SA |

---

## Task 1: Schema — add roles + inventory models

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Add SUPER_ADMIN and MEDICAL_VOLUNTEER to UserRole enum**

In `apps/backend/prisma/schema.prisma`, update:

```prisma
enum UserRole {
  ADMIN
  CASE_MANAGER
  FIELD_WORKER
  SUPER_ADMIN
  MEDICAL_VOLUNTEER
}
```

- [ ] **Step 2: Add InventoryCategory, TransactionType, AdjStatus enums**

After the existing enums, add:

```prisma
enum InventoryCategory {
  DRUG
  SUPPLY
}

enum TransactionType {
  IN_PURCHASE
  IN_DONATION
  OUT_PRESCRIPTION
  OUT_SUPPLY
  ADJ_APPROVED
}

enum AdjStatus {
  PENDING
  APPROVED
  REJECTED
}
```

- [ ] **Step 3: Add InventoryItem model**

```prisma
model InventoryItem {
  id                String            @id @default(uuid())
  organizationId    String
  organization      Organization      @relation(fields: [organizationId], references: [id])
  name              String
  unit              String
  category          InventoryCategory
  currentStock      Int               @default(0)
  lowStockThreshold Int               @default(10)
  isActive          Boolean           @default(true)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  transactions StockTransaction[]
  adjRequests  AdjRequest[]
}
```

- [ ] **Step 4: Add StockTransaction model**

```prisma
model StockTransaction {
  id           String          @id @default(uuid())
  itemId       String
  item         InventoryItem   @relation(fields: [itemId], references: [id])
  type         TransactionType
  quantity     Int
  balanceAfter Int
  patientId    String?
  eventId      String?
  actorId      String
  actor        User            @relation("StockActor", fields: [actorId], references: [id])
  donorName    String?
  receiptNo    String?
  unitCost     Float?
  reason       String?
  createdAt    DateTime        @default(now())
}
```

- [ ] **Step 5: Add AdjRequest model**

```prisma
model AdjRequest {
  id              String        @id @default(uuid())
  itemId          String
  item            InventoryItem @relation(fields: [itemId], references: [id])
  requestedById   String
  requester       User          @relation("AdjRequester", fields: [requestedById], references: [id])
  quantity        Int
  reason          String
  status          AdjStatus     @default(PENDING)
  reviewedById    String?
  reviewer        User?         @relation("AdjReviewer", fields: [reviewedById], references: [id])
  reviewNote      String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}
```

- [ ] **Step 6: Add relations to Organization and User**

In `model Organization`, add:
```prisma
  inventoryItems InventoryItem[]
```

In `model User`, add:
```prisma
  stockTransactions StockTransaction[] @relation("StockActor")
  adjRequestsMade   AdjRequest[]       @relation("AdjRequester")
  adjRequestsReviewed AdjRequest[]     @relation("AdjReviewer")
```

- [ ] **Step 7: Validate schema**

```bash
cd apps/backend && npx prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 8: Migrate**

```bash
cd apps/backend && DATABASE_URL=postgresql://homemed:homemed_dev@localhost:5432/homemed npx prisma migrate dev --name add-inventory
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 9: Generate client**

```bash
cd apps/backend && npx prisma generate
```

- [ ] **Step 10: Commit**

```bash
git add apps/backend/prisma/
git commit -m "feat: add SUPER_ADMIN/MEDICAL_VOLUNTEER roles + inventory schema"
```

---

## Task 2: LINE + Notifications — 4 new ADJ/low-stock job types

**Files:**
- Modify: `apps/backend/src/modules/line/line.service.ts`
- Modify: `apps/backend/src/modules/notifications/notifications.service.ts`
- Modify: `apps/backend/src/modules/notifications/notifications.processor.ts`

- [ ] **Step 1: Add 4 push methods to LineService**

Open `apps/backend/src/modules/line/line.service.ts`. Add after `pushLowStock` (or at end before closing `}`):

```typescript
async pushAdjNotify(lineUserId: string, data: { itemName: string; qty: number; adminName: string }) {
  const dir = data.qty > 0 ? `+${data.qty}` : `${data.qty}`;
  await this.pushText(lineUserId,
    `📋 แจ้งทราบ: ปรับสต็อกอัตโนมัติ\n${data.itemName} ${dir} หน่วย\nโดย: ${data.adminName}`
  );
}

async pushAdjRequest(lineUserId: string, data: { itemName: string; qty: number; adminName: string; reason: string; adjId: string }) {
  const dir = data.qty > 0 ? `+${data.qty}` : `${data.qty}`;
  await this.pushText(lineUserId,
    `⚠️ รออนุมัติ ADJ สต็อก\n${data.itemName} ${dir} หน่วย\nเหตุผล: ${data.reason}\nโดย: ${data.adminName}\n\nกรุณาอนุมัติที่ /inventory/approvals`
  );
}

async pushAdjResult(lineUserId: string, data: { itemName: string; qty: number; approved: boolean; reviewNote?: string }) {
  const dir = data.qty > 0 ? `+${data.qty}` : `${data.qty}`;
  const status = data.approved ? '✅ อนุมัติแล้ว' : '❌ ปฏิเสธ';
  const note = data.reviewNote ? `\nหมายเหตุ: ${data.reviewNote}` : '';
  await this.pushText(lineUserId,
    `${status}: ADJ สต็อก\n${data.itemName} ${dir} หน่วย${note}`
  );
}

async pushLowStock(lineUserId: string, data: { itemName: string; currentStock: number; threshold: number }) {
  await this.pushText(lineUserId,
    `🔴 แจ้งเตือนสต็อกใกล้หมด\n${data.itemName}: ${data.currentStock} หน่วยเหลืออยู่ (ต่ำกว่า ${data.threshold})\nกรุณาสั่งซื้อเพิ่ม`
  );
}
```

- [ ] **Step 2: Add 4 payload interfaces + enqueue methods to notifications.service.ts**

Open `apps/backend/src/modules/notifications/notifications.service.ts`. Add after existing interfaces:

```typescript
export interface AdjNotifyPayload {
  lineUserId: string; itemName: string; qty: number; adminName: string;
}

export interface AdjRequestPayload {
  lineUserId: string; itemName: string; qty: number;
  adminName: string; reason: string; adjId: string;
}

export interface AdjResultPayload {
  lineUserId: string; itemName: string; qty: number;
  approved: boolean; reviewNote?: string;
}

export interface LowStockPayload {
  lineUserId: string; itemName: string; currentStock: number; threshold: number;
}
```

Add 4 enqueue methods inside `NotificationsService` class:

```typescript
async enqueueAdjNotify(payload: AdjNotifyPayload) {
  await this.queue.add('send-adj-notify', payload, JOB_OPTS);
}

async enqueueAdjRequest(payload: AdjRequestPayload) {
  await this.queue.add('send-adj-request', payload, JOB_OPTS);
}

async enqueueAdjResult(payload: AdjResultPayload) {
  await this.queue.add('send-adj-result', payload, JOB_OPTS);
}

async enqueueLowStock(payload: LowStockPayload) {
  await this.queue.add('send-low-stock', payload, JOB_OPTS);
}
```

- [ ] **Step 3: Add 4 handlers to notifications.processor.ts**

Open `apps/backend/src/modules/notifications/notifications.processor.ts`. Add the 4 import types:

```typescript
import {
  TaskNotificationPayload, OverdueAlertPayload, SosAlertPayload, MorningBriefingPayload,
  AdjNotifyPayload, AdjRequestPayload, AdjResultPayload, LowStockPayload,
} from './notifications.service';
```

Add 4 processor methods inside `NotificationsProcessor` class:

```typescript
@Process('send-adj-notify')
async handleAdjNotify(job: Job<AdjNotifyPayload>) {
  await this.line.pushAdjNotify(job.data.lineUserId, job.data);
}

@Process('send-adj-request')
async handleAdjRequest(job: Job<AdjRequestPayload>) {
  await this.line.pushAdjRequest(job.data.lineUserId, job.data);
}

@Process('send-adj-result')
async handleAdjResult(job: Job<AdjResultPayload>) {
  await this.line.pushAdjResult(job.data.lineUserId, job.data);
}

@Process('send-low-stock')
async handleLowStock(job: Job<LowStockPayload>) {
  await this.line.pushLowStock(job.data.lineUserId, job.data);
}
```

- [ ] **Step 4: TypeScript check + all tests pass**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -10 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no errors, all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/line/line.service.ts apps/backend/src/modules/notifications/
git commit -m "feat: inventory notifications — adj notify/request/result + low stock LINE messages"
```

---

## Task 3: DTOs + InventoryService catalog + stockIn (TDD)

**Files:**
- Create: `apps/backend/src/modules/inventory/dto/create-item.dto.ts`
- Create: `apps/backend/src/modules/inventory/dto/stock-in.dto.ts`
- Create: `apps/backend/src/modules/inventory/dto/deduct.dto.ts`
- Create: `apps/backend/src/modules/inventory/dto/adj-request.dto.ts`
- Create: `apps/backend/src/modules/inventory/dto/review-adj.dto.ts`
- Create: `apps/backend/src/modules/inventory/inventory.service.ts`
- Create: `apps/backend/src/modules/inventory/test/inventory.service.spec.ts`

- [ ] **Step 1: Create all DTOs**

`apps/backend/src/modules/inventory/dto/create-item.dto.ts`:
```typescript
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { InventoryCategory } from '@prisma/client';

export class CreateItemDto {
  @IsString() name: string;
  @IsString() unit: string;
  @IsEnum(InventoryCategory) category: InventoryCategory;
  @IsOptional() @IsInt() @Min(0) lowStockThreshold?: number;
}
```

`apps/backend/src/modules/inventory/dto/stock-in.dto.ts`:
```typescript
import { IsEnum, IsInt, IsOptional, IsString, Min, IsNumber } from 'class-validator';

export class StockInDto {
  @IsEnum(['IN_PURCHASE', 'IN_DONATION']) type: 'IN_PURCHASE' | 'IN_DONATION';
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() donorName?: string;
  @IsOptional() @IsString() receiptNo?: string;
  @IsOptional() @IsNumber() unitCost?: number;
}
```

`apps/backend/src/modules/inventory/dto/deduct.dto.ts`:
```typescript
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class DeductDto {
  @IsInt() @Min(1) quantity: number;
  @IsEnum(['OUT_PRESCRIPTION', 'OUT_SUPPLY']) type: 'OUT_PRESCRIPTION' | 'OUT_SUPPLY';
  @IsOptional() @IsString() patientId?: string;
  @IsOptional() @IsString() eventId?: string;
}
```

`apps/backend/src/modules/inventory/dto/adj-request.dto.ts`:
```typescript
import { IsInt, IsString, IsNotEmpty } from 'class-validator';

export class AdjRequestDto {
  @IsInt() quantity: number; // can be negative
  @IsString() @IsNotEmpty() reason: string;
}
```

`apps/backend/src/modules/inventory/dto/review-adj.dto.ts`:
```typescript
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ReviewAdjDto {
  @IsEnum(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() reviewNote?: string;
}
```

- [ ] **Step 2: Write failing tests**

Create `apps/backend/src/modules/inventory/test/inventory.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { InventoryService } from '../inventory.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const mockPrisma = {
  inventoryItem: {
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
  user: { findMany: jest.fn() },
  $transaction: jest.fn((fn: any) => fn(mockPrisma)),
};

const mockNotifications = {
  enqueueAdjNotify: jest.fn(),
  enqueueAdjRequest: jest.fn(),
  enqueueAdjResult: jest.fn(),
  enqueueLowStock: jest.fn(),
};

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(InventoryService);
    jest.clearAllMocks();
  });

  describe('stockIn', () => {
    it('increases currentStock and creates StockTransaction', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 100, name: 'Metformin', organizationId: 'org1' },
      );
      mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 150 });
      mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx1' });

      await service.stockIn('item1', 'org1', 'user1', {
        type: 'IN_PURCHASE', quantity: 50, receiptNo: 'RX-001', unitCost: 2.5,
      });

      expect(mockPrisma.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 150 } }),
      );
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'IN_PURCHASE', quantity: 50, balanceAfter: 150 }),
        }),
      );
    });
  });

  describe('deduct', () => {
    it('decreases currentStock atomically and creates OUT transaction', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 80, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
      );
      mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 70 });
      mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx2' });
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.deduct('item1', 10, {
        actorId: 'user1', type: 'OUT_PRESCRIPTION',
        patientId: 'p1', eventId: 'e1', orgId: 'org1',
      });

      expect(mockPrisma.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentStock: 70 } }),
      );
      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quantity: -10, balanceAfter: 70 }),
        }),
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

  describe('requestAdj', () => {
    it('auto-approves and creates StockTransaction when abs(qty) <= 20', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 50, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
      );
      mockPrisma.inventoryItem.update.mockResolvedValue({ id: 'item1', currentStock: 45 });
      mockPrisma.stockTransaction.create.mockResolvedValue({ id: 'tx3' });
      mockPrisma.user.findMany.mockResolvedValue([{ displayName: 'Admin', lineUserId: 'U_SA' }]);

      await service.requestAdj('item1', 'org1', 'user1', { quantity: -5, reason: 'lost' });

      expect(mockPrisma.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'ADJ_APPROVED', quantity: -5 }),
        }),
      );
      expect(mockNotifications.enqueueAdjNotify).toHaveBeenCalled();
      expect(mockPrisma.adjRequest.create).not.toHaveBeenCalled();
    });

    it('creates AdjRequest when abs(qty) > 20', async () => {
      mockPrisma.inventoryItem.findFirst.mockResolvedValue(
        { id: 'item1', currentStock: 100, name: 'Metformin', organizationId: 'org1', lowStockThreshold: 10 },
      );
      mockPrisma.adjRequest.create.mockResolvedValue({ id: 'adj1' });
      mockPrisma.user.findMany.mockResolvedValue([{ displayName: 'SA User', lineUserId: 'U_SA' }]);

      await service.requestAdj('item1', 'org1', 'user1', { quantity: -30, reason: 'expired' });

      expect(mockPrisma.adjRequest.create).toHaveBeenCalled();
      expect(mockNotifications.enqueueAdjRequest).toHaveBeenCalled();
      expect(mockPrisma.stockTransaction.create).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 3: Run to verify all fail**

```bash
cd apps/backend && npx jest src/modules/inventory/test --no-coverage 2>&1 | tail -8
```

Expected: FAIL — InventoryService not found.

- [ ] **Step 4: Create inventory.service.ts**

Create `apps/backend/src/modules/inventory/inventory.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '@prisma/client';
import { CreateItemDto } from './dto/create-item.dto';
import { StockInDto } from './dto/stock-in.dto';
import { AdjRequestDto } from './dto/adj-request.dto';
import { ReviewAdjDto } from './dto/review-adj.dto';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async createItem(orgId: string, dto: CreateItemDto) {
    return this.prisma.inventoryItem.create({
      data: { ...dto, organizationId: orgId, lowStockThreshold: dto.lowStockThreshold ?? 10 },
    });
  }

  async listItems(orgId: string, category?: string) {
    return this.prisma.inventoryItem.findMany({
      where: { organizationId: orgId, isActive: true, ...(category ? { category: category as any } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async getLowStockItems(orgId: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: { organizationId: orgId, isActive: true },
    });
    return items.filter((i) => i.currentStock <= i.lowStockThreshold);
  }

  async getTransactionHistory(itemId: string, orgId: string) {
    await this.findItemOrThrow(itemId, orgId);
    return this.prisma.stockTransaction.findMany({
      where: { itemId },
      include: { actor: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async stockIn(itemId: string, orgId: string, actorId: string, dto: StockInDto) {
    const item = await this.findItemOrThrow(itemId, orgId);
    const newStock = item.currentStock + dto.quantity;

    await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id: itemId },
        data: { currentStock: newStock },
      }),
      this.prisma.stockTransaction.create({
        data: {
          itemId, actorId,
          type: dto.type,
          quantity: dto.quantity,
          balanceAfter: newStock,
          donorName: dto.donorName,
          receiptNo: dto.receiptNo,
          unitCost: dto.unitCost,
        },
      }),
    ]);
  }

  async deduct(
    itemId: string,
    qty: number,
    ctx: { actorId: string; type: 'OUT_PRESCRIPTION' | 'OUT_SUPPLY'; patientId?: string; eventId?: string; orgId: string },
  ) {
    const item = await this.findItemOrThrow(itemId, ctx.orgId);
    if (item.currentStock - qty < 0) {
      throw new BadRequestException(`สต็อกไม่พอ (มี ${item.currentStock} หน่วย)`);
    }
    const newStock = item.currentStock - qty;

    await this.prisma.$transaction([
      this.prisma.inventoryItem.update({ where: { id: itemId }, data: { currentStock: newStock } }),
      this.prisma.stockTransaction.create({
        data: {
          itemId, actorId: ctx.actorId,
          type: ctx.type,
          quantity: -qty,
          balanceAfter: newStock,
          patientId: ctx.patientId,
          eventId: ctx.eventId,
        },
      }),
    ]);

    // Low stock check
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

  async requestAdj(itemId: string, orgId: string, actorId: string, dto: AdjRequestDto) {
    const item = await this.findItemOrThrow(itemId, orgId);
    const requester = await this.prisma.user.findUnique({
      where: { id: actorId }, select: { displayName: true },
    });

    const superAdmins = await this.prisma.user.findMany({
      where: { organizationId: orgId, role: UserRole.SUPER_ADMIN, lineUserId: { not: null } },
      select: { lineUserId: true },
    });

    if (Math.abs(dto.quantity) <= 20) {
      // Auto-approve
      const newStock = item.currentStock + dto.quantity;
      await this.prisma.$transaction([
        this.prisma.inventoryItem.update({ where: { id: itemId }, data: { currentStock: newStock } }),
        this.prisma.stockTransaction.create({
          data: {
            itemId, actorId, type: 'ADJ_APPROVED',
            quantity: dto.quantity, balanceAfter: newStock, reason: dto.reason,
          },
        }),
      ]);

      for (const sa of superAdmins) {
        if (sa.lineUserId) {
          await this.notifications.enqueueAdjNotify({
            lineUserId: sa.lineUserId, itemName: item.name,
            qty: dto.quantity, adminName: requester?.displayName ?? 'Admin',
          });
        }
      }
      return { autoApproved: true };
    }

    // Pending approval
    const adj = await this.prisma.adjRequest.create({
      data: { itemId, requestedById: actorId, quantity: dto.quantity, reason: dto.reason },
    });

    for (const sa of superAdmins) {
      if (sa.lineUserId) {
        await this.notifications.enqueueAdjRequest({
          lineUserId: sa.lineUserId, itemName: item.name,
          qty: dto.quantity, adminName: requester?.displayName ?? 'Admin',
          reason: dto.reason, adjId: adj.id,
        });
      }
    }
    return { autoApproved: false, adjId: adj.id };
  }

  async getPendingAdj(orgId: string) {
    return this.prisma.adjRequest.findMany({
      where: { item: { organizationId: orgId }, status: 'PENDING' },
      include: {
        item: { select: { name: true, unit: true } },
        requester: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewAdj(adjId: string, reviewerId: string, orgId: string, dto: ReviewAdjDto) {
    const adj = await this.prisma.adjRequest.findFirst({
      where: { id: adjId, item: { organizationId: orgId }, status: 'PENDING' },
      include: { item: true, requester: { select: { lineUserId: true, displayName: true } } },
    });
    if (!adj) throw new NotFoundException('AdjRequest not found');

    await this.prisma.adjRequest.update({
      where: { id: adjId },
      data: { status: dto.status, reviewedById: reviewerId, reviewNote: dto.reviewNote },
    });

    if (dto.status === 'APPROVED') {
      const newStock = adj.item.currentStock + adj.quantity;
      await this.prisma.$transaction([
        this.prisma.inventoryItem.update({ where: { id: adj.itemId }, data: { currentStock: newStock } }),
        this.prisma.stockTransaction.create({
          data: {
            itemId: adj.itemId, actorId: reviewerId, type: 'ADJ_APPROVED',
            quantity: adj.quantity, balanceAfter: newStock, reason: adj.reason,
          },
        }),
      ]);
    }

    if (adj.requester.lineUserId) {
      await this.notifications.enqueueAdjResult({
        lineUserId: adj.requester.lineUserId, itemName: adj.item.name,
        qty: adj.quantity, approved: dto.status === 'APPROVED', reviewNote: dto.reviewNote,
      });
    }
  }

  private async findItemOrThrow(itemId: string, orgId: string) {
    const item = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, organizationId: orgId, isActive: true },
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }
}
```

- [ ] **Step 5: Run tests**

```bash
cd apps/backend && npx jest src/modules/inventory/test --no-coverage 2>&1 | tail -8
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/inventory/dto/ apps/backend/src/modules/inventory/inventory.service.ts apps/backend/src/modules/inventory/test/
git commit -m "feat: InventoryService — catalog, stockIn, deduct, requestAdj, reviewAdj (TDD)"
```

---

## Task 4: InventoryController + Module + wire app.module.ts

**Files:**
- Create: `apps/backend/src/modules/inventory/inventory.controller.ts`
- Create: `apps/backend/src/modules/inventory/inventory.module.ts`
- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Create inventory.controller.ts**

Create `apps/backend/src/modules/inventory/inventory.controller.ts`:

```typescript
import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, Patch,
  Post, Query, UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateItemDto } from './dto/create-item.dto';
import { StockInDto } from './dto/stock-in.dto';
import { DeductDto } from './dto/deduct.dto';
import { AdjRequestDto } from './dto/adj-request.dto';
import { ReviewAdjDto } from './dto/review-adj.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  listItems(@CurrentUser() user: JwtPayload, @Query('category') category?: string) {
    return this.inventory.listItems(user.orgId, category);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createItem(@Body() dto: CreateItemDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.createItem(user.orgId, dto);
  }

  @Get('low-stock')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getLowStock(@CurrentUser() user: JwtPayload) {
    return this.inventory.getLowStockItems(user.orgId);
  }

  @Get('adj-requests')
  @Roles(UserRole.SUPER_ADMIN)
  getPendingAdj(@CurrentUser() user: JwtPayload) {
    return this.inventory.getPendingAdj(user.orgId);
  }

  @Patch('adj-requests/:id')
  @Roles(UserRole.SUPER_ADMIN)
  reviewAdj(
    @Param('id') id: string,
    @Body() dto: ReviewAdjDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.inventory.reviewAdj(id, user.sub, user.orgId, dto);
  }

  @Get(':id/transactions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getTransactionHistory(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.inventory.getTransactionHistory(id, user.orgId);
  }

  @Post(':id/stock-in')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  stockIn(@Param('id') id: string, @Body() dto: StockInDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.stockIn(id, user.orgId, user.sub, dto);
  }

  @Post(':id/deduct')
  @Roles(UserRole.ADMIN, UserRole.MEDICAL_VOLUNTEER)
  @HttpCode(HttpStatus.OK)
  deduct(@Param('id') id: string, @Body() dto: DeductDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.deduct(id, dto.quantity, {
      actorId: user.sub, type: dto.type,
      patientId: dto.patientId, eventId: dto.eventId, orgId: user.orgId,
    });
  }

  @Post(':id/adj-request')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  requestAdj(@Param('id') id: string, @Body() dto: AdjRequestDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.requestAdj(id, user.orgId, user.sub, dto);
  }
}
```

- [ ] **Step 2: Create inventory.module.ts**

Create `apps/backend/src/modules/inventory/inventory.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
```

- [ ] **Step 3: Wire into app.module.ts**

Open `apps/backend/src/app.module.ts`. Add:
```typescript
import { InventoryModule } from './modules/inventory/inventory.module';
```
Add `InventoryModule` to the `imports` array.

- [ ] **Step 4: TypeScript check + all tests**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -15 && npx jest --no-coverage 2>&1 | tail -5
```

Expected: no errors, all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/inventory/inventory.controller.ts apps/backend/src/modules/inventory/inventory.module.ts apps/backend/src/app.module.ts
git commit -m "feat: InventoryController + InventoryModule wired into app"
```

---

## Task 5: Frontend — /inventory page

**Files:**
- Create: `apps/frontend/src/app/(app)/inventory/page.tsx`

- [ ] **Step 1: Create the inventory page**

Create `apps/frontend/src/app/(app)/inventory/page.tsx`:

```tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Button, Card, Drawer, Form, Input, InputNumber,
  Modal, Segmented, Select, Table, Tag, Typography, message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';

const { Title } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface InventoryItem {
  id: string; name: string; unit: string;
  category: 'DRUG' | 'SUPPLY';
  currentStock: number; lowStockThreshold: number; isActive: boolean;
}

export default function InventoryPage() {
  const { data: session } = useSession();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<'DRUG' | 'SUPPLY'>('DRUG');
  const [stockInOpen, setStockInOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [stockInType, setStockInType] = useState<'IN_PURCHASE' | 'IN_DONATION'>('IN_PURCHASE');
  const [stockInForm] = Form.useForm();
  const [adjForm] = Form.useForm();
  const [addForm] = Form.useForm();

  const headers = useCallback(() => ({
    Authorization: `Bearer ${session?.accessToken ?? ''}`,
    'Content-Type': 'application/json',
  }), [session?.accessToken]);

  const load = useCallback(() => {
    if (!session?.accessToken) return;
    setLoading(true);
    fetch(`${API_URL}/inventory`, { headers: headers() })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setItems(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session?.accessToken, headers]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((i) => i.category === category);

  const columns: ColumnsType<InventoryItem> = [
    {
      title: 'ชื่อรายการ', dataIndex: 'name', key: 'name',
      render: (name, r) => (
        <div>
          <span style={{ fontWeight: 600 }}>{name}</span>
          {r.currentStock <= r.lowStockThreshold && (
            <Tag color="error" style={{ marginLeft: 8, fontSize: 10 }}>ใกล้หมด</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'คงเหลือ', dataIndex: 'currentStock', key: 'currentStock', width: 100,
      render: (n, r) => (
        <span style={{ fontWeight: 700, color: n <= r.lowStockThreshold ? '#ff4d4f' : '#52c41a' }}>
          {n}
        </span>
      ),
    },
    { title: 'หน่วย', dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: '', key: 'actions', width: 200,
      render: (_, r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" onClick={() => { setSelectedItem(r); setStockInOpen(true); }}>รับเข้า</Button>
          <Button size="small" danger onClick={() => { setSelectedItem(r); setAdjOpen(true); }}>ADJ</Button>
        </div>
      ),
    },
  ];

  async function handleStockIn(values: any) {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/inventory/${selectedItem.id}/stock-in`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...values, type: stockInType, quantity: Number(values.quantity) }),
      });
      if (res.ok) {
        message.success('บันทึกการรับเข้าแล้ว');
        setStockInOpen(false); stockInForm.resetFields(); load();
      } else { message.error('เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  async function handleAdj(values: any) {
    if (!selectedItem) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/inventory/${selectedItem.id}/adj-request`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...values, quantity: Number(values.quantity) }),
      });
      if (res.ok) {
        const data = await res.json();
        message.success(data.autoApproved ? 'ปรับสต็อกแล้ว (auto-approve)' : 'ส่งคำขออนุมัติแล้ว');
        setAdjOpen(false); adjForm.resetFields(); load();
      } else { message.error('เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  async function handleAddItem(values: any) {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/inventory`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...values, category }),
      });
      if (res.ok) {
        message.success('เพิ่มรายการแล้ว');
        setAddOpen(false); addForm.resetFields(); load();
      } else { message.error('เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: '#1677ff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
            Inventory
          </div>
          <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>
            คลังยา & เวชภัณฑ์
          </Title>
        </div>
        <Button type="primary" style={{ background: '#722ed1', borderColor: '#722ed1' }}
          onClick={() => setAddOpen(true)}>
          + เพิ่มรายการใหม่
        </Button>
      </div>

      <Card styles={{ body: { padding: '16px 24px' } }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          <Segmented
            options={[{ label: 'ยา (Drug)', value: 'DRUG' }, { label: 'เวชภัณฑ์ (Supply)', value: 'SUPPLY' }]}
            value={category}
            onChange={(v) => setCategory(v as 'DRUG' | 'SUPPLY')}
          />
        </div>
        <Table
          columns={columns} dataSource={filtered} rowKey="id"
          loading={loading} size="middle"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          locale={{ emptyText: 'ยังไม่มีรายการ' }}
          rowClassName={(r) => r.currentStock <= r.lowStockThreshold ? 'bg-red-50' : ''}
        />
      </Card>

      {/* Stock IN Drawer */}
      <Drawer title={`รับเข้า: ${selectedItem?.name}`} open={stockInOpen}
        onClose={() => { setStockInOpen(false); stockInForm.resetFields(); }} width={400}>
        <div style={{ marginBottom: 12 }}>
          <Segmented
            options={[{ label: '🛒 ซื้อ', value: 'IN_PURCHASE' }, { label: '💝 บริจาค', value: 'IN_DONATION' }]}
            value={stockInType}
            onChange={(v) => setStockInType(v as 'IN_PURCHASE' | 'IN_DONATION')}
          />
        </div>
        <Form form={stockInForm} layout="vertical" onFinish={handleStockIn}>
          <Form.Item name="quantity" label="จำนวน" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} addonAfter={selectedItem?.unit} />
          </Form.Item>
          {stockInType === 'IN_PURCHASE' && (
            <>
              <Form.Item name="receiptNo" label="เลขใบเสร็จ">
                <Input placeholder="RX-2568-001" />
              </Form.Item>
              <Form.Item name="unitCost" label="ราคาต่อหน่วย (บาท)">
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
          {stockInType === 'IN_DONATION' && (
            <Form.Item name="donorName" label="ชื่อผู้บริจาค">
              <Input placeholder="บุคคล / องค์กร" />
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" loading={saving} block>บันทึก</Button>
        </Form>
      </Drawer>

      {/* ADJ Modal */}
      <Modal title={`ปรับสต็อก: ${selectedItem?.name}`} open={adjOpen}
        onCancel={() => { setAdjOpen(false); adjForm.resetFields(); }} footer={null}>
        <Form form={adjForm} layout="vertical" onFinish={handleAdj}>
          <Form.Item name="quantity" label="จำนวน (บวก = เพิ่ม, ลบ = ลด)"
            rules={[{ required: true }, { validator: (_, v) => v !== 0 ? Promise.resolve() : Promise.reject('ต้องไม่เป็น 0') }]}>
            <InputNumber style={{ width: '100%' }} addonAfter={selectedItem?.unit} />
          </Form.Item>
          <Form.Item name="reason" label="เหตุผล" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="เช่น ยาหมดอายุ, สต็อกผิดพลาด" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>ส่งคำขอ</Button>
        </Form>
      </Modal>

      {/* Add Item Modal */}
      <Modal title="เพิ่มรายการใหม่" open={addOpen}
        onCancel={() => { setAddOpen(false); addForm.resetFields(); }} footer={null}>
        <Form form={addForm} layout="vertical" onFinish={handleAddItem}
          initialValues={{ category, lowStockThreshold: 10 }}>
          <Form.Item name="name" label="ชื่อรายการ" rules={[{ required: true }]}>
            <Input placeholder="เช่น Metformin 500mg" />
          </Form.Item>
          <Form.Item name="unit" label="หน่วย" rules={[{ required: true }]}>
            <Input placeholder="เม็ด / ขวด / ชิ้น" />
          </Form.Item>
          <Form.Item name="category" label="ประเภท">
            <Select options={[{ value: 'DRUG', label: 'ยา (Drug)' }, { value: 'SUPPLY', label: 'เวชภัณฑ์ (Supply)' }]} />
          </Form.Item>
          <Form.Item name="lowStockThreshold" label="แจ้งเตือนเมื่อสต็อกต่ำกว่า">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>เพิ่มรายการ</Button>
        </Form>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check + build**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -10
cd apps/frontend && npm run build 2>&1 | grep -E "error|✓ Compiled" | head -5
```

Expected: no errors, `✓ Compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/\(app\)/inventory/page.tsx
git commit -m "feat(ui): /inventory page — drug/supply list + stock IN drawer + ADJ modal"
```

---

## Task 6: Frontend — /inventory/approvals + Sidebar update

**Files:**
- Create: `apps/frontend/src/app/(app)/inventory/approvals/page.tsx`
- Modify: `apps/frontend/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create approvals page**

Create `apps/frontend/src/app/(app)/inventory/approvals/page.tsx`:

```tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Card, Input, Tag, Typography, message } from 'antd';

const { Title, Text } = Typography;
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface AdjRequest {
  id: string;
  quantity: number;
  reason: string;
  createdAt: string;
  item: { name: string; unit: string };
  requester: { displayName: string };
}

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<AdjRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const headers = useCallback(() => ({
    Authorization: `Bearer ${session?.accessToken ?? ''}`,
    'Content-Type': 'application/json',
  }), [session?.accessToken]);

  const load = useCallback(() => {
    if (!session?.accessToken) return;
    fetch(`${API_URL}/inventory/adj-requests`, { headers: headers() })
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setRequests(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session?.accessToken, headers]);

  useEffect(() => { load(); }, [load]);

  async function handleReview(id: string, status: 'APPROVED' | 'REJECTED') {
    setProcessing(id);
    try {
      const res = await fetch(`${API_URL}/inventory/adj-requests/${id}`, {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ status, reviewNote: reviewNotes[id] ?? '' }),
      });
      if (res.ok) {
        message.success(status === 'APPROVED' ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว');
        load();
      } else { message.error('เกิดข้อผิดพลาด'); }
    } catch { message.error('เกิดข้อผิดพลาด'); }
    finally { setProcessing(null); }
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: '#722ed1', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>
          Inventory · Approvals
        </div>
        <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -1 }}>
          รออนุมัติ ADJ
        </Title>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>กำลังโหลด…</div>
      ) : requests.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>ไม่มีคำขอรออนุมัติ</div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map((req) => (
            <Card key={req.id} styles={{ body: { padding: 16 } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <Text style={{ fontWeight: 700, fontSize: 14 }}>{req.item.name}</Text>
                  <Tag color={req.quantity > 0 ? 'success' : 'error'} style={{ marginLeft: 8 }}>
                    {req.quantity > 0 ? `+${req.quantity}` : req.quantity} {req.item.unit}
                  </Tag>
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {new Date(req.createdAt).toLocaleDateString('th-TH')}
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                เหตุผล: {req.reason}
              </Text>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 10 }}>
                ขอโดย: {req.requester.displayName}
              </Text>
              <Input
                placeholder="หมายเหตุ (ถ้ามี)"
                size="small"
                value={reviewNotes[req.id] ?? ''}
                onChange={(e) => setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                style={{ marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  type="primary"
                  size="small"
                  style={{ flex: 1, background: '#52c41a', borderColor: '#52c41a' }}
                  loading={processing === req.id}
                  onClick={() => handleReview(req.id, 'APPROVED')}
                >
                  ✓ อนุมัติ
                </Button>
                <Button
                  danger size="small" style={{ flex: 1 }}
                  loading={processing === req.id}
                  onClick={() => handleReview(req.id, 'REJECTED')}
                >
                  ✕ ปฏิเสธ
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add คลังยา to Sidebar**

Open `apps/frontend/src/components/layout/Sidebar.tsx`. Read the file first.

The `items` array currently has 4 entries. Update the component to add a conditional "คลังยา" item for ADMIN and SUPER_ADMIN roles:

Replace the static `items` const with a dynamic one inside the component:

```tsx
// Remove the static `items` const at the top level
// Inside the Sidebar component, after the useSession line, add:

const role: string = (session as any)?.role ?? '';
const navItems: MenuProps['items'] = [
  { key: '/dashboard', label: 'Dashboard',       icon: <LayoutDashboard size={ICON_SIZE} /> },
  { key: '/patients',  label: 'ผู้ป่วย',         icon: <Users size={ICON_SIZE} /> },
  { key: '/events',    label: 'แผนการเยี่ยม',    icon: <CalendarDays size={ICON_SIZE} /> },
  { key: '/forms',     label: 'แบบฟอร์ม',        icon: <FileText size={ICON_SIZE} /> },
  ...(role === 'ADMIN' || role === 'SUPER_ADMIN'
    ? [{ key: '/inventory', label: 'คลังยา', icon: <Package size={ICON_SIZE} /> }]
    : []),
];
```

Add `Package` to the lucide-react import:
```tsx
import { LayoutDashboard, Users, CalendarDays, FileText, LogOut, Package } from 'lucide-react';
```

Replace `items` with `navItems` in the `Menu` component's `items` prop and in `selectedKey` calculation.

- [ ] **Step 3: TypeScript check + build**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | head -10
cd apps/frontend && npm run build 2>&1 | grep -E "error|✓ Compiled" | head -5
```

Expected: no errors, `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/\(app\)/inventory/ apps/frontend/src/components/layout/Sidebar.tsx
git commit -m "feat(ui): /inventory/approvals SA queue + Sidebar คลังยา nav item"
```

---

## Self-Review

**Spec coverage:**
- ✅ `SUPER_ADMIN` + `MEDICAL_VOLUNTEER` UserRole → Task 1
- ✅ `InventoryItem`, `StockTransaction`, `AdjRequest` + enums → Task 1
- ✅ 4 LINE push methods + notifications job types → Task 2
- ✅ `createItem`, `listItems`, `getLowStockItems`, `getTransactionHistory` → Task 3
- ✅ `stockIn` (IN_PURCHASE/IN_DONATION, unitCost stored for F05) → Task 3
- ✅ `deduct()` atomic with bad-request guard + low-stock alert → Task 3
- ✅ `requestAdj()` auto-approve ≤20 / pending >20 → Task 3
- ✅ `reviewAdj()` APPROVED creates StockTransaction + notify → Task 3
- ✅ All 9 endpoints with correct role guards → Task 4
- ✅ `/inventory` page tabs DRUG/SUPPLY + Stock IN Drawer + ADJ Modal → Task 5
- ✅ `/inventory/approvals` SA queue with approve/reject → Task 6
- ✅ Sidebar conditional คลังยา item for ADMIN/SA → Task 6

**Type consistency:**
- `deduct()` signature: `(itemId, qty, ctx: { actorId, type, patientId?, eventId?, orgId })` consistent between service + controller ✅
- `AdjRequestDto.quantity` is plain `Int` (can be negative) — service stores directly ✅
- `StockTransaction.quantity` for OUT is stored as negative (`-qty`) — consistent ✅

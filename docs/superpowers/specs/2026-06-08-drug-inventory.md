# Drug & Medical Supply Inventory — Spec

**Date:** 2026-06-08
**Status:** Approved
**Sub-system:** 3 of 7 (CareLink journey map) — built before Sub-system 2 (Mobile Clinic) so MC can call `inventory.deduct()`

## Goal

Manage a per-organisation drug and medical supply catalog. Track every stock movement (IN, OUT, ADJ) in a single `StockTransaction` table. Expose a `deduct()` API for Mobile Clinic to call when prescribing. ADJ > 20 units requires SUPER_ADMIN approval via LINE notification + web dashboard.

## Approach

Single `inventory` NestJS module. All movements (purchase, donation, prescription, supply-use, adjustment) stored as `StockTransaction` rows. `currentStock` on `InventoryItem` is a denormalised running total updated atomically with each transaction via Prisma `$transaction`.

---

## Schema Changes

### UserRole enum — 2 new values

```prisma
enum UserRole {
  ADMIN
  CASE_MANAGER
  FIELD_WORKER
  SUPER_ADMIN        // ← ใหม่ — อนุมัติ ADJ ขนาดใหญ่
  MEDICAL_VOLUNTEER  // ← ใหม่ — ใช้ใน MC Sub-system 2
}
```

### New models

```prisma
enum InventoryCategory {
  DRUG    // ยา — จ่ายโดยหมออาสา
  SUPPLY  // เวชภัณฑ์ — ใช้โดยพยาบาล
}

model InventoryItem {
  id                String            @id @default(uuid())
  organizationId    String
  organization      Organization      @relation(fields: [organizationId], references: [id])
  name              String
  unit              String            // เม็ด / ขวด / ชิ้น
  category          InventoryCategory
  currentStock      Int               @default(0)
  lowStockThreshold Int               @default(10)
  isActive          Boolean           @default(true)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  transactions  StockTransaction[]
  adjRequests   AdjRequest[]
}

enum TransactionType {
  IN_PURCHASE       // ซื้อ — บันทึก unitCost → F05
  IN_DONATION       // บริจาค — ไม่นับค่าใช้จ่าย
  OUT_PRESCRIPTION  // หมออาสาจ่ายยา (patientId required)
  OUT_SUPPLY        // พยาบาลใช้เวชภัณฑ์ (patientId required)
  ADJ_APPROVED      // ปรับสต็อก (approved — บวกหรือลบ)
}

model StockTransaction {
  id           String          @id @default(uuid())
  itemId       String
  item         InventoryItem   @relation(fields: [itemId], references: [id])
  type         TransactionType
  quantity     Int             // บวก = เพิ่ม, ลบ = ลด
  balanceAfter Int             // currentStock หลัง transaction
  patientId    String?         // สำหรับ OUT_*
  eventId      String?         // MC event ID (Sub-system 2)
  actorId      String
  actor        User            @relation(fields: [actorId], references: [id])
  donorName    String?         // IN_DONATION
  receiptNo    String?         // IN_PURCHASE
  unitCost     Float?          // IN_PURCHASE → F05
  reason       String?         // ADJ_APPROVED
  createdAt    DateTime        @default(now())
}

enum AdjStatus {
  PENDING
  APPROVED
  REJECTED
}

model AdjRequest {
  id           String        @id @default(uuid())
  itemId       String
  item         InventoryItem @relation(fields: [itemId], references: [id])
  requestedById String
  requester    User          @relation("AdjRequester", fields: [requestedById], references: [id])
  quantity     Int           // บวก หรือ ลบ
  reason       String
  status       AdjStatus     @default(PENDING)
  reviewedById String?
  reviewer     User?         @relation("AdjReviewer", fields: [reviewedById], references: [id])
  reviewNote   String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}
```

`Organization` model เพิ่ม: `inventoryItems InventoryItem[]`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `apps/backend/prisma/schema.prisma` | UserRole + 4 new models |
| Migrate | via `prisma migrate dev` | |
| Create | `apps/backend/src/modules/inventory/inventory.module.ts` | |
| Create | `apps/backend/src/modules/inventory/inventory.service.ts` | Business logic |
| Create | `apps/backend/src/modules/inventory/inventory.controller.ts` | REST endpoints |
| Create | `apps/backend/src/modules/inventory/dto/create-item.dto.ts` | |
| Create | `apps/backend/src/modules/inventory/dto/stock-in.dto.ts` | |
| Create | `apps/backend/src/modules/inventory/dto/deduct.dto.ts` | |
| Create | `apps/backend/src/modules/inventory/dto/adj-request.dto.ts` | |
| Create | `apps/backend/src/modules/inventory/dto/review-adj.dto.ts` | |
| Create | `apps/backend/src/modules/inventory/test/inventory.service.spec.ts` | TDD |
| Modify | `apps/backend/src/app.module.ts` | import InventoryModule |
| Create | `apps/frontend/src/app/(app)/inventory/page.tsx` | List + tabs |
| Create | `apps/frontend/src/app/(app)/inventory/approvals/page.tsx` | SA approval queue |

---

## Backend

### InventoryService methods

```typescript
// Catalog
createItem(orgId, dto): InventoryItem
listItems(orgId, category?): InventoryItem[]

// Stock IN
stockIn(itemId, orgId, actorId, dto: {
  quantity: number;
  type: 'IN_PURCHASE' | 'IN_DONATION';
  donorName?: string;
  receiptNo?: string;
  unitCost?: number;
}): StockTransaction
// Note: IN_PURCHASE with unitCost → create StockTransaction with receiptNo/unitCost (F05 reads this in Sub-system 6)

// Stock OUT (for MC)
deduct(itemId, qty, ctx: {
  patientId?: string;
  eventId?: string;
  actorId: string;
  type: 'OUT_PRESCRIPTION' | 'OUT_SUPPLY';
}): StockTransaction
// Guard: if currentStock - qty < 0 → throw BadRequestException('สต็อกไม่พอ')
// Atomic: prisma.$transaction([update currentStock, create StockTransaction])

// ADJ
requestAdj(itemId, orgId, actorId, dto: { quantity: number; reason: string }): AdjRequest | StockTransaction
// ≤ 20 abs(qty): auto-approve → create StockTransaction(ADJ_APPROVED) + LINE notify SA (FYI)
// > 20 abs(qty): create AdjRequest(PENDING) + LINE notify SA (approval required)

reviewAdj(adjId, reviewerId, dto: { status: 'APPROVED' | 'REJECTED'; reviewNote?: string })
// APPROVED: create StockTransaction(ADJ_APPROVED) + update currentStock + LINE notify requester
// REJECTED: LINE notify requester with reviewNote

// Queries
getTransactionHistory(itemId, orgId): StockTransaction[]
getPendingAdj(orgId): AdjRequest[]
getLowStockItems(orgId): InventoryItem[]  // currentStock <= lowStockThreshold
```

### Endpoints

| Method | Path | Guards | Description |
|--------|------|--------|-------------|
| GET | `/inventory` | JWT + ADMIN\|SA | รายการ items |
| POST | `/inventory` | JWT + ADMIN\|SA | สร้าง item |
| GET | `/inventory/low-stock` | JWT + ADMIN\|SA | ใกล้หมด |
| GET | `/inventory/:id/transactions` | JWT + ADMIN\|SA | ประวัติ |
| POST | `/inventory/:id/stock-in` | JWT + ADMIN | รับเข้า |
| POST | `/inventory/:id/deduct` | JWT + ADMIN\|MEDICAL_VOLUNTEER | หักสต็อก |
| POST | `/inventory/:id/adj-request` | JWT + ADMIN | ขออนุมัติ ADJ |
| GET | `/inventory/adj-requests` | JWT + SUPER_ADMIN | รายการรออนุมัติ |
| PATCH | `/inventory/adj-requests/:id` | JWT + SUPER_ADMIN | approve/reject |

### LINE Notifications (via NotificationsService)

เพิ่ม job types ใหม่ใน Bull queue:

| Job | Recipient | Trigger |
|-----|-----------|---------|
| `send-adj-notify` | SA (FYI) | ADJ ≤ 20 auto-approved |
| `send-adj-request` | SA | ADJ > 20 pending approval |
| `send-adj-result` | Admin requester | SA approved/rejected |
| `send-low-stock` | ADMIN | currentStock <= threshold หลัง OUT |

เพิ่มใน `LineService`: `pushAdjNotify`, `pushAdjRequest`, `pushAdjResult`, `pushLowStock`

---

## Frontend

### `/inventory` (server component, ADMIN + SUPER_ADMIN only)

- Fetch `GET /inventory` server-side
- antd `Tabs` แยก DRUG / SUPPLY
- แต่ละ tab: antd `Table` columns: ชื่อ, คงเหลือ (สีแดงถ้า ≤ threshold), หน่วย, ปุ่มดูประวัติ
- ปุ่ม "รับเข้า" → antd `Drawer` แบบ `StockInDrawer` (client component)
  - Toggle ซื้อ/บริจาค
  - ถ้าซื้อ: fields receiptNo + unitCost + preview ยอดรวม
- ปุ่ม "ปรับสต็อก (ADJ)" → antd `Modal` (client component)
- ปุ่ม "+ เพิ่มรายการใหม่" → antd `Modal`

### `/inventory/approvals` (client component, SUPER_ADMIN only)

- Fetch `GET /inventory/adj-requests` client-side via `useSession`
- แต่ละ row: ชื่อยา + qty ± + reason + Admin ผู้ขอ + วันที่
- ปุ่ม "อนุมัติ" (เขียว) / "ปฏิเสธ" (แดง) → PATCH + refresh
- Redirect `/login` ถ้า role ≠ SUPER_ADMIN

### Sidebar navigation

เพิ่ม menu item "คลังยา" ใน `Sidebar.tsx` สำหรับ ADMIN และ SUPER_ADMIN เท่านั้น (conditional render ตาม session role)

---

## Out of Scope

- Drug expiry date tracking (เพิ่มได้ทีหลังเป็น field บน InventoryItem)
- Barcode/QR scan สำหรับ drug IN
- Multi-location stock (ระบบมี 1 org = 1 คลัง)
- F05 financial report UI (ข้อมูลเก็บไว้แล้วใน StockTransaction.unitCost — Sub-system 6 จะ build UI)
